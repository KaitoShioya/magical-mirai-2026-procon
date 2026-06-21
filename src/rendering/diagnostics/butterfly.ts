// 蝶造形（Issue #61）の受け入れ診断ページ（butterfly.html の入口）。
// 蝶のみの最小シーンを実ブラウザで描き、描画命令の回数・三角形の数・描画個体数・個体あたり三角形数・
// 活動個体数・代表個体の大きさと輝度の標本を同一スナップショットで window.__butterflyState に公開する。
// scripts/rendering-butterfly-smoke.mjs が読む。
// 反射・層合成・文字は作らない。スナップショットは後処理を通さない素の描画から採る。理由を先に述べる。
// 後処理や反射を残すとそれらのパスの描画命令が混ざり、蝶だけの命令数を測れないため、蝶だけを素直に描く。
// ブルームは ?bloom=1 のときだけ表示ループに使う（両面の翅とブルームの白飛びを実機で目視するため）。
// スナップショットは常に素の描画から採るためブルームの有無に影響されない。
// 本ページは本番ビルド（--mode app）では配信しない。

import { Color, FogExp2, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from "three";
import {
  BUTTERFLY_DIAGNOSTIC_MAX,
  BUTTERFLY_LIFE_SECONDS,
  CAMERA_FAR,
  CAMERA_FOV,
  CAMERA_NEAR,
  FOG_DENSITY,
  MAX_PIXEL_RATIO,
  NIGHT_COLOR,
} from "../constants";
import { clampPixelRatio, computeAspect } from "../viewport";
import { createButterflyFigures } from "../entities/butterflyFigures";
import { reactionToBrightness, reactionToScale } from "../entities/butterflyReactionMapping";
import { areaUniformRadius, polarToXZ } from "../entities/glowPointsLayout";
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

// ---- 最小の描画器・シーン・カメラ（#8 の見えに揃える） ----
const renderer = new WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(clampPixelRatio(window.devicePixelRatio, MAX_PIXEL_RATIO));
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

const scene = new Scene();
scene.background = new Color(NIGHT_COLOR);
scene.fog = new FogExp2(NIGHT_COLOR, FOG_DENSITY);

const camera = new PerspectiveCamera(
  CAMERA_FOV,
  computeAspect(window.innerWidth, window.innerHeight),
  CAMERA_NEAR,
  CAMERA_FAR
);
camera.position.set(0, 14, 42);
camera.lookAt(new Vector3(0, 2, 0));

// ---- 蝶エンティティ ----
const capacity = BUTTERFLY_DIAGNOSTIC_MAX;
const fig = createButterflyFigures({ capacity });
scene.add(fig.object);

// 灯し半径は発光点診断と同じおよそ28。湖の規模（constants の近接面・遠方面）に収まる。
const FIELD_RADIUS = 28;
// 反応強度の3段階（低・中・高）。採用理由を先に述べる。大きさと輝度の可変を目視で対比するため、精度を
// 0.2・0.5・0.9 と離して取る。横並びの x 位置と、寿命を共有する。
const LEVELS = [0.2, 0.5, 0.9];
const TRIO_X = [-7, 0, 7];
// 3段階の比較は同一の経過時間・同一のフェードで行う必要があるため、上昇速度0・横揺れ0で同時に発生させ、
// やや長い寿命で中盤（フェード=1）を保つ。寿命が尽きたら再発生して比較を続ける。
const TRIO_LIFE_SECONDS = 8;

function spawnTrio(): void {
  for (let i = 0; i < LEVELS.length; i += 1) {
    fig.spawn({
      position: { x: TRIO_X[i], y: 3, z: 10 },
      scale: reactionToScale(LEVELS[i]),
      brightness: reactionToBrightness(LEVELS[i]),
      lifeSeconds: TRIO_LIFE_SECONDS,
      riseSpeed: 0,
      swayAmplitude: 0,
    });
  }
}

function spawnStream(amount: number): void {
  for (let k = 0; k < amount; k += 1) {
    const radius = areaUniformRadius(Math.random(), FIELD_RADIUS);
    const angle = Math.random() * Math.PI * 2;
    const { x, z } = polarToXZ(radius, angle);
    const y = 1.2 + Math.random() * 6;
    fig.spawn({
      position: { x, y, z },
      scale: reactionToScale(Math.random()),
      brightness: reactionToBrightness(Math.random()),
      lifeSeconds: BUTTERFLY_LIFE_SECONDS,
    });
  }
}

// 起動時に3段階＋容量まで発生させ、負荷上限の状態で描画命令数と三角形数を測れるようにする。
spawnTrio();
spawnStream(capacity - fig.activeCount());

// ---- スナップショット（後処理を通さない素の描画から採る） ----
// 数フレーム進めて描き、活動個体を確定する。理由を先に述べる。renderer.info は次の描画開始時に0へ戻るため、
// 最後の素の描画の直後に値を取り込む。
for (let f = 0; f < 3; f += 1) {
  fig.update(1 / 60);
  renderer.render(scene, camera);
}
const indexAttr = fig.object.geometry.getIndex();
const trianglesPerInstance = indexAttr ? indexAttr.count / 3 : 0;
const snapshot = {
  drawCalls: renderer.info.render.calls,
  triangles: renderer.info.render.triangles,
  instanceCount: fig.object.count,
  trianglesPerInstance,
  activeCount: fig.activeCount(),
  sampleScales: LEVELS.map(reactionToScale),
  sampleBrightnesses: LEVELS.map(reactionToBrightness),
};
window.__butterflyState = () => snapshot;

hud.textContent =
  `butterfly capacity ${capacity}\n` +
  `drawCalls ${snapshot.drawCalls}  triangles ${snapshot.triangles}\n` +
  `instances ${snapshot.instanceCount}  perInstance ${snapshot.trianglesPerInstance}  active ${snapshot.activeCount}\n` +
  `bloom ${bloomEnabled ? "on" : "off"}`;

// ---- 表示ループ（羽ばたき・上昇・舞って消えるの目視。?bloom=1 ならブルームで白飛びを確認） ----
let bloom: BloomComposer | null = null;
if (bloomEnabled) {
  bloom = createBloomComposer(renderer, scene, camera, {
    enabled: true,
    displayWidth: window.innerWidth,
    displayHeight: window.innerHeight,
  });
}

let lastTimeMs = performance.now();
let trioTimerSec = 0;
function frame(nowMs: number): void {
  // 1フレームの経過秒。上限0.05秒で抑える。理由を先に述べる。タブ非表示からの復帰で大きな飛びが来ても
  // 寿命やアニメーションが一気に進みすぎないようにするため。
  const dt = Math.min(0.05, (nowMs - lastTimeMs) / 1000);
  lastTimeMs = nowMs;

  fig.update(dt);
  trioTimerSec += dt;
  if (trioTimerSec >= TRIO_LIFE_SECONDS) {
    trioTimerSec = 0;
    spawnTrio();
  }
  // 活動が容量の半分を下回ったら少数を補充して賑わいを保つ。
  if (fig.activeCount() < capacity * 0.5) {
    spawnStream(Math.min(4, capacity - fig.activeCount()));
  }

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
