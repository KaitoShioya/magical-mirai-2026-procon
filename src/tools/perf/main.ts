// 描画性能検証ツール（prototype.html の入口）。
// 深夜・雨・暗い湖面の平面反射・発光のブルーム・3次元カメラ移動・文字スマッシュを
// 単一の three.js 描画領域で最小実装し、毎秒フレーム数を計測する。
//
// クエリノブと window.__fps / __avgFps / __fpsSamples / __resetFps / __drawCalls / __pixelRatio は
// scripts/prototype-fps.mjs が依存する実行時契約であり、名前・形を変えない。
// __drawCalls は直前フレームの描画命令数（反射・ブルームを合算した1フレーム分）、
// __pixelRatio は実際に適用された画素密度倍率を返す。
//
// ノブ（URLクエリで切替）:
//   dpr        画素密度上限（既定2）
//   refl       反射解像度（0で反射オフ、既定512）
//   bloom      1でブルームオン（既定1）
//   bloomScale ブルームの解像度倍率（既定0.5）
//   points     発光点の数（既定300）
//   rain       雨粒の数（既定800）
//   bpm        文字スマッシュのテンポ（既定175）

import * as THREE from "three";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { Text } from "troika-three-text";
import { requireElement } from "../dom";

// ---- ノブ ----
const q = new URLSearchParams(location.search);
const num = (k: string, d: number): number => (q.has(k) ? Number(q.get(k)) : d);
const PIXEL_CAP = num("dpr", 2);
const REFLECT_RES = num("refl", 512);
const BLOOM = num("bloom", 1);
const BLOOM_SCALE = num("bloomScale", 0.5);
const INSTANCES = num("points", 300);
const RAIN = num("rain", 800);
const BPM = num("bpm", 175);

const container = requireElement<HTMLElement>("app");
const hud = requireElement<HTMLElement>("hud");

// ---- レンダラ ----
const renderer = new THREE.WebGLRenderer({
  antialias: false,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, PIXEL_CAP));
renderer.setSize(window.innerWidth, window.innerHeight);
// 描画命令数の自動初期化を切る。理由を先に述べる。反射（Reflector）とブルーム（合成器）で
// 1フレーム内に複数回描画が走るため、各描画ごとに初期化される既定のままだと最後の描画分しか
// 残らない。自動初期化を切り、描画関数の冒頭で1回だけ初期化して、合算した1フレーム分を読む。
renderer.info.autoReset = false;
container.appendChild(renderer.domElement);

// ---- シーンとカメラ ----
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060a);
scene.fog = new THREE.FogExp2(0x05060a, 0.012);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  500
);

// ---- 湖面（平面反射） ----
const lakeGeo = new THREE.PlaneGeometry(400, 400);
let lake: THREE.Object3D;
if (REFLECT_RES > 0) {
  lake = new Reflector(lakeGeo, {
    textureWidth: REFLECT_RES,
    textureHeight: REFLECT_RES,
    color: 0x0a0c12,
  });
} else {
  lake = new THREE.Mesh(lakeGeo, new THREE.MeshBasicMaterial({ color: 0x0a0c12 }));
}
lake.rotateX(-Math.PI / 2);
scene.add(lake);

// ---- 発光点（ひまわり=オレンジ / 蝶=ネオンブルー） ----
const sphere = new THREE.SphereGeometry(0.18, 8, 8);
const pointsMesh = new THREE.InstancedMesh(
  sphere,
  new THREE.MeshBasicMaterial(),
  INSTANCES
);
const orange = new THREE.Color(1.0, 0.5, 0.12);
const neon = new THREE.Color(0.12, 0.7, 1.0);
const dummy = new THREE.Object3D();
for (let i = 0; i < INSTANCES; i++) {
  // 中心集中（半径を平方根で寄せ、見せ場が中心に集まる構図を模す）
  const r = Math.sqrt(Math.random()) * 28;
  const a = Math.random() * Math.PI * 2;
  const x = Math.cos(a) * r;
  const z = Math.sin(a) * r;
  const isButterfly = Math.random() < 0.4;
  const y = isButterfly ? 1.2 + Math.random() * 6 : 0.25; // 蝶は空中、ひまわりは水面付近
  dummy.position.set(x, y, z);
  dummy.scale.setScalar(0.6 + Math.random() * 1.6);
  dummy.updateMatrix();
  pointsMesh.setMatrixAt(i, dummy.matrix);
  pointsMesh.setColorAt(i, isButterfly ? neon : orange);
}
if (pointsMesh.instanceColor) {
  pointsMesh.instanceColor.needsUpdate = true;
}
scene.add(pointsMesh);

// ---- 雨（環境演出。操作判定はしない） ----
let rain: THREE.Points | null = null;
let rainPositions: Float32Array | null = null;
let rainAttr: THREE.BufferAttribute | null = null;
if (RAIN > 0) {
  const g = new THREE.BufferGeometry();
  rainPositions = new Float32Array(RAIN * 3);
  for (let i = 0; i < RAIN; i++) {
    rainPositions[i * 3] = (Math.random() - 0.5) * 90;
    rainPositions[i * 3 + 1] = Math.random() * 40;
    rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 90;
  }
  rainAttr = new THREE.BufferAttribute(rainPositions, 3);
  g.setAttribute("position", rainAttr);
  rain = new THREE.Points(
    g,
    new THREE.PointsMaterial({
      color: 0x6a7ba0,
      size: 0.07,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    })
  );
  scene.add(rain);
}

// ---- 文字（固定テンポでスマッシュ。文字と場面が共存することの確認） ----
// 既定フォントはラテン文字のため、本試作はラテン語で負荷を見る。
// 日本語の文字の実コストは本フォント導入後に別途確認する。
const texts: Text[] = [];
const words = ["TAKEOVER", "SONARE", "LAKE", "NIGHT"];
for (let i = 0; i < words.length; i++) {
  const t = new Text();
  t.text = words[i];
  t.fontSize = 3;
  t.color = 0xffffff;
  t.outlineWidth = 0.05;
  t.outlineColor = 0x000000;
  t.anchorX = "center";
  t.anchorY = "middle";
  t.position.set(
    (Math.random() - 0.5) * 22,
    3 + Math.random() * 5,
    (Math.random() - 0.5) * 22
  );
  t.sync();
  scene.add(t);
  texts.push(t);
}

// ---- 後処理（ブルーム） ----
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
if (BLOOM) {
  const w = Math.max(1, window.innerWidth * BLOOM_SCALE);
  const h = Math.max(1, window.innerHeight * BLOOM_SCALE);
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 1.2, 0.6, 0.5));
}

// ---- カメラ軌跡 ----
const curve = new THREE.CatmullRomCurve3(
  [
    new THREE.Vector3(-30, 5, 30),
    new THREE.Vector3(-10, 8, 10),
    new THREE.Vector3(15, 4, 12),
    new THREE.Vector3(25, 6, -20),
    new THREE.Vector3(0, 11, -34),
  ],
  true
);
const camTarget = new THREE.Vector3(0, 2, 0);

// ---- 計測 ----
let frames = 0;
let last = performance.now();
let fps = 0;
const samples: number[] = [];
// 直前フレームの描画命令数。初期値は空値にする。理由を先に述べる。最初の描画が完了する前に
// 読まれた場合に0を返すと、計測側が「取得不能」と「実測0」を区別できなくなるため、描画前は空値にする。
let lastFrameDrawCalls: number | null = null;
window.__fps = () => fps;
window.__avgFps = () =>
  samples.length ? samples.reduce((acc, val) => acc + val, 0) / samples.length : 0;
// 区間ごとの毎秒フレーム数の生標本を複製して返す。品質検査ハーネス（scripts/harness）が
// 下位パーセンタイル算出のために読む。複製を返すのは、外部から内部配列を書き換えられないようにするため。
window.__fpsSamples = () => samples.slice();
window.__resetFps = () => {
  // 計測開始直後に直前区間の値が混じらないよう、標本と区間カウンタを揃えて初期化する。
  samples.length = 0;
  frames = 0;
  fps = 0;
  last = performance.now();
};
// 直前フレームの描画命令数（反射・ブルームを合算した1フレーム分）。最初の描画完了前は空値。
window.__drawCalls = () => lastFrameDrawCalls;
// 実際に適用された画素密度倍率。setPixelRatio で設定した Math.min(window.devicePixelRatio, 上限) を返す。
window.__pixelRatio = () => renderer.getPixelRatio();

const beatMs = 60000 / BPM;
const clock = new THREE.Clock();

function animate(): void {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const now = performance.now();

  // カメラ移動
  curve.getPointAt((now * 0.00003) % 1, camera.position);
  camera.lookAt(camTarget);

  // 雨の落下と巻き戻し
  if (rain && rainPositions && rainAttr) {
    for (let i = 0; i < RAIN; i++) {
      rainPositions[i * 3 + 1] -= dt * 26;
      if (rainPositions[i * 3 + 1] < 0) rainPositions[i * 3 + 1] += 40;
    }
    rainAttr.needsUpdate = true;
  }

  // 拍に合わせた文字スマッシュ
  const beatPhase = (now % beatMs) / beatMs;
  const pulse = 1 + 0.35 * Math.max(0, 1 - beatPhase * 4);
  for (const t of texts) {
    t.scale.setScalar(pulse);
    t.quaternion.copy(camera.quaternion); // 常にカメラへ正対
  }

  // 描画命令数を1フレームに一度だけ初期化する（autoReset を切ってあるため、ここで初期化しないと累積する）。
  renderer.info.reset();
  composer.render();
  // 合成描画の後に、反射・ブルームを合算した1フレーム分の描画命令数を保存する。フックはこの保存値を返す。
  lastFrameDrawCalls = renderer.info.render.calls;

  // 毎秒フレーム数
  frames++;
  if (now - last >= 500) {
    fps = Math.round((frames * 1000) / (now - last));
    frames = 0;
    last = now;
    samples.push(fps);
    if (samples.length > 120) samples.shift();
    const avg = window.__avgFps ? window.__avgFps() : 0;
    hud.textContent =
      `FPS ${fps}  avg ${avg.toFixed(0)}\n` +
      `dpr<=${PIXEL_CAP} refl${REFLECT_RES} bloom${BLOOM}@${BLOOM_SCALE} pts${INSTANCES} rain${RAIN}`;
  }
}
animate();

// ---- リサイズ ----
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});
