// 単一の WebGL 描画領域の土台（Issue #8）。レンダラ・透視投影カメラ・霧・画素密度上限・リサイズを持つ。
// 状態を読んで描く「ビュー」であり、判定・得点・時刻の論理を持たない（依存規則 docs/decisions/architecture.md §5）。
// profiles・tools は import しない。後続の反射(#9)・発光点(#10)・層合成(#15)はこの土台へ積み上げる。

import {
  Color,
  FogExp2,
  NoToneMapping,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import type { Vec3Like } from "../utils/cameraTrajectory";
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
import { createBloomComposer, type BloomComposer, type BloomState } from "./bloom";
import { createNightLighting, type NightLighting } from "./lighting";
import {
  createCenterFigure,
  type CenterFigure,
  type CenterFigureStatus,
} from "./entities/centerFigure";
import { loadVrm } from "./loaders/vrmLoader";
import type { CharacterModelConfig } from "../types/character";
import { createOverlayLayer, type OverlayLayer } from "./overlay";
import type { Object3D } from "three";

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
  /** 現在のカメラ位置（setCameraPose 適用後）。診断・検証で読む。 */
  cameraPosition: { x: number; y: number; z: number };
  /** 現在のカメラの前方向き（単位ベクトル）。lookAt の適用を診断・検証で確かめる。 */
  cameraDirection: { x: number; y: number; z: number };
  /** setCameraPose が適用を拒否した累積回数（位置と注視点が同一・非有限値）。無音の不具合を診断・検証で検出する。 */
  cameraPoseRejectedCount: number;
  /** 平面反射が有効か。反射水面を Reflector で作ったとき真、refl=0 の不透明な面と WebGL 不可のとき偽。 */
  reflectionEnabled: boolean;
  /** 反射が有効なときの一辺の画素数。無効・WebGL 不可のとき0。 */
  reflectionResolution: number;
  /** ブルーム後処理の状態（Issue #11）。WebGL が無く合成を生成しない端末では null。 */
  bloom: BloomState | null;
  /** 中心オブジェクト（Issue #64）の表示状態。fallback=光柱、loaded=VRM、error=読み込み失敗で光柱を継続。
   *  WebGL が無く中心オブジェクトを作らない端末でも、診断の値としては fallback を返す。 */
  centerFigureStatus: CenterFigureStatus;
  /** 中心オブジェクトのVRM読み込みが失敗したときの短い理由（無ければ null）。無音の不具合を診断・検証で検出する。 */
  centerFigureError: string | null;
  /** 2次元層（Issue #15）の状態。載っている表示物の数と正射影カメラの視錐台（左・右・上・下）を返す。
   *  WebGL が無く2次元層を作らない端末では null。 */
  overlay: {
    objectCount: number;
    frustumLeft: number;
    frustumRight: number;
    frustumTop: number;
    frustumBottom: number;
  } | null;
  /** 現在 canvas に適用している画面拡大・減衰揺れの変換（Issue #76）。倍率1・移動0は恒等（拡大していない）。
   *  診断・検証と、入力の逆変換契約（#59）のために読む。 */
  screenTransform: { scale: number; offsetX: number; offsetY: number };
  /** レンダラの出力色空間。後処理を線形空間で作用させる前提（最終段の色管理は OutputPass）の明示設定を検証する。
   *  レンダラが無い端末では既定の "srgb" を返す。 */
  outputColorSpace: string;
  /** レンダラのトーンマッピング方式の数値。現状はトーンマッピング無し（NoToneMapping）を明示設定し検証する。
   *  レンダラが無い端末では NoToneMapping の値を返す。 */
  toneMapping: number;
}

/** 描画基盤の外部契約。 */
export interface RenderRoot {
  /** 1フレーム描く。WebGL が無い端末では何もしない。 */
  render(): void;
  /** 中心オブジェクトを毎フレーム進める（Issue #64、引数は秒）。光柱は明滅を、VRMは内部更新を進める。
   *  統括（src/app）が render の前に呼ぶ。WebGL が無い端末では何もしない。 */
  update(deltaSeconds: number): void;
  /** 中心キャラクター（初音ミク）のVRMを読み込み、成功したら光柱からVRMへ差し替える（Issue #64）。
   *  成功で true、失敗または WebGL が無いとき false を返す。失敗時は光柱を表示し続ける。
   *  複数回呼ばれたときは最後の呼び出しの結果だけを採り、古い読み込みの完了は破棄する（世代管理）。 */
  mountCenterCharacter(config: CharacterModelConfig): Promise<boolean>;
  /** 2次元層（Issue #15）へ表示物を足す。後続Issue（落下式レーン #57・音程帯 #58・反応位置の光点）が、
   *  最前面に重ねる表示物をここへ載せる。WebGL が無く2次元層が無い端末では何もしない。 */
  addOverlayObject(object: Object3D): void;
  /** 2次元層（Issue #15）から表示物を外す。WebGL が無く2次元層が無い端末では何もしない。 */
  removeOverlayObject(object: Object3D): void;
  /** 表示寸法の変更を反映する（カメラ縦横比とレンダラ寸法・画素密度、2次元層の視錐台）。 */
  resize(width: number, height: number): void;
  /** カメラの位置と注視点（ワールド座標）を設定する。適用できたら true、位置と注視点が同一または
   *  非有限値で適用しなかったら false を返す。演出カメラ軌跡（#13）が毎フレーム駆動する。戻り値で
   *  下流（#59）が適用失敗を検知でき、無音の不具合を避ける。WebGL無効時もカメラ物体は存在するため反映する。 */
  setCameraPose(position: Vec3Like, target: Vec3Like): boolean;
  /** 画面拡大・減衰揺れの変換を canvas へ当てる（Issue #76）。倍率（中心原点）と画素移動を受け取り、
   *  canvas の表示変換（CSSのtransform）として matrix 形式で適用する。引数は時刻の論理を持たない確定値で、
   *  演出評価器（src/utils/screenShake）が算出する。前回適用値と一致すれば書き換えない。破棄後・canvas が
   *  無い（WebGL 不可）ときは何もしない。 */
  setScreenTransform(scale: number, offsetXPx: number, offsetYPx: number): void;
  /** 拍同期ポストエフェクト（Issue #17）の色収差バースト強度を注入する。intensity は0から1で、強拍直後に1、
   *  減衰で0へ向かう。値を橋渡しするだけで時刻ロジックは持たない。後処理パスが無効（既定）の端末では効果は出ない。
   *  本編での有効化は #59 が createRenderRoot({ postEffectEnabled: true }) で行う。WebGL が無い端末では何もしない。 */
  setChromaBurstIntensity(intensity: number): void;
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
 * options.bloomEnabled が偽のときはブルームを無効にして起動する（既定は有効。?bloom=0 から渡る）。
 * options.postEffectEnabled が真のときは拍同期ポストエフェクト（Issue #17、周縁減光＋色収差）を有効にして起動する
 * （既定は無効。本編での有効化は #59 がこの引数で行い、既定無効により既存の見えを変えない）。
 */
export function createRenderRoot(
  container: HTMLElement,
  options: {
    reflectionResolution?: number;
    bloomEnabled?: boolean;
    postEffectEnabled?: boolean;
  } = {}
): RenderRoot {
  const reflectionResolution = options.reflectionResolution ?? DEFAULT_REFLECTION_RESOLUTION;
  const bloomEnabled = options.bloomEnabled ?? true;
  const postEffectEnabled = options.postEffectEnabled ?? false;

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
      // 色管理を明示設定する（現状はトーンマッピング無しのためsRGB変換のみ。将来トーンマッピングを変えても
      // 最終段の色管理は OutputPass に集約する）。明示設定する理由を先に述べる。拍同期ポストエフェクト（#17）は
      // ブルームと最終出力の間で線形空間に作用させる前提であり、この前提が three.js の既定変更で崩れる事故を避ける
      // ため、現在の既定と同値（出力sRGB・トーンマッピング無し、見えは不変）を明示して固定する。
      created.outputColorSpace = SRGBColorSpace;
      created.toneMapping = NoToneMapping;
      // 自動消去を無効にする（Issue #15 層合成）。採用理由を先に述べる。3次元の合成の後に深度のみ消して
      // 2次元層を最前面へ重ねるため、描画のたびに色を自動で消されては困る。合成器の内部パス（RenderPass）は
      // autoClear に依らず自前で色と深度を消すため通常経路は影響を受けず、防御経路（合成器が無い縮退）では
      // render() の先頭で自前に renderer.clear() を呼ぶ。
      created.autoClear = false;
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

  // 反射水面・暫定発光点・ブルーム合成は、描画器を生成できたときだけ作る。採用理由を先に述べる。
  // いずれもレンダラ・シーン・カメラを用いるため、描画器が無い端末では資源を作らず、縮退の状態
  // （反射無効・解像度0・ブルームは null）をこの分岐の構造で保証する。
  let water: Water | null = null;
  let placeholderGlow: PlaceholderGlow | null = null;
  let bloomComposer: BloomComposer | null = null;
  // 夜の照明と中心オブジェクト（Issue #64）。標準マテリアルのモデルを照らす光源と、中心に常在する造形。
  let lighting: NightLighting | null = null;
  let centerFigure: CenterFigure | null = null;
  // 2次元層（Issue #15）。3次元の合成の後に最前面へ重ねる正射影カメラと専用シーン。
  let overlay: OverlayLayer | null = null;
  if (renderer) {
    water = createWater({ reflectionResolution });
    scene.add(water.object3d);
    // 暫定発光点（Issue #10 で発光点本実装へ置換）。反射に映る対象として置く。
    placeholderGlow = createPlaceholderGlow();
    scene.add(placeholderGlow.object3d);
    // 夜の照明（Issue #64）。中心オブジェクトを深夜の背景から分離する淡い環境光とリムライト。
    lighting = createNightLighting();
    scene.add(lighting.object3d);
    // 中心オブジェクト（Issue #64）。初期は光柱（fallback）を中心へ立て、VRM読み込み成功で差し替える。
    centerFigure = createCenterFigure();
    scene.add(centerFigure.object3d);
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
    // ブルーム後処理（Issue #11）。シーンへ水面と発光点を載せカメラを据えた後に合成を作る。
    bloomComposer = createBloomComposer(renderer, scene, camera, {
      enabled: bloomEnabled,
      displayWidth: window.innerWidth,
      displayHeight: window.innerHeight,
      postEffectEnabled,
    });
    // 2次元層（Issue #15）。3次元の合成の後に最前面へ重ねる。初回の構築時描画より前に生成する。
    overlay = createOverlayLayer({
      displayWidth: window.innerWidth,
      displayHeight: window.innerHeight,
    });
  }

  let disposed = false;

  // 中心オブジェクトのVRM読み込みの世代番号と、最後の失敗理由（Issue #64）。
  // 世代番号は mountCenterCharacter を呼ぶたびに増やし、読み込み完了時に最新の世代だけを採る。
  let centerMountGeneration = 0;
  let centerFigureError: string | null = null;

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
      // 合成の往復バッファを描画バッファ全解像度へ合わせ、ブルーム入力解像度を半分へ再適用する。
      bloomComposer?.setSize(width, height);
      // 2次元層の正射影カメラの視錐台を新しい縦横比で組み直す（Issue #15）。
      overlay?.resize(width, height);
    }
  }

  function handleResize(): void {
    resize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener("resize", handleResize);

  // setCameraPose が適用を拒否した累積回数。診断・検証で無音の不具合を検出するために数える。
  let cameraPoseRejectedCount = 0;

  // 現在 canvas に適用している画面拡大・減衰揺れの変換（Issue #76）。初期は恒等（拡大していない）。
  let currentScreenTransform = { scale: 1, offsetX: 0, offsetY: 0 };

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

  function setScreenTransform(scale: number, offsetXPx: number, offsetYPx: number): void {
    // 破棄後、または canvas が無い（WebGL 不可）ときは何もしない。後始末の順序に依らず安全にする。
    if (disposed || !renderer) {
      return;
    }
    // 前回適用値と一致すれば書き換えない。恒等が続く（拡大していない）間の毎フレームの要素書き換えをなくす。
    // 演出評価器が倍率4桁・移動1桁へ丸め恒等近傍を恒等へ吸着するため、恒等が続く間は値が一定で一致する。
    if (
      scale === currentScreenTransform.scale &&
      offsetXPx === currentScreenTransform.offsetX &&
      offsetYPx === currentScreenTransform.offsetY
    ) {
      return;
    }
    currentScreenTransform = { scale, offsetX: offsetXPx, offsetY: offsetYPx };
    // 行列形式 matrix(倍率,0,0,倍率,横移動,縦移動) で当てる。原点は #stage canvas の transform-origin:50% 50%
    // （src/style.css）で中心に固定する。回転・剪断を含めないため、移動は倍率の後段に画素単位で加わる平行移動になり、
    // 揺れの移動量が画面外余白の内側に収まる前提が成り立つ。
    renderer.domElement.style.transform = `matrix(${scale},0,0,${scale},${offsetXPx},${offsetYPx})`;
  }

  function update(deltaSeconds: number): void {
    if (disposed) {
      return;
    }
    centerFigure?.update(deltaSeconds);
  }

  async function mountCenterCharacter(config: CharacterModelConfig): Promise<boolean> {
    // 描画器が無い（WebGL 不可）端末では中心オブジェクトを作っていないため、読み込まずに false を返す。
    if (!centerFigure) {
      return false;
    }
    const generation = (centerMountGeneration += 1);
    try {
      const loaded = await loadVrm(config.url);
      // 後始末済み、または新しい呼び出しに追い越されたら取り込まず、読み込んだVRMを解放する（競合ガードと世代管理）。
      if (disposed || generation !== centerMountGeneration || !centerFigure) {
        loaded.dispose();
        return false;
      }
      centerFigure.swapToVrm(loaded, config);
      centerFigureError = null;
      return true;
    } catch (error) {
      // 失敗は最新の世代のときだけ記録する。古い失敗が新しい読み込みの状態を上書きしないようにする。
      if (!disposed && generation === centerMountGeneration && centerFigure) {
        centerFigure.markLoadFailed();
        centerFigureError = error instanceof Error ? error.message : String(error);
      }
      return false;
    }
  }

  function render(): void {
    if (!renderer || disposed) {
      return;
    }
    // 常に合成パイプライン経由で3次元世界を描く。理由を先に述べる。ブルームの有効・無効で色管理の経路を
    // 分けないため、最終出力パスを含む合成器に一本化する。レンダラがあるとき合成器も必ず存在するが、型の
    // 縮約のため存在を確かめ、万一無ければ素のシーン描画へ倒す。
    if (bloomComposer) {
      bloomComposer.render();
    } else {
      // 防御経路（合成器が無い縮退）。autoClear を偽に固定しているため、3次元を描く前に色と深度を自前で消す。
      renderer.clear();
      renderer.render(scene, camera);
    }
    // 2次元層を最前面へ重ねる（Issue #15）。出力先を画面へ明示し、深度のみ消してから正射影カメラで描く。
    // 色は3次元の結果を保持する（autoClear が偽のため消えない）。
    overlay?.composite(renderer);
  }

  // 起動直後にクリアカラーを適用するため、ループの初回フレームを待たず1回描く。
  render();

  return {
    render,
    update,
    mountCenterCharacter,
    addOverlayObject(object: Object3D): void {
      overlay?.addObject(object);
    },
    removeOverlayObject(object: Object3D): void {
      overlay?.removeObject(object);
    },
    setCameraPose,
    setScreenTransform,
    setChromaBurstIntensity(intensity: number): void {
      // 値を橋渡しするだけ（時刻ロジックは持たない）。WebGL が無く合成器が無い端末では何もしない。
      bloomComposer?.setChromaBurstIntensity(intensity);
    },
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
        // 反射水面を作っていればその有効・解像度を返す。作っていない（WebGL 不可）なら無効・0。
        reflectionEnabled: water ? water.reflective : false,
        reflectionResolution: water ? water.reflectionResolution : 0,
        bloom: bloomComposer ? bloomComposer.state() : null,
        // 中心オブジェクトの表示状態。作っていない（WebGL 不可）なら fallback を返す。
        centerFigureStatus: centerFigure ? centerFigure.status() : "fallback",
        centerFigureError,
        // 2次元層（Issue #15）。作っていない（WebGL 不可）なら null。視錐台と載っている表示物の数を返す。
        overlay: overlay
          ? {
              objectCount: overlay.objectCount(),
              frustumLeft: overlay.frustum().left,
              frustumRight: overlay.frustum().right,
              frustumTop: overlay.frustum().top,
              frustumBottom: overlay.frustum().bottom,
            }
          : null,
        // 現在 canvas に当てている画面拡大・減衰揺れの変換（Issue #76）。複製して外部からの変更を防ぐ。
        screenTransform: { ...currentScreenTransform },
        // 色管理の明示設定（レンダラが無い端末では既定値を返す）。後処理を線形空間で作用させる前提を診断で確かめる。
        outputColorSpace: renderer ? renderer.outputColorSpace : SRGBColorSpace,
        toneMapping: renderer ? renderer.toneMapping : NoToneMapping,
      };
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      window.removeEventListener("resize", handleResize);
      // 反射水面・暫定発光点・ブルーム合成を、描画器の破棄より前に解放する。理由を先に述べる。
      // renderer.dispose は WebGL の描画文脈と結び付く GPU資源を解放するため、文脈が失われた後に各資源を
      // 解放しようとすると空振りし資源が残る恐れがある。
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
      // 中心オブジェクト（光柱または読み込み済みVRM）を解放する。読み込み中に dispose された場合は、
      // mountCenterCharacter 側の世代・後始末ガードが、後から届く読み込みを取り込まず解放する。
      if (centerFigure) {
        scene.remove(centerFigure.object3d);
        centerFigure.dispose();
        centerFigure = null;
      }
      // 夜の照明を解放する。
      if (lighting) {
        scene.remove(lighting.object3d);
        lighting.dispose();
        lighting = null;
      }
      if (bloomComposer) {
        bloomComposer.dispose();
        bloomComposer = null;
      }
      // 2次元層を解放する（Issue #15）。シーンから表示物を外すのみで、表示物のGPU資源は載せた側が解放する。
      if (overlay) {
        overlay.dispose();
        overlay = null;
      }
      if (renderer) {
        renderer.dispose();
        renderer.domElement.remove();
        renderer = null;
      }
    },
  };
}
