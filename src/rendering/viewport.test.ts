import { describe, expect, it } from "vitest";
import { clampPixelRatio, computeAspect } from "./viewport";

describe("clampPixelRatio", () => {
  it("上限以下はそのまま返す", () => {
    expect(clampPixelRatio(1, 2)).toBe(1);
    expect(clampPixelRatio(2, 2)).toBe(2);
  });
  it("上限を超える値は上限へ抑える", () => {
    expect(clampPixelRatio(3, 2)).toBe(2);
  });
  it("非有限値・0以下は等倍へ丸める", () => {
    expect(clampPixelRatio(Number.NaN, 2)).toBe(1);
    expect(clampPixelRatio(Number.POSITIVE_INFINITY, 2)).toBe(1);
    expect(clampPixelRatio(0, 2)).toBe(1);
    expect(clampPixelRatio(-1, 2)).toBe(1);
  });
});

describe("computeAspect", () => {
  it("幅÷高さを返す", () => {
    expect(computeAspect(800, 400)).toBe(2);
    expect(computeAspect(390, 844)).toBeCloseTo(390 / 844, 10);
  });
  it("幅または高さが0以下・非有限なら正方形(1)を返す", () => {
    expect(computeAspect(800, 0)).toBe(1);
    expect(computeAspect(800, -10)).toBe(1);
    expect(computeAspect(0, 400)).toBe(1);
    expect(computeAspect(-10, 400)).toBe(1);
    expect(computeAspect(Number.NaN, 400)).toBe(1);
    expect(computeAspect(800, Number.NaN)).toBe(1);
  });
});
