import { describe, it, expect } from "vitest";
import { createCameraTrajectory, type CameraTrajectoryKeyframe } from "./cameraTrajectory";

// 非一様な時刻間隔のキーフレーム（時刻から曲線パラメータへの写像を試すため間隔を変える）。
const keyframes: CameraTrajectoryKeyframe[] = [
  { timeMs: 0, position: { x: -30, y: 5, z: 30 }, target: { x: 0, y: 2, z: 0 } },
  { timeMs: 1000, position: { x: -10, y: 8, z: 10 }, target: { x: 0, y: 2, z: 2 } },
  { timeMs: 5000, position: { x: 15, y: 4, z: 12 }, target: { x: 1, y: 2, z: 0 } },
  { timeMs: 6000, position: { x: 25, y: 6, z: -20 }, target: { x: 0, y: 3, z: -2 } },
];

describe("createCameraTrajectory poseAt", () => {
  it("時刻範囲の下端・上端を返す", () => {
    const trajectory = createCameraTrajectory(keyframes);
    expect(trajectory.startTimeMs).toBe(0);
    expect(trajectory.endTimeMs).toBe(6000);
  });

  it("各キーフレームの時刻でそのキーフレームの位置・注視点を許容誤差内で返す", () => {
    // 浮動小数の演算誤差があるため、厳密一致ではなく小数第5位までの一致で確かめる。
    const trajectory = createCameraTrajectory(keyframes);
    for (const keyframe of keyframes) {
      const pose = trajectory.poseAt(keyframe.timeMs);
      expect(pose.position.x).toBeCloseTo(keyframe.position.x, 5);
      expect(pose.position.y).toBeCloseTo(keyframe.position.y, 5);
      expect(pose.position.z).toBeCloseTo(keyframe.position.z, 5);
      expect(pose.target.x).toBeCloseTo(keyframe.target.x, 5);
    }
  });

  it("範囲外の時刻は端点へクランプする", () => {
    const trajectory = createCameraTrajectory(keyframes);
    const before = trajectory.poseAt(-1000);
    const start = trajectory.poseAt(0);
    expect(before.position.x).toBeCloseTo(start.position.x, 5);
    const after = trajectory.poseAt(99999);
    const end = trajectory.poseAt(6000);
    expect(after.position.x).toBeCloseTo(end.position.x, 5);
  });

  it("キーフレームが2つ未満なら例外", () => {
    expect(() => createCameraTrajectory([keyframes[0]])).toThrow();
  });

  it("時刻が増加していないキーフレームは例外", () => {
    const bad = [keyframes[0], { ...keyframes[1], timeMs: 0 }];
    expect(() => createCameraTrajectory(bad)).toThrow();
  });
});

// 距離から時刻への変換誤差の許容（ミリ秒）。採用理由を先に述べる。受け入れ基準が±16ミリ秒以内を
// 要求するため、この値を判定閾値とする（Issue #13 受け入れ基準）。
const TIME_TOLERANCE_MS = 16;

// 全曲長の検証に使う、TAKEOVER曲長相当（237250ミリ秒）の非一様キーフレーム。
const longKeyframes: CameraTrajectoryKeyframe[] = [
  { timeMs: 0, position: { x: -30, y: 5, z: 30 }, target: { x: 0, y: 2, z: 0 } },
  { timeMs: 24000, position: { x: -10, y: 8, z: 10 }, target: { x: 0, y: 2, z: 2 } },
  { timeMs: 60000, position: { x: 15, y: 4, z: 12 }, target: { x: 1, y: 2, z: 0 } },
  { timeMs: 120000, position: { x: 25, y: 6, z: -20 }, target: { x: 0, y: 3, z: -2 } },
  { timeMs: 189000, position: { x: 0, y: 11, z: -34 }, target: { x: 0, y: 2, z: 0 } },
  { timeMs: 237250, position: { x: -22, y: 7, z: 18 }, target: { x: 0, y: 2, z: 1 } },
];

describe("createCameraTrajectory distance and speed", () => {
  it("累積距離は始点で0、時刻の増加に対し単調増加する", () => {
    const trajectory = createCameraTrajectory(longKeyframes);
    expect(trajectory.distanceAt(0)).toBeCloseTo(0, 5);
    let previous = -1;
    for (let t = 0; t <= 237250; t += 1000) {
      const distance = trajectory.distanceAt(t);
      expect(distance).toBeGreaterThan(previous);
      previous = distance;
    }
  });

  it("軌跡上速度は常に正である（現コンセプトの一方向進行。concept-final.md §4）", () => {
    // 速度が常に正であることは、現在のコンセプト（カメラは軌跡上を一方向に進む）と、逆変換 timeAtDistance が
    // 前提とする累積距離の単調増加に対応する。将来カメラの停止演出を入れる場合は逆変換の前提を見直す。
    const trajectory = createCameraTrajectory(longKeyframes);
    for (let t = 0; t <= 237250; t += 1000) {
      expect(trajectory.speedAt(t)).toBeGreaterThan(0);
    }
  });

  it("距離から時刻への変換が高密度参照に対して±16ミリ秒以内である（受け入れ基準の精度）", () => {
    // 検証方法と刻みの採用理由を先に述べる。評価器内部の弧長表は4ミリ秒刻みであり、その逆変換が
    // 真の連続弧長に対して±16ミリ秒以内かを確かめるには、より細かい刻みで近似した参照（高密度参照）と
    // 突き合わせる必要がある。同一の表での往復は自己整合の確認にとどまり真の精度を測れないためである。
    // 参照刻み0.5ミリ秒は内部刻み4ミリ秒の8分の1で、弦近似と線形補間の誤差を実用上無視できる水準まで下げる。
    // 参照表はオブジェクト配列ではなく Float64Array で確保し、メモリと生成費用を抑える。生成は本テスト内の一度きり。
    const trajectory = createCameraTrajectory(longKeyframes);
    const REFERENCE_STEP_MS = 0.5;
    const referenceCount = Math.floor(237250 / REFERENCE_STEP_MS) + 1;
    const referenceDistances = new Float64Array(referenceCount);
    let previousPosition = trajectory.poseAt(0).position;
    let accumulated = 0;
    for (let index = 1; index < referenceCount; index += 1) {
      const t = index * REFERENCE_STEP_MS;
      const current = trajectory.poseAt(t).position;
      const dx = current.x - previousPosition.x;
      const dy = current.y - previousPosition.y;
      const dz = current.z - previousPosition.z;
      accumulated += Math.sqrt(dx * dx + dy * dy + dz * dz);
      referenceDistances[index] = accumulated;
      previousPosition = current;
    }
    // 高密度参照の累積距離を時刻から線形補間で引く（刻みが一定なので添字で直接引ける）。
    function referenceDistanceAt(timeMs: number): number {
      const clamped = Math.min(Math.max(timeMs, 0), 237250);
      const position = clamped / REFERENCE_STEP_MS;
      const index = Math.min(Math.floor(position), referenceCount - 2);
      const fraction = position - index;
      return referenceDistances[index] + (referenceDistances[index + 1] - referenceDistances[index]) * fraction;
    }
    // 検証時刻（参照刻みにも内部刻みにも整列しない511ミリ秒間隔）ごとに、参照距離を評価器の逆変換へ
    // 渡し、戻り時刻が±16ミリ秒以内であることを確かめる。
    for (let t = 0; t <= 237250; t += 511) {
      const recovered = trajectory.timeAtDistance(referenceDistanceAt(t));
      expect(Math.abs(recovered - t)).toBeLessThanOrEqual(TIME_TOLERANCE_MS);
    }
  });

  it("全曲長で滑らかに追従する（隣接サンプル間のカメラ移動量に飛びがない）", () => {
    const trajectory = createCameraTrajectory(longKeyframes);
    // 連続性の判定方法と閾値の採用理由を先に述べる。Catmull-Romスプラインは1階微分まで連続のため、
    // 一定刻みあたりの移動量は局所速度に比例して滑らかに変わる。区間境界での実装上の不連続（瞬間移動）が
    // あれば、その1ステップだけ移動量が平均から桁違いに跳ね上がる。よって8ミリ秒刻みで掃引した移動量の
    // 最大値が平均の6倍を超えないことを連続性の判定とする。倍率6は、速い区間と遅い区間の正当な速度差を
    // 許容しつつ、瞬間移動を検出できる余裕として採る。
    const steps: number[] = [];
    let previous = trajectory.poseAt(0).position;
    for (let t = 8; t <= 237250; t += 8) {
      const current = trajectory.poseAt(t).position;
      const dx = current.x - previous.x;
      const dy = current.y - previous.y;
      const dz = current.z - previous.z;
      steps.push(Math.sqrt(dx * dx + dy * dy + dz * dz));
      previous = current;
    }
    const mean = steps.reduce((a, b) => a + b, 0) / steps.length;
    const max = Math.max(...steps);
    expect(max).toBeLessThanOrEqual(mean * 6);
  });
});
