import { describe, expect, it } from "vitest";
import {
  createPhotoCameraRig,
  PHOTO_MAX_PITCH_RADIANS,
} from "./photoCameraRig";
import type { CameraPose } from "./cameraTrajectory";

const INITIAL: CameraPose = {
  position: { x: 0, y: 7, z: 18 },
  target: { x: 0, y: 2, z: 0 },
};

function direction(pose: CameraPose): { x: number; y: number; z: number } {
  return {
    x: pose.target.x - pose.position.x,
    y: pose.target.y - pose.position.y,
    z: pose.target.z - pose.position.z,
  };
}

function vlen(v: { x: number; y: number; z: number }): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

describe("createPhotoCameraRig 初期化", () => {
  it("初期姿勢の位置と視距離を保つ", () => {
    const rig = createPhotoCameraRig(INITIAL);
    const pose = rig.pose();
    expect(pose.position).toEqual(INITIAL.position);
    // 注視点の向きと視距離は初期姿勢と一致する（同一方向・同一距離）。
    const d0 = direction(INITIAL);
    const d1 = direction(pose);
    expect(vlen(d1)).toBeCloseTo(vlen(d0), 6);
  });
});

describe("pan 平行移動", () => {
  it("視線方向（注視点−位置）が不変", () => {
    const rig = createPhotoCameraRig(INITIAL);
    const before = direction(rig.pose());
    rig.pan(120, -40);
    const after = direction(rig.pose());
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    expect(after.z).toBeCloseTo(before.z, 6);
  });
  it("位置が実際に動く", () => {
    const rig = createPhotoCameraRig(INITIAL);
    const before = rig.pose().position;
    rig.pan(120, -40);
    const after = rig.pose().position;
    const moved =
      Math.abs(after.x - before.x) + Math.abs(after.y - before.y) + Math.abs(after.z - before.z);
    expect(moved).toBeGreaterThan(0);
  });
});

describe("look 向き変更", () => {
  it("位置が不変で視距離が不変", () => {
    const rig = createPhotoCameraRig(INITIAL);
    const before = rig.pose();
    const distBefore = vlen(direction(before));
    rig.look(200, 80);
    const after = rig.pose();
    expect(after.position).toEqual(before.position);
    expect(vlen(direction(after))).toBeCloseTo(distBefore, 6);
  });
  it("向きが実際に変わる", () => {
    const rig = createPhotoCameraRig(INITIAL);
    const before = direction(rig.pose());
    rig.look(200, 0);
    const after = direction(rig.pose());
    const changed = Math.abs(after.x - before.x) + Math.abs(after.z - before.z);
    expect(changed).toBeGreaterThan(0);
  });
  it("ピッチが制限を超えない（真上に振り切っても上向き成分が上限以内）", () => {
    const rig = createPhotoCameraRig(INITIAL);
    // 上方向へ大きく振り切る（負のdyで上を向く符号）。
    rig.look(0, -100000);
    const d = direction(rig.pose());
    const dist = vlen(d);
    const sinPitch = d.y / dist;
    expect(sinPitch).toBeLessThanOrEqual(Math.sin(PHOTO_MAX_PITCH_RADIANS) + 1e-6);
  });
});

describe("dolly ピンチ前後移動", () => {
  it("視線方向（注視点−位置）が不変", () => {
    const rig = createPhotoCameraRig(INITIAL);
    const before = direction(rig.pose());
    rig.dolly(100);
    const after = direction(rig.pose());
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    expect(after.z).toBeCloseTo(before.z, 6);
  });
  it("指を広げる（正）と視線方向へ前進し、元の注視点へ近づく", () => {
    const rig = createPhotoCameraRig(INITIAL);
    const p0 = rig.pose().position;
    const dir0 = direction(rig.pose());
    const len0 = vlen(dir0);
    const unit = { x: dir0.x / len0, y: dir0.y / len0, z: dir0.z / len0 };
    rig.dolly(100);
    const p1 = rig.pose().position;
    // 位置の移動が視線方向（前方）の正の向きに沿っている。
    const moveDot = (p1.x - p0.x) * unit.x + (p1.y - p0.y) * unit.y + (p1.z - p0.z) * unit.z;
    expect(moveDot).toBeGreaterThan(0);
  });
  it("指を狭める（負）と後退する", () => {
    const rig = createPhotoCameraRig(INITIAL);
    const p0 = rig.pose().position;
    const dir0 = direction(rig.pose());
    const len0 = vlen(dir0);
    const unit = { x: dir0.x / len0, y: dir0.y / len0, z: dir0.z / len0 };
    rig.dolly(-100);
    const p1 = rig.pose().position;
    const moveDot = (p1.x - p0.x) * unit.x + (p1.y - p0.y) * unit.y + (p1.z - p0.z) * unit.z;
    expect(moveDot).toBeLessThan(0);
  });
});

describe("決定性", () => {
  it("同じ操作列で同じ姿勢になる", () => {
    const a = createPhotoCameraRig(INITIAL);
    const b = createPhotoCameraRig(INITIAL);
    for (const [dx, dy] of [[30, 10], [-20, 5], [50, -15]] as const) {
      a.look(dx, dy);
      b.look(dx, dy);
      a.pan(dy, dx);
      b.pan(dy, dx);
    }
    expect(a.pose()).toEqual(b.pose());
  });
});
