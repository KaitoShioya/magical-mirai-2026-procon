// カメラ軌跡の目視確認ページ（camera-trajectory-view.html の入口）。
// 開発サーバ専用の可視化ツールであり、ビルド入力には加えない（本番にも検証ビルドにも含めない）。
// 俯瞰視点で軌跡の曲線・キーフレーム点・床の格子を描き、評価器 createCameraTrajectory の poseAt 出力に沿って
// カメラ位置マーカーと注視点マーカーと視線方向の矢印を動かす。これにより、評価器が返す軌跡の形と、
// 時間に沿った滑らかな進行を目で確認できる（本編の in-game カメラはこの poseAt を setCameraPose 経由で使う）。
import {
  WebGLRenderer,
  Scene,
  Color,
  FogExp2,
  PerspectiveCamera,
  Vector3,
  GridHelper,
  BufferGeometry,
  Float32BufferAttribute,
  Line,
  LineBasicMaterial,
  Mesh,
  SphereGeometry,
  MeshBasicMaterial,
  ArrowHelper,
} from "three";
import {
  CAMERA_FAR,
  CAMERA_FOV,
  CAMERA_NEAR,
  FOG_DENSITY,
  MAX_PIXEL_RATIO,
  NIGHT_COLOR,
} from "../../constants";
import { clampPixelRatio, computeAspect } from "../../viewport";
import { createCameraTrajectory } from "../../../utils/cameraTrajectory";
import { PROVISIONAL_TAKEOVER_CAMERA } from "./provisionalTakeoverCamera";

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`#${id} 要素が見つかりません`);
  }
  return element as T;
}

const query = new URLSearchParams(location.search);
// 全曲長を何秒の実時間で1周再生するか。採用理由を先に述べる。曲長237250ミリ秒をそのまま流すと約4分かかり
// 目視確認に時間がかかりすぎるため、既定で24秒に圧縮して周回再生する（クエリ seconds で変更可）。
const PLAY_SECONDS = query.has("seconds") ? Number(query.get("seconds")) : 24;

const container = requireElement<HTMLElement>("app");
const hud = requireElement<HTMLElement>("hud");

// 描画器・シーン・俯瞰カメラ（#8 の見えに揃える。深夜色と霧）。
const renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(clampPixelRatio(window.devicePixelRatio, MAX_PIXEL_RATIO));
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

const scene = new Scene();
scene.background = new Color(NIGHT_COLOR);
scene.fog = new FogExp2(NIGHT_COLOR, FOG_DENSITY * 0.3);

const camera = new PerspectiveCamera(
  CAMERA_FOV,
  computeAspect(window.innerWidth, window.innerHeight),
  CAMERA_NEAR,
  CAMERA_FAR
);

window.addEventListener("resize", () => {
  camera.aspect = computeAspect(window.innerWidth, window.innerHeight);
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const trajectory = createCameraTrajectory(PROVISIONAL_TAKEOVER_CAMERA);
const startMs = trajectory.startTimeMs;
const endMs = trajectory.endTimeMs;
const spanMs = endMs - startMs;

// 床の格子（空間の基準。水面の高さ y=0 に置く）。
const grid = new GridHelper(140, 28, 0x2a3550, 0x161d30);
scene.add(grid);

// 軌跡の曲線（評価器の poseAt を細かくサンプルして折れ線で描く）。
const LINE_SAMPLES = 600;
const linePositions = new Float32Array((LINE_SAMPLES + 1) * 3);
for (let i = 0; i <= LINE_SAMPLES; i += 1) {
  const t = startMs + (spanMs * i) / LINE_SAMPLES;
  const p = trajectory.poseAt(t).position;
  linePositions[i * 3] = p.x;
  linePositions[i * 3 + 1] = p.y;
  linePositions[i * 3 + 2] = p.z;
}
const lineGeometry = new BufferGeometry();
lineGeometry.setAttribute("position", new Float32BufferAttribute(linePositions, 3));
const trajectoryLine = new Line(lineGeometry, new LineBasicMaterial({ color: 0x4fd0ff }));
scene.add(trajectoryLine);

// キーフレーム点（緑の小球）。
for (const keyframe of PROVISIONAL_TAKEOVER_CAMERA) {
  const node = new Mesh(
    new SphereGeometry(0.9, 14, 14),
    new MeshBasicMaterial({ color: 0x9ffbd0 })
  );
  node.position.set(keyframe.position.x, keyframe.position.y, keyframe.position.z);
  scene.add(node);
}

// 現在のカメラ位置（オレンジの球）と注視点（桃色の球）と視線方向（黄の矢印）。
const cameraMarker = new Mesh(
  new SphereGeometry(1.3, 18, 18),
  new MeshBasicMaterial({ color: 0xff8a3c })
);
scene.add(cameraMarker);
const targetMarker = new Mesh(
  new SphereGeometry(0.7, 12, 12),
  new MeshBasicMaterial({ color: 0xff4f8a })
);
scene.add(targetMarker);
const lookArrow = new ArrowHelper(new Vector3(0, 0, -1), new Vector3(), 6, 0xffd24f, 2, 1);
scene.add(lookArrow);

// 俯瞰カメラの周回（奥行きが読めるようゆっくり回す）。中心と半径は軌跡を収める固定値。
const ORBIT_CENTER = new Vector3(0, 3, -2);
const ORBIT_RADIUS = 95;
const ORBIT_HEIGHT = 55;
const ORBIT_RATE_PER_SECOND = 0.15;

const lookDirection = new Vector3();
const startedAtMs = performance.now();

function frame(nowMs: number): void {
  requestAnimationFrame(frame);
  const elapsedSeconds = (nowMs - startedAtMs) / 1000;

  // 軌跡上の現在時刻（全曲長を PLAY_SECONDS 秒で1周し、周回する）。
  const phase = PLAY_SECONDS > 0 ? (elapsedSeconds % PLAY_SECONDS) / PLAY_SECONDS : 0;
  const gameMs = startMs + spanMs * phase;
  const pose = trajectory.poseAt(gameMs);

  cameraMarker.position.set(pose.position.x, pose.position.y, pose.position.z);
  targetMarker.position.set(pose.target.x, pose.target.y, pose.target.z);
  lookDirection
    .set(pose.target.x - pose.position.x, pose.target.y - pose.position.y, pose.target.z - pose.position.z)
    .normalize();
  lookArrow.position.copy(cameraMarker.position);
  lookArrow.setDirection(lookDirection);

  // 俯瞰カメラを中心の周りでゆっくり回す。
  const orbitAngle = elapsedSeconds * ORBIT_RATE_PER_SECOND;
  camera.position.set(
    ORBIT_CENTER.x + ORBIT_RADIUS * Math.cos(orbitAngle),
    ORBIT_HEIGHT,
    ORBIT_CENTER.z + ORBIT_RADIUS * Math.sin(orbitAngle)
  );
  camera.lookAt(ORBIT_CENTER);

  renderer.render(scene, camera);

  const speed = trajectory.speedAt(gameMs);
  hud.textContent =
    `時刻 ${Math.round(gameMs)} / ${endMs} ミリ秒（1周 ${PLAY_SECONDS} 秒で周回）\n` +
    `軌跡上速度 ${speed.toFixed(4)} ワールド単位/ミリ秒\n` +
    `カメラ位置 (${pose.position.x.toFixed(1)}, ${pose.position.y.toFixed(1)}, ${pose.position.z.toFixed(1)})\n` +
    `凡例: オレンジ=カメラ位置 / 桃=注視点 / 黄矢印=視線 / 水色線=軌跡 / 緑点=キーフレーム`;
}

requestAnimationFrame(frame);
