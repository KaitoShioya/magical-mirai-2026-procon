import { describe, it, expect } from "vitest";
import { Quaternion, Vector3, Euler } from "three";
import {
  DEFAULT_ORIENTATION,
  facesCamera,
  isGroupBillboard,
  groupBillboardPosition,
} from "./orientation";

describe("向き方針の判定", () => {
  it("既定はカメラ正対・文字ごと（現挙動と一致）", () => {
    expect(DEFAULT_ORIENTATION.mode).toBe("faceCamera");
    expect(DEFAULT_ORIENTATION.granularity).toBe("perCharacter");
    expect(facesCamera(DEFAULT_ORIENTATION)).toBe(true);
    expect(isGroupBillboard(DEFAULT_ORIENTATION)).toBe(false);
  });

  it("固定はカメラ正対しない", () => {
    const policy = { mode: "fixed" as const };
    expect(facesCamera(policy)).toBe(false);
    expect(isGroupBillboard(policy)).toBe(false);
  });

  it("カメラ正対・群正対は群正対と判定する", () => {
    const policy = { mode: "faceCamera" as const, granularity: "asGroup" as const };
    expect(facesCamera(policy)).toBe(true);
    expect(isGroupBillboard(policy)).toBe(true);
  });
});

describe("群正対の位置計算", () => {
  it("基準点に、カメラ四元数で回した元オフセットを加える", () => {
    // カメラを Y 軸まわりに 90 度回した姿勢にする。
    // 理由: Y 軸 +90 度回転は +X を -Z へ写すため、結果が手計算で一意に定まり検証しやすい。
    const cameraQuaternion = new Quaternion().setFromEuler(new Euler(0, Math.PI / 2, 0));
    const basePosition = new Vector3(0, 4, 0);
    const originalOffset = new Vector3(2, 0, 0);

    const result = groupBillboardPosition(basePosition, originalOffset, cameraQuaternion);

    expect(result.x).toBeCloseTo(0, 5);
    expect(result.y).toBeCloseTo(4, 5);
    expect(result.z).toBeCloseTo(-2, 5);
  });

  it("元オフセットが零なら基準点を返す（単一文字や先頭文字に相当）", () => {
    const cameraQuaternion = new Quaternion().setFromEuler(new Euler(0, Math.PI / 2, 0));
    const basePosition = new Vector3(1, 2, 3);
    const originalOffset = new Vector3(0, 0, 0);

    const result = groupBillboardPosition(basePosition, originalOffset, cameraQuaternion);

    expect(result.x).toBeCloseTo(1, 5);
    expect(result.y).toBeCloseTo(2, 5);
    expect(result.z).toBeCloseTo(3, 5);
  });
});
