// 描画層合成（Issue #15）の受け入れ診断ページ（layer-composite.html の入口）。
// 本番の描画基盤と同じ合成手順（3次元を合成器で描く → 深度のみ消す → 正射影カメラで2次元層を最前面に描く）を
// 実機ブラウザで再現し、画面の画素を読み戻して「2次元層が最前面・z-fightなし・3次元の色が保持される」ことを
// window.__layerCompositeState に公開する。scripts/rendering-layer-smoke.mjs が読む。
// 本ページは本番ビルド（--mode app）では配信しない。
//
// 本番との一致のため、合成器は本番と同じ createBloomComposer（RenderPass → UnrealBloomPass → OutputPass）を
// 使い、2次元層は本番と同じ createOverlayLayer の composite を呼ぶ。

import {
  Color,
  FogExp2,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
} from "three";
import { WebGLRenderer } from "three";
import {
  CAMERA_FAR,
  CAMERA_FOV,
  CAMERA_NEAR,
  FOG_DENSITY,
  MAX_PIXEL_RATIO,
  NIGHT_COLOR,
} from "../../constants";
import { clampPixelRatio, computeAspect } from "../../viewport";
import { createBloomComposer } from "../../bloom";
import { createOverlayLayer } from "../../overlay";

// 依存規則により本体・診断は tools を import しないため、要素取得は内製する。
function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`#${id} 要素が見つかりません`);
  }
  return element as T;
}

// 2次元層の赤い物体の半径（座標規約の単位、高さの基準軸での値）。中央からこの距離まで覆う。
const RED_HALF_EXTENT = 0.35;
// 中央格子の標本の中央からの距離（座標規約の単位）。赤い物体の縁(0.35)に対し0.20以上内側に置く。
const INSIDE_OFFSETS = [-0.15, 0, 0.15] as const;
// 外側の標本の中央からの距離（座標規約の単位）。赤い物体の縁(0.35)より0.10外側に置く。
const OUTSIDE_OFFSET = 0.45;
// 描画を繰り返すフレーム数。1フレームでは前フレームの深度残りによる遮りやz-fightを検出できないため、
// 安定状態を見る最小の回数として5フレーム描いてから読み戻す。
const WARMUP_FRAMES = 5;

const container = requireElement<HTMLElement>("app");
const hud = requireElement<HTMLElement>("hud");

const displayWidth = window.innerWidth;
const displayHeight = window.innerHeight;

// ---- 描画器（本番と同じ設定。自動消去は無効） ----
const renderer = new WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setClearColor(NIGHT_COLOR, 1);
renderer.autoClear = false;
renderer.setPixelRatio(clampPixelRatio(window.devicePixelRatio, MAX_PIXEL_RATIO));
renderer.setSize(displayWidth, displayHeight);
container.appendChild(renderer.domElement);

// ---- 3次元シーン: 視野を覆う不透明な緑の平面（深度を持つ3次元の物体） ----
const scene = new Scene();
scene.background = new Color(NIGHT_COLOR);
scene.fog = new FogExp2(NIGHT_COLOR, FOG_DENSITY);

const camera = new PerspectiveCamera(
  CAMERA_FOV,
  computeAspect(displayWidth, displayHeight),
  CAMERA_NEAR,
  CAMERA_FAR
);
camera.position.set(0, 0, 5);
camera.lookAt(0, 0, 0);

// 視野を確実に覆う大きさ（100四方）の緑の平面をカメラ正面（z=0）に置く。光源に依存しない MeshBasicMaterial を
// 使い、3次元側の色を緑に固定する。霧の影響を避けるため fog を無効にする。
const greenGeometry = new PlaneGeometry(100, 100);
const greenMaterial = new MeshBasicMaterial({ color: 0x00ff00, fog: false });
const greenPlane = new Mesh(greenGeometry, greenMaterial);
greenPlane.position.set(0, 0, 0);
scene.add(greenPlane);

// ---- 合成器（本番と同じ。ブルーム有効） ----
const bloomComposer = createBloomComposer(renderer, scene, camera, {
  enabled: true,
  displayWidth,
  displayHeight,
});

// ---- 2次元層: 画面中央を覆う不透明な純赤の物体 ----
const overlay = createOverlayLayer({ displayWidth, displayHeight });
const redGeometry = new PlaneGeometry(RED_HALF_EXTENT * 2, RED_HALF_EXTENT * 2);
const redMaterial = new MeshBasicMaterial({ color: 0xff0000 });
const redPlane = new Mesh(redGeometry, redMaterial);
redPlane.position.set(0, 0, 0);
overlay.addObject(redPlane);

// ---- 本番と同じ手順で数フレーム描く ----
function drawFrame(): void {
  bloomComposer.render();
  overlay.composite(renderer);
}
for (let i = 0; i < WARMUP_FRAMES; i += 1) {
  drawFrame();
}

// ---- 描画直後に画面の画素を読み戻す（同期処理内で読むため preserveDrawingBuffer は不要） ----
// gl.readPixels はフレームバッファを端末画素・左下原点で読むため、位置は描画バッファ寸法で計算する。
const gl = renderer.getContext();
const bufferWidth = gl.drawingBufferWidth;
const bufferHeight = gl.drawingBufferHeight;
const centerX = bufferWidth / 2;
const centerY = bufferHeight / 2;
// 座標規約の単位から端末画素への換算係数。両軸とも「描画バッファ高さ ÷ 2」（等方）。
const pixelsPerUnit = bufferHeight / 2;

function readPixel(offsetXUnit: number, offsetYUnit: number): [number, number, number, number] {
  // 2次元層は中央原点・上方向正、gl.readPixels も左下原点で上方向正のため、両軸の符号は一致する。
  const x = Math.round(centerX + offsetXUnit * pixelsPerUnit);
  const y = Math.round(centerY + offsetYUnit * pixelsPerUnit);
  const pixel = new Uint8Array(4);
  gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  return [pixel[0], pixel[1], pixel[2], pixel[3]];
}

const insideSamples: Array<[number, number, number, number]> = [];
for (const offsetY of INSIDE_OFFSETS) {
  for (const offsetX of INSIDE_OFFSETS) {
    insideSamples.push(readPixel(offsetX, offsetY));
  }
}
const outsideSample = readPixel(0, OUTSIDE_OFFSET);

const snapshot = {
  webglAvailable: true,
  insideSamples: insideSamples as ReadonlyArray<readonly [number, number, number, number]>,
  outsideSample: outsideSample as readonly [number, number, number, number],
  sampleCount: insideSamples.length,
};
window.__layerCompositeState = () => snapshot;

hud.textContent =
  `layer composite (${WARMUP_FRAMES} frames)\n` +
  `inside center ${insideSamples[4].join(",")}  (expect red)\n` +
  `outside ${outsideSample.join(",")}  (expect green)`;

// 表示寸法の変更に追従する（計測値は初回の読み戻しスナップショットで固定済み）。
window.addEventListener("resize", () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = computeAspect(width, height);
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  bloomComposer.setSize(width, height);
  overlay.resize(width, height);
});

// ページ破棄時に後始末し、公開したアクセサを削除する。
window.addEventListener("beforeunload", () => {
  overlay.dispose();
  redGeometry.dispose();
  redMaterial.dispose();
  greenGeometry.dispose();
  greenMaterial.dispose();
  bloomComposer.dispose();
  renderer.dispose();
  renderer.domElement.remove();
  delete window.__layerCompositeState;
});
