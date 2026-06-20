// 単一の WebGL 描画領域の土台（Issue #8）。レンダラ・透視投影カメラ・霧・画素密度上限・リサイズを持つ。
// 状態を読んで描く「ビュー」であり、判定・得点・時刻の論理を持たない（依存規則 docs/decisions/architecture.md §5）。
// profiles・tools は import しない。後続の反射(#9)・発光点(#10)・層合成(#15)はこの土台へ積み上げる。

import { Color, FogExp2, PerspectiveCamera, Scene, Vector2, WebGLRenderer } from "three";
import {
  CAMERA_FAR,
  CAMERA_FOV,
  CAMERA_NEAR,
  DEFAULT_REFLECTION_RESOLUTION,
  FOG_DENSITY,
  MAX_PIXEL_RATIO,
  NIGHT_COLOR,
  NIGHT_COLOR_HEX,
} from "./constants";
import { createPlaceholderGlow, type PlaceholderGlow } from "./placeholderGlow";
import { clampPixelRatio, computeAspect } from "./viewport";
import { createWater, type Water } from "./water";

// 暫定カメラ視点（Issue #9）。カメラ軌跡本実装（Issue #13）で置換する暫定の固定視点である。
// 採用理由を先に述べる。土台のカメラは原点・回転なしで湖面と発光点を画面に収めず、本編で映り込みを
// 目視できない。カメラ軌跡の本実装までの暫定として、湖面を見下ろす固定の一点を置く。
// 視点は水面より上に置く。理由を先に述べる。Reflector はカメラが反射面の裏側（水面下）にあると反射を
// 描かないため、暫定視点を水面（高さ0）より上に固定する。
const PLACEHOLDER_CAMERA_POSITION = { x: 0, y: 14, z: 34 } as const;
const PLACEHOLDER_CAMERA_TARGET = { x: 0, y: 1, z: 0 } as const;

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
  /** 平面反射が有効か。反射水面を Reflector で作ったとき真、refl=0 の不透明な面と WebGL 不可のとき偽。 */
  reflectionEnabled: boolean;
  /** 反射が有効なときの一辺の画素数。無効・WebGL 不可のとき0。 */
  reflectionResolution: number;
}

/** 描画基盤の外部契約。 */
export interface RenderRoot {
  /** 1フレーム描く。WebGL が無い端末では何もしない。 */
  render(): void;
  /** 表示寸法の変更を反映する（カメラ縦横比とレンダラ寸法・画素密度）。 */
  resize(width: number, height: number): void;
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
 * options.reflectionResolution は反射解像度（0で無効、256または512で有効）。採用理由を先に述べる。
 * 省略可・既定512にすることで、引数1個の既存の呼び出しとの互換を保つ。
 */
export function createRenderRoot(
  container: HTMLElement,
  options: { reflectionResolution?: number } = {}
): RenderRoot {
  const reflectionResolution = options.reflectionResolution ?? DEFAULT_REFLECTION_RESOLUTION;

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

  // 反射水面と暫定発光点は、描画器を生成できたときだけ作りシーンへ追加する。採用理由を先に述べる。
  // 描画器が無い端末では描画しないため資源を作らず、縮退の状態（reflectionEnabled 偽・解像度0）を
  // この分岐の構造で保証する（描画器が null のとき water は null のままになる）。
  let water: Water | null = null;
  let placeholderGlow: PlaceholderGlow | null = null;
  if (renderer) {
    water = createWater({ reflectionResolution });
    scene.add(water.object3d);
    // 暫定発光点（Issue #10 で発光点本実装へ置換）。反射に映る対象として置く。
    placeholderGlow = createPlaceholderGlow();
    scene.add(placeholderGlow.object3d);
    // 暫定カメラ視点（Issue #13 で置換）。湖面と発光点を画面に収め、映り込みを目視できるようにする。
    camera.position.set(
      PLACEHOLDER_CAMERA_POSITION.x,
      PLACEHOLDER_CAMERA_POSITION.y,
      PLACEHOLDER_CAMERA_POSITION.z
    );
    camera.lookAt(
      PLACEHOLDER_CAMERA_TARGET.x,
      PLACEHOLDER_CAMERA_TARGET.y,
      PLACEHOLDER_CAMERA_TARGET.z
    );
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
      return {
        webglAvailable: renderer !== null,
        pixelRatio: renderer ? renderer.getPixelRatio() : 0,
        drawingBufferWidth: bufferSize ? bufferSize.x : 0,
        drawingBufferHeight: bufferSize ? bufferSize.y : 0,
        clearColorHex,
        cameraAspect: camera.aspect,
        // 反射水面を作っていればその有効・解像度を返す。作っていない（WebGL 不可）なら無効・0。
        reflectionEnabled: water ? water.reflective : false,
        reflectionResolution: water ? water.reflectionResolution : 0,
      };
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      window.removeEventListener("resize", handleResize);
      // 反射水面と暫定発光点を、描画器の破棄より前に解放する。
      if (water) {
        scene.remove(water.object3d);
        water.dispose();
        water = null;
      }
      if (placeholderGlow) {
        scene.remove(placeholderGlow.object3d);
        placeholderGlow.dispose();
        placeholderGlow = null;
      }
      if (renderer) {
        renderer.dispose();
        renderer.domElement.remove();
        renderer = null;
      }
    },
  };
}
