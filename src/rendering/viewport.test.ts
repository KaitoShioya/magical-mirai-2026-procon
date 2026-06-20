import { describe, expect, it } from "vitest";
import {
  clampPixelRatio,
  computeAspect,
  computeBloomResolution,
  computeOverlayFrustum,
  overlayPointFromNormalized,
} from "./viewport";

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

describe("computeBloomResolution", () => {
  it("倍率0.5で表示寸法の半分を整数で返す", () => {
    expect(computeBloomResolution(800, 400, 0.5)).toEqual({ x: 400, y: 200 });
  });
  it("小数は切り捨てる", () => {
    // 391×0.5=195.5 → 195、845×0.5=422.5 → 422。
    expect(computeBloomResolution(391, 845, 0.5)).toEqual({ x: 195, y: 422 });
  });
  it("0以下・微小値・負値は下限1へ丸める", () => {
    expect(computeBloomResolution(0, 0, 0.5)).toEqual({ x: 1, y: 1 });
    // 1×0.5=0.5 → floor 0 → max(1,0)=1。
    expect(computeBloomResolution(1, 1, 0.5)).toEqual({ x: 1, y: 1 });
    expect(computeBloomResolution(-100, -100, 0.5)).toEqual({ x: 1, y: 1 });
  });
  it("非有限の入力は下限1へ丸める", () => {
    expect(computeBloomResolution(Number.NaN, 400, 0.5)).toEqual({ x: 1, y: 200 });
    expect(computeBloomResolution(800, Number.POSITIVE_INFINITY, 0.5)).toEqual({ x: 400, y: 1 });
  });
});

describe("computeOverlayFrustum", () => {
  it("正方形(縦横比1)では左右が-1と1・上下が1と-1", () => {
    expect(computeOverlayFrustum(500, 500)).toEqual({ left: -1, right: 1, top: 1, bottom: -1 });
  });
  it("横長(2対1)では左右が縦横比2へ広がり上下は不変", () => {
    expect(computeOverlayFrustum(800, 400)).toEqual({ left: -2, right: 2, top: 1, bottom: -1 });
  });
  it("縦長では左右の絶対値が1未満になり上下は不変", () => {
    const frustum = computeOverlayFrustum(390, 844);
    expect(frustum.top).toBe(1);
    expect(frustum.bottom).toBe(-1);
    expect(frustum.right).toBeCloseTo(390 / 844, 10);
    expect(frustum.left).toBeCloseTo(-(390 / 844), 10);
    expect(Math.abs(frustum.left)).toBeLessThan(1);
  });
  it("幅または高さが0以下・非有限なら縦横比1へ丸める", () => {
    expect(computeOverlayFrustum(800, 0)).toEqual({ left: -1, right: 1, top: 1, bottom: -1 });
    expect(computeOverlayFrustum(0, 400)).toEqual({ left: -1, right: 1, top: 1, bottom: -1 });
    expect(computeOverlayFrustum(Number.NaN, 400)).toEqual({
      left: -1,
      right: 1,
      top: 1,
      bottom: -1,
    });
  });
});

describe("overlayPointFromNormalized", () => {
  it("中央(0.5,0.5)は原点(0,0)へ写す", () => {
    expect(overlayPointFromNormalized(0.5, 0.5, 2)).toEqual({ x: 0, y: 0 });
  });
  it("左上(0,0)は(-縦横比, +1)へ写す", () => {
    expect(overlayPointFromNormalized(0, 0, 2)).toEqual({ x: -2, y: 1 });
  });
  it("右下(1,1)は(+縦横比, -1)へ写す", () => {
    expect(overlayPointFromNormalized(1, 1, 2)).toEqual({ x: 2, y: -1 });
  });
  it("非有限の入力は原点(0,0)へ丸める", () => {
    expect(overlayPointFromNormalized(Number.NaN, 0.5, 2)).toEqual({ x: 0, y: 0 });
    expect(overlayPointFromNormalized(0.5, Number.POSITIVE_INFINITY, 2)).toEqual({ x: 0, y: 0 });
    expect(overlayPointFromNormalized(0.5, 0.5, Number.NaN)).toEqual({ x: 0, y: 0 });
  });
});
