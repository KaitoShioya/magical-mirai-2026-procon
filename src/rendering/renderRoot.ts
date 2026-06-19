// 単一の WebGL 描画領域の土台（Issue #8）。レンダラ・透視投影カメラ・霧・画素密度上限・リサイズを持つ。
// 状態を読んで描く「ビュー」であり、判定・得点・時刻の論理を持たない（依存規則 docs/decisions/architecture.md §5）。
// profiles・tools は import しない。後続の反射(#9)・発光点(#10)・層合成(#15)はこの土台へ積み上げる。

import { Color, FogExp2, PerspectiveCamera, Scene, Vector2, Vector3, WebGLRenderer } from "three";
import type { Vec3Like } from "../utils/cameraTrajectory";
import {
  CAMERA_FAR,
  CAMERA_FOV,
  CAMERA_NEAR,
  FOG_DENSITY,
  MAX_PIXEL_RATIO,
  NIGHT_COLOR,
  NIGHT_COLOR_HEX,
} from "./constants";
import { clampPixelRatio, computeAspect } from "./viewport";

/** 診断・検証用の描画状態（window.__renderState が返す素の構造）。 */
export interface RenderState {
  /** WebGL の描画文脈を生成できたなら真。生成に失敗した端末では偽になり描画は何もしない。 */
  webglAvailable: boolean;
  /** 実際に適用した画素密度の倍率。 */
  pixelRatio: number;
  /** 描画バッファの画素幅・画素高（表示寸法×画素密度倍率を three.js が切り捨てた値）。 */
  drawingBufferWidth: number;
  drawingBufferHeight: number;
  /** 設定したクリアカラーの16進表現。深夜色 NIGHT_COLOR と一致する。 */
  clearColorHex: string;
  /** 透視投影カメラの縦横比。 */
  cameraAspect: number;
  /** 現在のカメラ位置（setCameraPose 適用後）。診断・検証で読む。 */
  cameraPosition: { x: number; y: number; z: number };
  /** 現在のカメラの前方向き（単位ベクトル）。lookAt の適用を診断・検証で確かめる。 */
  cameraDirection: { x: number; y: number; z: number };
  /** setCameraPose が適用を拒否した累積回数（位置と注視点が同一・非有限値）。無音の不具合を診断・検証で検出する。 */
  cameraPoseRejectedCount: number;
}

/** 描画基盤の外部契約。 */
export interface RenderRoot {
  /** 1フレーム描く。WebGL が無い端末では何もしない。 */
  render(): void;
  /** 表示寸法の変更を反映する（カメラ縦横比とレンダラ寸法・画素密度）。 */
  resize(width: number, height: number): void;
  /** カメラの位置と注視点（ワールド座標）を設定する。適用できたら true、位置と注視点が同一または
   *  非有限値で適用しなかったら false を返す。演出カメラ軌跡（#13）が毎フレーム駆動する。戻り値で
   *  下流（#59）が適用失敗を検知でき、無音の不具合を避ける。WebGL無効時もカメラ物体は存在するため反映する。 */
  setCameraPose(position: Vec3Like, target: Vec3Like): boolean;
  /** 診断・検証用の現在状態を返す。 */
  state(): RenderState;
  /** 後始末。リサイズ待ち受けの解除・GPU資源の解放・canvas の取り外しを行う。冪等。 */
  dispose(): void;
}

/**
 * WebGL2 の描画文脈を生成できるかを事前に確かめる。
 * 採用理由を先に述べる。three.js（0.184）の WebGLRenderer は WebGL2 の文脈のみを要求し（r163 以降 WebGL1 は
 * 非対応で例外を投げる）、文脈生成に失敗すると内部で console.error を出してから例外を投げる。既存スモーク
 * （scripts/screens-smoke.mjs・scripts/engine-loop-smoke.mjs）は console のエラー出力を失敗として収集するため、
 * 生成不可の端末では WebGLRenderer を呼ぶ前にここで判定し、three.js 内部のエラー出力を回避する。
 * 判定に使った文脈は明示的に解放し、端末ごとの文脈数の上限を圧迫しない。
 */
function isWebGL2Available(): boolean {
  try {
    const probeCanvas = document.createElement("canvas");
    const probeContext = probeCanvas.getContext("webgl2");
    if (probeContext === null) {
      return false;
    }
    probeContext.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/**
 * 描画基盤を生成し、container に canvas を載せて初期寸法で1回描く。
 * 表示寸法は window の内寸（innerWidth・innerHeight）に追従する。
 * WebGL の生成に失敗しても例外を投げず、描画を無効化して他層（エンジン・画面）の動作を妨げない。
 */
export function createRenderRoot(container: HTMLElement): RenderRoot {
  const scene = new Scene();
  scene.background = new Color(NIGHT_COLOR);
  scene.fog = new FogExp2(NIGHT_COLOR, FOG_DENSITY);

  const camera = new PerspectiveCamera(
    CAMERA_FOV,
    computeAspect(window.innerWidth, window.innerHeight),
    CAMERA_NEAR,
    CAMERA_FAR
  );

  // 画素密度の倍率を保持する。採用理由を先に述べる。three.js の setPixelRatio は内部で setSize を呼ぶため、
  // リサイズのたびに setPixelRatio を呼ぶと描画バッファの再確保が二重に走る。倍率が変わったときだけ
  // setPixelRatio を呼ぶよう、現在値を保持して比較する。
  let currentPixelRatio = clampPixelRatio(window.devicePixelRatio, MAX_PIXEL_RATIO);

  let renderer: WebGLRenderer | null = null;
  if (isWebGL2Available()) {
    // 生成と初期化を一時変数で受け、すべて成功してから renderer へ確定する。採用理由を先に述べる。
    // 初期化の途中（setClearColor・setPixelRatio・setSize・appendChild）で例外が出た場合に、
    // 生成済みの GPU 資源を明示的に破棄するため、確定前の参照を catch から辿れるようにする
    // （docs/decisions/architecture.md §3.5 の明示破棄方針）。
    let created: WebGLRenderer | null = null;
    try {
      created = new WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
      created.setClearColor(NIGHT_COLOR, 1);
      created.setPixelRatio(currentPixelRatio);
      created.setSize(window.innerWidth, window.innerHeight);
      container.appendChild(created.domElement);
      renderer = created;
    } catch (error) {
      // WebGL2 は使えても生成中に別の問題が起きた場合の防御。描画だけ無効化し、アプリ全体は動かす。
      // 生成済みなら GPU 資源を破棄し、追加済みの canvas を取り外す（未追加なら remove は無害）。
      if (created) {
        created.dispose();
        created.domElement.remove();
      }
      renderer = null;
      // console.warn を使う理由は isWebGL2Available の説明と同じ（既存スモークはエラー出力のみ失敗収集する）。
      console.warn("WebGL の描画文脈の生成中に問題が発生しました。描画を無効化します。", error);
    }
  } else {
    // WebGL2 を生成できない端末。three.js の WebGLRenderer を呼ぶ前に縮退させ、内部のエラー出力を避ける。
    // 縮退の事実は診断状態 webglAvailable=false で表面化し、スモークはそこから明示的に判定する。
    console.warn("この環境では WebGL2 を利用できません。描画を無効化します。");
  }

  let disposed = false;

  function resize(width: number, height: number): void {
    camera.aspect = computeAspect(width, height);
    camera.updateProjectionMatrix();
    if (renderer) {
      const nextPixelRatio = clampPixelRatio(window.devicePixelRatio, MAX_PIXEL_RATIO);
      // 画素密度が変わったときだけ setPixelRatio を呼ぶ。理由を先に述べる。setPixelRatio は内部で setSize を
      // 呼ぶため、毎回呼ぶと続く setSize と合わせて描画バッファの再確保が二重に走る。変化時のみに限って避ける。
      if (nextPixelRatio !== currentPixelRatio) {
        currentPixelRatio = nextPixelRatio;
        renderer.setPixelRatio(nextPixelRatio);
      }
      renderer.setSize(width, height);
    }
  }

  function handleResize(): void {
    resize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener("resize", handleResize);

  // setCameraPose が適用を拒否した累積回数。診断・検証で無音の不具合を検出するために数える。
  let cameraPoseRejectedCount = 0;

  // 防御的処理の理由を先に述べる。位置と注視点が同一、または非有限値だと lookAt の向きが定まらず
  // カメラ姿勢が壊れる。いずれの場合も姿勢を変更せず（前フレームの姿勢を保ち）、拒否を数えて false を返す。
  function isFiniteVec(v: Vec3Like): boolean {
    return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
  }

  function setCameraPose(position: Vec3Like, target: Vec3Like): boolean {
    if (
      !isFiniteVec(position) ||
      !isFiniteVec(target) ||
      (position.x === target.x && position.y === target.y && position.z === target.z)
    ) {
      cameraPoseRejectedCount += 1;
      return false;
    }
    camera.position.set(position.x, position.y, position.z);
    camera.lookAt(target.x, target.y, target.z);
    return true;
  }

  function render(): void {
    if (!renderer || disposed) {
      return;
    }
    renderer.render(scene, camera);
  }

  // 起動直後にクリアカラーを適用するため、ループの初回フレームを待たず1回描く。
  render();

  return {
    render,
    setCameraPose,
    resize,
    state(): RenderState {
      // 採用理由を先に述べる。three.js の色管理は16進数をsRGBとして取り込み、getHexString(sRGB既定)で
      // sRGBへ戻すため、setClearColor で設定した値と読み戻し値が一致する。これにより設定が実際に
      // 適用されたことを確認できる。
      const clearColorHex = renderer
        ? renderer.getClearColor(new Color()).getHexString()
        : NIGHT_COLOR_HEX;
      // 描画バッファ寸法は three.js 公式の getDrawingBufferSize で取る。採用理由を先に述べる。
      // setSize は表示寸法×画素密度倍率を Math.floor して描画バッファへ設定するため、その確定値を
      // 公式関数から読むのが内部実装の変更に最も強い。
      const bufferSize = renderer ? renderer.getDrawingBufferSize(new Vector2()) : null;
      const direction = camera.getWorldDirection(new Vector3());
      return {
        webglAvailable: renderer !== null,
        pixelRatio: renderer ? renderer.getPixelRatio() : 0,
        drawingBufferWidth: bufferSize ? bufferSize.x : 0,
        drawingBufferHeight: bufferSize ? bufferSize.y : 0,
        clearColorHex,
        cameraAspect: camera.aspect,
        cameraPosition: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
        cameraDirection: { x: direction.x, y: direction.y, z: direction.z },
        cameraPoseRejectedCount,
      };
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      window.removeEventListener("resize", handleResize);
      if (renderer) {
        renderer.dispose();
        renderer.domElement.remove();
        renderer = null;
      }
    },
  };
}
