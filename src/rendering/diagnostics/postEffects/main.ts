// 拍同期ポストエフェクト（Issue #17）の受け入れ診断ページ（posteffects.html の入口）。本番と同じ合成器
// （createBloomComposer、ブルームと最終出力の間に周縁減光＋色収差のパスを挟む）を実機ブラウザで駆動し、
// 周縁減光と強拍時の色収差バーストが達成基準どおりに現れることを window.__postEffectsState に公開する。
// scripts/rendering-posteffects-smoke.mjs が読む。本ページは本番ビルド（--mode app）では配信しない。
//
// 強拍は合成した拍時刻列で代替する（本ページは機構の実証であり、実楽曲の拍への結線は #59 が行う）。
// テストシーンは検証目的の異なる2領域を持つ。第1は中心から周縁まで一様に明るい灰色の面で、周縁減光と
// 黒潰れの検出に使う。第2は周縁寄りの白と黒の鋭い縦境界で、色収差の検出に使う。座標は直交カメラの
// 正規化空間（左右 -1 から 1）にとり、世界座標から画面座標への対応を縦横比に依らず一定にする。

import {
  Color,
  Mesh,
  MeshBasicMaterial,
  NoToneMapping,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";
import { MAX_PIXEL_RATIO, NIGHT_COLOR, POST_VIGNETTE_BASE_STRENGTH } from "../../constants";
import { POST_CHROMA_DECAY_TAU_MS } from "../../../config/tuning";
import { clampPixelRatio } from "../../viewport";
import { createBloomComposer } from "../../bloom";
import { createBeatScheduler } from "../../../utils/beatScheduler";
import { createBeatBurst } from "../../../utils/beatBurstEnvelope";

// 依存規則により本体・診断は tools を import しないため、要素取得は内製する。
function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`#${id} 要素が見つかりません`);
  }
  return element as T;
}

// 合成した強拍の開始時刻（ミリ秒）。等間隔1000ミリ秒にする理由を先に述べる。色収差の減衰（3τ=360ミリ秒）より
// 十分長い間隔にして、ピークと減衰後を別々の時刻で読めるようにする。
const STRONG_BEAT_TIMES_MS = [500, 1500, 2500] as const;

// 白黒境界の世界座標X（直交正規化空間）。0.8にする理由を先に述べる。画面右端寄り（画面座標で0.9）に置くことで
// 正規化距離を大きくし、色収差のずれ量（距離に比例）を知覚できる大きさにする。
const BOUNDARY_WORLD_X = 0.8;
// 境界帯の世界座標Y範囲の半幅（縦の帯）。境界をまたぐ標本が帯の上下端に外れないよう中央付近に十分な高さを持たせる。
const BOUNDARY_BAND_HALF_HEIGHT = 0.3;

const container = requireElement<HTMLElement>("app");
const hud = requireElement<HTMLElement>("hud");

const params = new URLSearchParams(window.location.search);
// 既定は後処理有効（診断は効果を実証するため）。?posteffect=0 で無効化した基準計測に対応する。
const postEffectEnabled = params.get("posteffect") !== "0";
// ?perf=1 のときは連続描画で毎秒フレーム数を計測する。既定は決定的なステップ実行（画素検証）。
const perfMode = params.get("perf") === "1";

const displayWidth = window.innerWidth;
const displayHeight = window.innerHeight;

// ---- 描画器（本番 renderRoot と同じ色管理設定。自動消去は無効） ----
const renderer = new WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setClearColor(NIGHT_COLOR, 1);
renderer.autoClear = false;
// 色管理を本番と一致させる（後処理を線形空間で作用させ、最終段の色管理は OutputPass に集約する前提）。
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = NoToneMapping;
renderer.setPixelRatio(clampPixelRatio(window.devicePixelRatio, MAX_PIXEL_RATIO));
renderer.setSize(displayWidth, displayHeight);
container.appendChild(renderer.domElement);

// ---- 直交カメラ（左右 -1 から 1、上下 1 から -1）。世界座標 (x, y) を画面の (横, 縦) へ線形に対応させる ----
// 世界 x が -1 から 1 で画面の左端から右端、世界 y が -1 から 1 で画面の下端から上端に対応する。縦横比は
// シェーダが resolution から取るため、カメラは正方の正規化空間でよい。
const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 10);
camera.position.z = 5;

const scene = new Scene();
scene.background = new Color(NIGHT_COLOR);

// 明領域: 視野全体を覆う一様な明るい灰色の面（深度の奥に置く）。周縁減光の検出に使う。
// 灰色を明るめ（0xb0b0b0）にする理由を先に述べる。線形空間での減光乗算を経ても、中心と周縁の明度差を
// 画素で十分に区別できる明るさにする。
const grayGeometry = new PlaneGeometry(2, 2);
const grayMaterial = new MeshBasicMaterial({ color: 0xb0b0b0, fog: false });
const grayPlane = new Mesh(grayGeometry, grayMaterial);
grayPlane.position.set(0, 0, -0.5);
scene.add(grayPlane);

// 境界系統: 周縁寄りに黒の不透明な縦帯を1枚置き、明るい灰色面との鋭い縦境界を作る（手前に置く）。
// 白でなく黒帯と灰色面の境界にする理由を先に述べる。白（最大輝度）はブルームで強く滲み、隣接領域へ
// 明るさが漏れて境界が消える。明るい灰色面はブルームの明るさ下限（0.5）未満で滲まないため、黒帯との
// 境界が鋭く保たれ、色収差のチャンネル分離を画素で確実に検出できる。
const blackGeometry = new PlaneGeometry(0.2, BOUNDARY_BAND_HALF_HEIGHT * 2);
const blackMaterial = new MeshBasicMaterial({ color: 0x000000, fog: false });
const blackBand = new Mesh(blackGeometry, blackMaterial);
// 境界の右側（黒）。中心 x = 境界X + 0.1 で幅0.2 → x ∈ [境界X, 境界X+0.2]。左側は明るい灰色面が見える。
blackBand.position.set(BOUNDARY_WORLD_X + 0.1, 0, 0);
scene.add(blackBand);

// ---- 合成器（本番と同じ。後処理は診断では有効、?posteffect=0 で無効） ----
const bloomComposer = createBloomComposer(renderer, scene, camera, {
  enabled: true,
  displayWidth,
  displayHeight,
  postEffectEnabled,
});

// ---- 拍同期の駆動（合成強拍＋拍バースト包絡） ----
const scheduler = createBeatScheduler([...STRONG_BEAT_TIMES_MS]);
const burst = createBeatBurst(POST_CHROMA_DECAY_TAU_MS);
// 生成直後に基準時刻を0へ置く理由を先に述べる。拍同期スケジューラの初回 advance は基準確定のみで発火しない
// ため、基準を時刻0に置いておかないと最初の強拍（時刻500）が発火しない。
scheduler.syncTo(0);

// ---- 画素読み戻しの座標変換 ----
const gl = renderer.getContext();

// 世界座標 (x, y)（-1 から 1）を画面の正規化座標 (u, v)（0 から 1、左下原点・上方向正）へ写す。
function worldToUv(x: number, y: number): { u: number; v: number } {
  return { u: (x + 1) / 2, v: (y + 1) / 2 };
}

// 画面正規化座標 (u, v) の画素を読み、赤・緑・青を返す（gl.readPixels は左下原点・上方向正で読む）。
function readPixelAtUv(u: number, v: number): { r: number; g: number; b: number } {
  const bufferWidth = gl.drawingBufferWidth;
  const bufferHeight = gl.drawingBufferHeight;
  const px = Math.min(bufferWidth - 1, Math.max(0, Math.round(u * bufferWidth)));
  const py = Math.min(bufferHeight - 1, Math.max(0, Math.round(v * bufferHeight)));
  const pixel = new Uint8Array(4);
  gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  return { r: pixel[0], g: pixel[1], b: pixel[2] };
}

// 画面正規化座標 (u, v) を中心に、横方向へ画素単位でずらした点の赤・緑・青を返す。
function readPixelAtUvWithPixelOffset(
  u: number,
  v: number,
  pixelOffsetX: number
): { r: number; g: number; b: number } {
  const bufferWidth = gl.drawingBufferWidth;
  const offsetU = pixelOffsetX / bufferWidth;
  return readPixelAtUv(u + offsetU, v);
}

function luminance(rgb: { r: number; g: number; b: number }): number {
  return (rgb.r + rgb.g + rgb.b) / 3;
}

// 明領域の標本位置（灰色面が見える、境界帯に重ならない位置）。
const CENTER = worldToUv(0, 0);
const PERIPHERY = worldToUv(-0.85, 0);
const PERIPHERY_CORNERS = [
  worldToUv(-0.9, 0.9),
  worldToUv(-0.9, -0.9),
  worldToUv(0.9, -0.9),
] as const;

// 境界の標本位置（明るい灰色側に数画素離した複数点の最大の色ずれを取る）。
// 境界そのものでなく灰色側に離して取る理由を先に述べる。境界は鋭いため、境界上の画素では微小な色収差でも
// 隣の黒へ達して分離が起き、減衰後でも差が残って「強拍時のみ」を判定できない。灰色側に2から4画素離すと、
// ピークの大きなずれ（横1920画素でおよそ5画素）だけが境界を跨いで黒に達し、減衰後の小さなずれ（1画素未満）は
// 跨がず差が出ないため、強拍時のみ現れ消えることを判定できる。境界（黒帯）は標本より右（高い画面座標）にある
// ため、灰色側は負の画素ずれで表す。複数点の最大を取り端末差に強くする。
const BOUNDARY = worldToUv(BOUNDARY_WORLD_X, 0);
const BOUNDARY_PIXEL_OFFSETS = [-2, -3, -4] as const;

// 現在の状態を読み戻すスナップショット。
function captureSnapshot(): {
  webglAvailable: boolean;
  centerLuminance: number;
  peripheryLuminance: number;
  peripheryMinLuminance: number;
  boundaryMaxAbsRB: number;
  chromaIntensity: number;
  vignetteStrength: number;
} {
  const centerLuminance = luminance(readPixelAtUv(CENTER.u, CENTER.v));
  const peripheryLuminance = luminance(readPixelAtUv(PERIPHERY.u, PERIPHERY.v));
  let peripheryMinLuminance = peripheryLuminance;
  for (const corner of PERIPHERY_CORNERS) {
    peripheryMinLuminance = Math.min(peripheryMinLuminance, luminance(readPixelAtUv(corner.u, corner.v)));
  }
  let boundaryMaxAbsRB = 0;
  for (const offset of BOUNDARY_PIXEL_OFFSETS) {
    const rgb = readPixelAtUvWithPixelOffset(BOUNDARY.u, BOUNDARY.v, offset);
    boundaryMaxAbsRB = Math.max(boundaryMaxAbsRB, Math.abs(rgb.r - rgb.b));
  }
  const bloomState = bloomComposer.state();
  return {
    webglAvailable: true,
    centerLuminance,
    peripheryLuminance,
    peripheryMinLuminance,
    boundaryMaxAbsRB,
    chromaIntensity: bloomState.chromaIntensity,
    vignetteStrength: bloomState.vignetteStrength,
  };
}

let snapshot = {
  webglAvailable: true,
  centerLuminance: 0,
  peripheryLuminance: 0,
  peripheryMinLuminance: 0,
  boundaryMaxAbsRB: 0,
  chromaIntensity: 0,
  vignetteStrength: POST_VIGNETTE_BASE_STRENGTH,
};

// 指定したゲーム時刻まで拍同期スケジューラと拍バースト包絡を進め、色収差強度を注入して1フレーム描き、
// 画素を読み戻してスナップショットを更新する。
function step(gameTimeMs: number): void {
  scheduler.advance(gameTimeMs, (event) => burst.trigger(event.timeMs, event.elapsedSinceBeatMs));
  bloomComposer.setChromaBurstIntensity(burst.intensityAt(gameTimeMs));
  bloomComposer.render();
  snapshot = captureSnapshot();
  hud.textContent =
    `posteffects step t=${gameTimeMs}ms chroma=${snapshot.chromaIntensity.toFixed(3)}\n` +
    `center=${snapshot.centerLuminance.toFixed(0)} periphery=${snapshot.peripheryLuminance.toFixed(0)} ` +
    `min=${snapshot.peripheryMinLuminance.toFixed(0)}\n` +
    `boundary|R-B|max=${snapshot.boundaryMaxAbsRB.toFixed(0)}`;
}

function reset(): void {
  // 再実行のため、拍バーストと拍同期スケジューラを初期化し、基準時刻を0へ置き直す。
  // syncTo(0) を必ず行う理由を先に述べる。reset だけでは次の初回 advance が基準確定のみで不発になるため、
  // 基準を時刻0へ置いて最初の強拍を発火可能にする。
  burst.reset();
  scheduler.reset();
  scheduler.syncTo(0);
}

function handleResize(): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height);
  bloomComposer.setSize(width, height);
}
window.addEventListener("resize", handleResize);

if (perfMode) {
  // 連続描画で毎秒フレーム数を計測する。色収差は固定強度（0.5）で常時駆動し、追加パスの代表的な負荷を測る
  // （シェーダの1画素あたりの費用は色収差の値に依らず一定のため、固定値で代表できる）。
  let frames = 0;
  let lastSampleTimeMs = performance.now();
  let lastFps = 0;
  let samples: number[] = [];
  function resetFps(): void {
    frames = 0;
    lastSampleTimeMs = performance.now();
    lastFps = 0;
    samples = [];
  }
  window.__fps = () => lastFps;
  window.__avgFps = () => (samples.length > 0 ? samples.reduce((a, b) => a + b, 0) / samples.length : 0);
  window.__fpsSamples = () => samples.slice();
  window.__resetFps = resetFps;

  bloomComposer.setChromaBurstIntensity(0.5);
  function frameLoop(now: number): void {
    bloomComposer.render();
    frames += 1;
    const elapsed = now - lastSampleTimeMs;
    if (elapsed >= 1000) {
      lastFps = (frames * 1000) / elapsed;
      samples.push(lastFps);
      frames = 0;
      lastSampleTimeMs = now;
    }
    window.requestAnimationFrame(frameLoop);
  }
  window.requestAnimationFrame(frameLoop);
  hud.textContent = `posteffects perf mode posteffect=${postEffectEnabled ? "on" : "off"}`;
} else {
  // 決定的なステップ実行。基準時刻（時刻0、色収差なし）で1回描いてからアクセサを公開する。
  step(0);
  window.__postEffectsStep = step;
  window.__postEffectsReset = reset;
  window.__postEffectsState = () => snapshot;
}

// ページ破棄時に後始末し、公開したアクセサを削除する。
window.addEventListener("beforeunload", () => {
  window.removeEventListener("resize", handleResize);
  bloomComposer.dispose();
  grayGeometry.dispose();
  grayMaterial.dispose();
  blackGeometry.dispose();
  blackMaterial.dispose();
  renderer.dispose();
  renderer.domElement.remove();
  delete window.__postEffectsStep;
  delete window.__postEffectsReset;
  delete window.__postEffectsState;
  delete window.__fps;
  delete window.__avgFps;
  delete window.__fpsSamples;
  delete window.__resetFps;
});
