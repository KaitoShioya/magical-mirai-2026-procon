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
