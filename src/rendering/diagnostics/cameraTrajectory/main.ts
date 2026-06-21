// カメラ軌跡の受け入れ診断ページ（camera-trajectory.html の入口）。
// 実装した評価器（utils）と描画基盤（rendering）を結線し、暫定キーフレームで全曲長を掃引して、
// カメラが滑らかに追従すること（隣接サンプル間移動量に飛びがない）、軌跡上速度が常に正であること、
// setCameraPose の適用拒否がないこと、終点でカメラの位置と前方向きが評価器と一致することを
// window.__cameraTrajectory で公開する。本ページは本番ビルド（--mode app）では配信しない（architecture.md §7.2）。
import { createRenderRoot } from "../../renderRoot";
import { createCameraTrajectory } from "../../../utils/cameraTrajectory";
import {
  takeoverCameraKeyframes,
  TAKEOVER_DURATION_MS,
} from "../../../profiles/takeover";

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`#${id} 要素が見つかりません`);
  }
  return element as T;
}

// 単位ベクトル化（注視点と位置の差から前方向きを定める。位置と注視点は一致しない前提）。
function normalize(
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number }
): { x: number; y: number; z: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
  return { x: dx / length, y: dy / length, z: dz / length };
}

const container = requireElement<HTMLElement>("app");
const hud = requireElement<HTMLElement>("hud");

const renderRoot = createRenderRoot(container);
const trajectory = createCameraTrajectory(takeoverCameraKeyframes);

// 掃引刻み（ミリ秒）。採用理由を先に述べる。実機の毎秒60フレームの1フレームは約16ミリ秒であり、
// 表示で起こりうる最小間隔に合わせて連続性を見るため16ミリ秒で掃引する。
const SWEEP_STEP_MS = 16;

// 掃引の各時刻で評価器の位置・速度を測り、カメラ姿勢を設定する。描画はループ内では呼ばない。
// 採用理由を先に述べる。状態（カメラ位置・前方向き）は setCameraPose が camera へ反映するため
// state() から描画なしで読める。連続性の指標は poseAt のみで足りる。全曲長を毎フレーム描画すると
// 同期処理がメインスレッドを長くブロックし診断ページの読み込みが完了しないため、描画は掃引後に1回だけ行う。
let maxStepDistance = 0;
let totalStepDistance = 0;
let stepCount = 0;
let minSpeed = Number.POSITIVE_INFINITY;
let previous = trajectory.poseAt(0).position;

for (let t = 0; t <= TAKEOVER_DURATION_MS; t += SWEEP_STEP_MS) {
  const pose = trajectory.poseAt(t);
  renderRoot.setCameraPose(pose.position, pose.target);
  const speed = trajectory.speedAt(t);
  if (speed < minSpeed) {
    minSpeed = speed;
  }
  if (t > 0) {
    const dx = pose.position.x - previous.x;
    const dy = pose.position.y - previous.y;
    const dz = pose.position.z - previous.z;
    const step = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (step > maxStepDistance) {
      maxStepDistance = step;
    }
    totalStepDistance += step;
    stepCount += 1;
  }
  previous = pose.position;
}

// 終点で確定したカメラ姿勢を残す（スモークが評価器の終点位置・向きと照合する）。
const endPose = trajectory.poseAt(TAKEOVER_DURATION_MS);
renderRoot.setCameraPose(endPose.position, endPose.target);
renderRoot.render();

const meanStepDistance = stepCount > 0 ? totalStepDistance / stepCount : 0;
const expectedEndDirection = normalize(endPose.position, endPose.target);

window.__cameraTrajectory = () => {
  const renderState = renderRoot.state();
  return {
    startTimeMs: trajectory.startTimeMs,
    endTimeMs: trajectory.endTimeMs,
    maxStepDistance,
    meanStepDistance,
    minSpeed: Number.isFinite(minSpeed) ? minSpeed : 0,
    cameraPosition: renderState.cameraPosition,
    cameraDirection: renderState.cameraDirection,
    cameraPoseRejectedCount: renderState.cameraPoseRejectedCount,
    expectedEndPosition: endPose.position,
    expectedEndDirection,
  };
};

hud.textContent =
  `start=${trajectory.startTimeMs} end=${trajectory.endTimeMs}\n` +
  `maxStep=${maxStepDistance.toFixed(3)} meanStep=${meanStepDistance.toFixed(3)} minSpeed=${minSpeed.toFixed(5)}`;
