// 本編左端のY軸音程ガイド（Issue #58）の受け入れ診断ページ（pitch-axis.html の入口）。
// 本番と同じ2次元層（createOverlayLayer の composite）の上へ音程ガイドを載せ、深夜色の背景の上で
// 「左端に番号1〜slotCount と境界マークが薄く出る」「画面寸法の変更で位置と鮮明さが追従する」ことを目視確認する。
// 本ページは本番ビルド（--mode app）では配信しない。

import { Color, PerspectiveCamera, Scene, WebGLRenderer } from "three";
import { CAMERA_FAR, CAMERA_FOV, CAMERA_NEAR, MAX_PIXEL_RATIO, NIGHT_COLOR } from "../../constants";
import { clampPixelRatio, computeAspect } from "../../viewport";
import { createOverlayLayer } from "../../overlay";
import { createPitchAxisGuide } from "../../pitchAxisGuide";
import { PITCH_SLOT_COUNT_DEFAULT } from "../../../config/tuning";

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`#${id} 要素が見つかりません`);
  }
  return element as T;
}

const container = requireElement<HTMLElement>("app");
const hud = requireElement<HTMLElement>("hud");

let displayWidth = window.innerWidth;
let displayHeight = window.innerHeight;

// 描画器（本番と同じく自動消去は無効。2次元層を色を消さずに最前面へ重ねるため）。
const renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setClearColor(NIGHT_COLOR, 1);
renderer.autoClear = false;
renderer.setPixelRatio(clampPixelRatio(window.devicePixelRatio, MAX_PIXEL_RATIO));
renderer.setSize(displayWidth, displayHeight);
container.appendChild(renderer.domElement);

// 深夜色の3次元背景。ガイドの薄さを実際の暗い背景の上で確かめるための最小の場面。
const scene = new Scene();
scene.background = new Color(NIGHT_COLOR);
const camera = new PerspectiveCamera(
  CAMERA_FOV,
  computeAspect(displayWidth, displayHeight),
  CAMERA_NEAR,
  CAMERA_FAR
);
camera.position.set(0, 0, 5);
camera.lookAt(0, 0, 0);

// 2次元層と音程ガイド。ガイドは本番と同じく2次元層へ載せ、視錐台と表示画素数で配置する。
const overlay = createOverlayLayer({ displayWidth, displayHeight });
const guide = createPitchAxisGuide({ slotCount: PITCH_SLOT_COUNT_DEFAULT });
overlay.addObject(guide.object3d);

function devicePixelHeight(): number {
  return displayHeight * renderer.getPixelRatio();
}

function applyLayout(): void {
  guide.layout(overlay.frustum(), devicePixelHeight());
}
applyLayout();

hud.textContent =
  `pitch axis guide (slots ${PITCH_SLOT_COUNT_DEFAULT})\n` +
  `左端に番号1〜${PITCH_SLOT_COUNT_DEFAULT}と境界マークが薄く出ることを確認`;

// 連続描画。本番と同じ手順（3次元を描く → 深度のみ消す → 2次元層を最前面へ）で毎フレーム重ねる。
function frame(): void {
  renderer.clear();
  renderer.render(scene, camera);
  overlay.composite(renderer);
  animationHandle = window.requestAnimationFrame(frame);
}
let animationHandle = window.requestAnimationFrame(frame);

// 表示寸法の変更に追従する。視錐台を組み直し、ガイドを新しい視錐台と表示画素数で再配置する。
window.addEventListener("resize", () => {
  displayWidth = window.innerWidth;
  displayHeight = window.innerHeight;
  camera.aspect = computeAspect(displayWidth, displayHeight);
  camera.updateProjectionMatrix();
  renderer.setSize(displayWidth, displayHeight);
  overlay.resize(displayWidth, displayHeight);
  applyLayout();
});

window.addEventListener("beforeunload", () => {
  window.cancelAnimationFrame(animationHandle);
  overlay.removeObject(guide.object3d);
  guide.dispose();
  overlay.dispose();
  renderer.dispose();
  renderer.domElement.remove();
});
