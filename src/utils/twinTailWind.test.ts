import { describe, it, expect } from "vitest";
import { Vector3 } from "three";
import { twinTailWind, type TwinTailWindParams } from "./twinTailWind";

// 後方かつ上向きの基本方向（ミク局所座標）。奥行きの負を後方、正のyを上とみなす。
const PARAMS: TwinTailWindParams = {
  baseDirectionLocal: { x: 0, y: 0.4, z: -1 },
  power: 1.2,
  oscillationAmplitude: 0.4,
  oscillationFrequencyHz: 0.5,
};

const baseUnit = new Vector3(0, 0.4, -1).normalize();

describe("twinTailWind", () => {
  it("常に単位ベクトルを返す", () => {
    for (let t = 0; t <= 4; t += 0.25) {
      const { directionLocal } = twinTailWind(t, PARAMS, 0);
      expect(directionLocal.length()).toBeCloseTo(1, 6);
    }
  });

  it("強さをそのまま返す", () => {
    expect(twinTailWind(1.3, PARAMS, 0).power).toBe(1.2);
  });

  it("どの時刻でも風方向と基本方向の内積が正の一定以上を保つ（垂れと明確に区別できる）", () => {
    // 振幅0.4のとき、直交成分の最大は0.4。基本方向(単位)と直交成分(直交・大きさ0.4)の合成を正規化すると
    // 内積は最小で 1/sqrt(1+0.4^2)=0.928。垂れ(真下)との内積は負になるため、0.9超で十分に区別できる。
    let minDot = Infinity;
    for (let t = 0; t <= 4; t += 0.1) {
      const { directionLocal } = twinTailWind(t, PARAMS, 1.0);
      minDot = Math.min(minDot, directionLocal.dot(baseUnit));
    }
    expect(minDot).toBeGreaterThan(0.9);
  });

  it("揺らぎ振幅0なら基本方向に一致する", () => {
    const flat = twinTailWind(2.0, { ...PARAMS, oscillationAmplitude: 0 }, 0.7);
    expect(flat.directionLocal.x).toBeCloseTo(baseUnit.x, 6);
    expect(flat.directionLocal.y).toBeCloseTo(baseUnit.y, 6);
    expect(flat.directionLocal.z).toBeCloseTo(baseUnit.z, 6);
  });

  it("位相差が異なると同時刻でも方向が異なる（左右が同じ動きで固まらない）", () => {
    // 位相差0とπでは正弦が逆符号になり、直交成分の向きが反転するため方向がはっきり分かれる時刻を選ぶ。
    const t = 0.5; // 角度 = 2π*0.5*0.5 = π/2 → sin=1 で揺らぎが最大、位相πでは sin(3π/2)=-1
    const left = twinTailWind(t, PARAMS, 0);
    const right = twinTailWind(t, PARAMS, Math.PI);
    expect(left.directionLocal.distanceTo(right.directionLocal)).toBeGreaterThan(0.1);
  });
});
