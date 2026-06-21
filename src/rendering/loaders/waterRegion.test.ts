import { describe, it, expect } from "vitest";
import { waterRegionFromBounds, WATER_HEIGHT_EPSILON } from "./waterRegion";

describe("waterRegionFromBounds（水面マーカーの境界箱から水面領域を求める）", () => {
  it("水平な境界箱から幅・奥行き・中心・高さを正しく求める", () => {
    const region = waterRegionFromBounds(
      { minX: -240, maxX: 240, minY: -0.05, maxY: -0.05, minZ: -188, maxZ: 188 },
      WATER_HEIGHT_EPSILON,
      "water"
    );
    expect(region.width).toBe(480);
    expect(region.depth).toBe(376);
    expect(region.centerX).toBe(0);
    expect(region.centerZ).toBe(0);
    expect(region.y).toBeCloseTo(-0.05, 6);
  });

  it("中心がずれた境界箱でも中心座標を正しく求める", () => {
    const region = waterRegionFromBounds(
      { minX: 10, maxX: 30, minY: 1, maxY: 1, minZ: -4, maxZ: 6 },
      WATER_HEIGHT_EPSILON,
      "water"
    );
    expect(region.width).toBe(20);
    expect(region.depth).toBe(10);
    expect(region.centerX).toBe(20);
    expect(region.centerZ).toBe(1);
    expect(region.y).toBe(1);
  });

  it("高さの差が許容値を超える（水平でない）とき例外を投げる", () => {
    expect(() =>
      waterRegionFromBounds(
        { minX: -1, maxX: 1, minY: 0, maxY: 0.5, minZ: -1, maxZ: 1 },
        WATER_HEIGHT_EPSILON,
        "water"
      )
    ).toThrow();
  });

  it("高さの差がちょうど許容値のときは水平とみなし例外を投げない", () => {
    expect(() =>
      waterRegionFromBounds(
        { minX: -1, maxX: 1, minY: 0, maxY: WATER_HEIGHT_EPSILON, minZ: -1, maxZ: 1 },
        WATER_HEIGHT_EPSILON,
        "water"
      )
    ).not.toThrow();
  });
});
