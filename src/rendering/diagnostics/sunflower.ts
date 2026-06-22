// ひまわり造形（Issue #60）の受け入れ診断ページ（sunflower.html の入口）。
// ひまわりのみの最小シーンを実ブラウザで描き、描画命令の回数・三角形の数・描画個体数・個体あたり三角形数・
// 代表個体の大きさと輝度の標本・幾何メトリクス（花盤半径・全体半径・中心花弁比率・種数・花弁数）を
// 同一スナップショットで window.__sunflowerState に公開する。scripts/rendering-sunflower-smoke.mjs が読む。
// 反射・層合成・文字は作らない。スナップショットは後処理を通さない素の描画から採る。理由を先に述べる。
// 後処理や反射を残すとそれらのパスの描画命令が混ざり、ひまわりだけの命令数を測れないため、ひまわりだけを素直に描く。
// ブルームは ?bloom=1 のときだけ表示ループに使う（花弁の発光と中心の白飛びを実機で目視するため）。
// 固定の3段階（反応強度0.2・0.5・0.9）を手前に横並びで置き、固定seedの造形をスクリーンショットで比較できるようにする。
// 本ページは本番ビルド（--mode app）では配信しない。

import { Color, FogExp2, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from "three";
import {
  CAMERA_FAR,
  CAMERA_FOV,
  CAMERA_NEAR,
  FOG_DENSITY,
  MAX_PIXEL_RATIO,
  NIGHT_COLOR,
  SUNFLOWER_DIAGNOSTIC_MAX,
  SUNFLOWER_GOLDEN_ANGLE,
} from "../constants";
import { clampPixelRatio, computeAspect } from "../viewport";
import { createSunflowerFigures } from "../entities/sunflowerFigures";
import { reactionToBrightness, reactionToScale } from "../entities/sunflowerReactionMapping";
import { createBloomComposer, type BloomComposer } from "../bloom";

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`#${id} 要素が見つかりません`);
  }
  return element as T;
}

const params = new URLSearchParams(window.location.search);
const bloomEnabled = params.get("bloom") === "1";

const container = requireElement<HTMLElement>("app");
const hud = requireElement<HTMLElement>("hud");

// ---- 最小の描画器・シーン・カメラ ----
// preserveDrawingBuffer を有効にする理由を先に述べる。本診断ページはスモークがスクリーンショットを保存して作者
// 目視に供するが、描画バッファを保持しないと合成のタイミングで黒画面が撮れることがあるため、保持して最後に描いた
// 内容を確実に撮れるようにする。これは診断ページ専用で、本番の描画基盤には影響しない。
const renderer = new WebGLRenderer({
  antialias: false,
  powerPreference: "high-performance",
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(clampPixelRatio(window.devicePixelRatio, MAX_PIXEL_RATIO));
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

const scene = new Scene();
scene.background = new Color(NIGHT_COLOR);
scene.fog = new FogExp2(NIGHT_COLOR, FOG_DENSITY);

// ひまわりは湖面に水平に寝た造形のため、上方から見下ろす視点で花の表を見せる。
const camera = new PerspectiveCamera(
  CAMERA_FOV,
  computeAspect(window.innerWidth, window.innerHeight),
  CAMERA_NEAR,
  CAMERA_FAR
);
// 既定は湖面を見下ろす視点。?elev=<度> を与えると、手前の3段階（z=9付近）を指定した仰角（地平線からの角度）で
// 斜めから見る視点に切り替える。花弁の反りの立体感を斜め上から評価するために用いる（診断専用）。
const elevParam = params.get("elev");
if (elevParam !== null) {
  const elevDeg = Number(elevParam);
  const elevation = (Number.isFinite(elevDeg) ? elevDeg : 22) * (Math.PI / 180);
  const distParam = Number(params.get("dist"));
  const obliqueDistance = Number.isFinite(distParam) && distParam > 0 ? distParam : 30;
  const target = new Vector3(0, 0.3, 9);
  camera.position.set(
    target.x,
    target.y + obliqueDistance * Math.sin(elevation),
    target.z + obliqueDistance * Math.cos(elevation)
  );
  camera.lookAt(target);
} else {
  camera.position.set(0, 30, 24);
  camera.lookAt(new Vector3(0, 0, 4));
}

// ---- ひまわりエンティティ ----
const capacity = SUNFLOWER_DIAGNOSTIC_MAX;
const fig = createSunflowerFigures({ capacity });
scene.add(fig.object);

// 湖面の高さ（わずかに水面の上）。
const SURFACE_Y = 0.05;
// 反応強度の3段階（低・中・高）。採用理由を先に述べる。大きさと輝度の可変を目視で対比するため、強度を
// 0.2・0.5・0.9 と離して取る。手前（カメラ寄り）に横並びで置き、固定seedのスクリーンショット比較に使う。
const LEVELS = [0.2, 0.5, 0.9];
const TRIO_X = [-7, 0, 7];
const TRIO_Z = 9;
// 背景の群れの広がり半径。負荷上限の状態で描画命令数と三角形数を測るため、容量まで決定的に敷き詰める。
const FIELD_RADIUS = 18;
const FIELD_CENTER_Z = -4;

let used = 0;
for (let i = 0; i < LEVELS.length; i += 1) {
  fig.setInstance(used, {
    position: { x: TRIO_X[i], y: SURFACE_Y, z: TRIO_Z },
    sizeStrength: LEVELS[i],
    brightnessStrength: LEVELS[i],
  });
  used += 1;
}
// 背景の群れ。黄金角フェルマー螺旋で決定的に散らし、強度も決定的に変える（Math.random 不使用でスクリーンショット
// を再現可能にする）。面積一様に散らすため半径を √(連番/総数) に比例させる。
const fieldCount = capacity - used;
for (let k = 0; k < fieldCount; k += 1) {
  const radius = FIELD_RADIUS * Math.sqrt((k + 1) / fieldCount);
  const angle = k * SUNFLOWER_GOLDEN_ANGLE;
  const x = Math.cos(angle) * radius;
  const z = FIELD_CENTER_Z + Math.sin(angle) * radius;
  // 強度は黄金比の小数部で決定的に散らす。
  const sizeStrength = (k * 0.6180339887) % 1;
  const brightnessStrength = (k * 0.7548776662) % 1;
  fig.setInstance(used, { position: { x, y: SURFACE_Y, z }, sizeStrength, brightnessStrength });
  used += 1;
}
fig.setVisibleCount(used);
fig.commit();

// ---- スナップショット（後処理を通さない素の描画から採る） ----
// 数フレーム描いて確定する。理由を先に述べる。renderer.info は次の描画開始時に0へ戻るため、最後の素の描画の
// 直後に値を取り込む。ひまわりは静的なため更新は不要で、描いて値を読むだけでよい。
for (let f = 0; f < 3; f += 1) {
  renderer.render(scene, camera);
}
const indexAttr = fig.object.geometry.getIndex();
const trianglesPerInstance = indexAttr ? indexAttr.count / 3 : 0;
const snapshot = {
  drawCalls: renderer.info.render.calls,
  triangles: renderer.info.render.triangles,
  instanceCount: fig.object.count,
  trianglesPerInstance,
  sampleScales: LEVELS.map(reactionToScale),
  sampleBrightnesses: LEVELS.map(reactionToBrightness),
  discRadius: fig.metrics.discRadius,
  overallRadius: fig.metrics.overallRadius,
  centerPetalRatio: fig.metrics.centerPetalRatio,
  seedCount: fig.metrics.seedCount,
  petalCount: fig.metrics.petalCount,
};
window.__sunflowerState = () => snapshot;

hud.textContent =
  `sunflower capacity ${capacity}\n` +
  `drawCalls ${snapshot.drawCalls}  triangles ${snapshot.triangles}\n` +
  `instances ${snapshot.instanceCount}  perInstance ${snapshot.trianglesPerInstance}\n` +
  `seeds ${snapshot.seedCount}  petals ${snapshot.petalCount}  centerPetalRatio ${snapshot.centerPetalRatio.toFixed(3)}\n` +
  `bloom ${bloomEnabled ? "on" : "off"}`;

// ---- 表示ループ（花盤螺旋・花弁・色階調の目視。?bloom=1 なら発光と中心の白飛びを確認） ----
let bloom: BloomComposer | null = null;
if (bloomEnabled) {
  bloom = createBloomComposer(renderer, scene, camera, {
    enabled: true,
    displayWidth: window.innerWidth,
    displayHeight: window.innerHeight,
  });
}

function frame(): void {
  if (bloom) {
    bloom.render();
  } else {
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.addEventListener("resize", () => {
  camera.aspect = computeAspect(window.innerWidth, window.innerHeight);
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (bloom) {
    bloom.setSize(window.innerWidth, window.innerHeight);
  }
});
