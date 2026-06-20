// 発光点（#10）の受け入れ診断ページ（rendering.html の入口）。
// 発光点のみの最小シーンを実ブラウザで1フレーム描き、その直後の描画命令の回数と三角形の数を
// 同一スナップショットで window.__glowState に公開する。scripts/rendering-glow-smoke.mjs が読む。
// 反射・ブルーム後処理・雨・文字は作らず、後処理を通さず描く。理由を先に述べる。後処理や反射を残すと
// それらのパスの描画命令が混ざり、発光点だけの命令数を測れないため、発光点だけを素直に描く。
// 本ページは本番ビルド（--mode app）では配信しない。

import {
  Color,
  FogExp2,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import {
  CAMERA_FAR,
  CAMERA_FOV,
  CAMERA_NEAR,
  FOG_DENSITY,
  GLOW_NEON_RGB,
  GLOW_ORANGE_RGB,
  MAX_PIXEL_RATIO,
  NIGHT_COLOR,
} from "../constants";
import { clampPixelRatio, computeAspect } from "../viewport";
import { createGlowPoints } from "../entities/glowPoints";
import { areaUniformRadius, polarToXZ } from "../entities/glowPointsLayout";

// 依存規則により本体・診断は tools を import しないため、要素取得は内製する。
function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`#${id} 要素が見つかりません`);
  }
  return element as T;
}

const INSTANCES = 300;
// 灯し半径は試作と同じおよそ28。湖の規模（constants の近接面・遠方面）に収まる。
const FIELD_RADIUS = 28;

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
// 灯しの群れを俯瞰で収める固定カメラ。
camera.position.set(0, 14, 42);
camera.lookAt(new Vector3(0, 2, 0));

// ---- 発光点（ひまわり=オレンジ / 蝶=ネオンブルー） ----
const glow = createGlowPoints({ capacity: INSTANCES });
for (let i = 0; i < INSTANCES; i += 1) {
  // 面積一様に散らす。配置の厳密さは描画命令の計数に影響しないため見本でよい。
  const radius = areaUniformRadius(Math.random(), FIELD_RADIUS);
  const angle = Math.random() * Math.PI * 2;
  const { x, z } = polarToXZ(radius, angle);
  const isButterfly = Math.random() < 0.4;
  // 蝶は空中（1.2〜7.2）、ひまわりは水面付近（0.25）。
  const y = isButterfly ? 1.2 + Math.random() * 6 : 0.25;
  const scale = 0.6 + Math.random() * 1.6;
  glow.setInstance(i, {
    position: { x, y, z },
    scale,
    colorRgb: isButterfly ? GLOW_NEON_RGB : GLOW_ORANGE_RGB,
  });
}
glow.commit();
glow.setVisibleCount(INSTANCES);
scene.add(glow.object);

// ---- 1フレーム描いて描画命令の回数と三角形の数を同一スナップショットへ確定する ----
// renderer.info は次の描画開始時に自動的に0へ戻るため、描画直後に両方の値を1つのスナップショットへ取り込む。
renderer.render(scene, camera);
const snapshot = {
  drawCalls: renderer.info.render.calls,
  triangles: renderer.info.render.triangles,
};
window.__glowState = () => snapshot;

hud.textContent =
  `glow points ${INSTANCES}\n` +
  `drawCalls ${snapshot.drawCalls}  triangles ${snapshot.triangles}`;

// 表示寸法の変更にカメラと描画器を追従させる（計測値は初回描画のスナップショットで固定済み）。
window.addEventListener("resize", () => {
  camera.aspect = computeAspect(window.innerWidth, window.innerHeight);
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
