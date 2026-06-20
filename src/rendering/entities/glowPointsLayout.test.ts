import { describe, expect, it } from "vitest";
import { areaUniformRadius, polarToXZ } from "./glowPointsLayout";

describe("areaUniformRadius", () => {
  it("0は中心(半径0)、1は最大半径を返す", () => {
    expect(areaUniformRadius(0, 28)).toBe(0);
    expect(areaUniformRadius(1, 28)).toBe(28);
  });
  it("平方根で半径を求める（0.25は最大半径の半分）", () => {
    // √0.25 = 0.5 のため 0.5 × 28 = 14。
    expect(areaUniformRadius(0.25, 28)).toBe(14);
  });
  it("入力が増えると半径も単調に増える", () => {
    const a = areaUniformRadius(0.25, 28);
    const b = areaUniformRadius(0.5, 28);
    const c = areaUniformRadius(1, 28);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });
  it("0未満は中心へ、1超は最大半径へ丸める", () => {
    expect(areaUniformRadius(-0.5, 28)).toBe(0);
    expect(areaUniformRadius(1.5, 28)).toBe(28);
  });
  it("非有限値(非数・無限大)は中心(半径0)へ丸める", () => {
    expect(areaUniformRadius(Number.NaN, 28)).toBe(0);
    expect(areaUniformRadius(Number.POSITIVE_INFINITY, 28)).toBe(0);
  });
});

describe("polarToXZ", () => {
  it("角0は+x方向、角90度は+z方向へ写す", () => {
    const east = polarToXZ(10, 0);
    expect(east.x).toBeCloseTo(10, 10);
    expect(east.z).toBeCloseTo(0, 10);
    const north = polarToXZ(10, Math.PI / 2);
    expect(north.x).toBeCloseTo(0, 10);
    expect(north.z).toBeCloseTo(10, 10);
  });
  it("半径0は原点を返す", () => {
    const origin = polarToXZ(0, 1.234);
    expect(origin.x).toBeCloseTo(0, 10);
    expect(origin.z).toBeCloseTo(0, 10);
  });
});
