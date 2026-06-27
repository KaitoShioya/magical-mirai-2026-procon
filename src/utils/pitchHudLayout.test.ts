import { describe, expect, it } from "vitest";
import {
  LANE_BAND_LEFT_NORMALIZED_X,
  LANE_BAND_RIGHT_NORMALIZED_X,
  columnCenterX,
  laneBoundaryNormalizedX,
  laneCenterNormalizedX,
  laneWidthNormalizedX,
  overlayXFromNormalizedX,
  slotIndexFromNormalizedX,
} from "./pitchHudLayout";

describe("帯の定数とレーン幅", () => {
  it("帯は正規化X 0 から 0.42、1レーンの幅は帯幅をスロット数で割った値", () => {
    expect(LANE_BAND_LEFT_NORMALIZED_X).toBeCloseTo(0, 10);
    expect(LANE_BAND_RIGHT_NORMALIZED_X).toBeCloseTo(0.42, 10);
    expect(laneWidthNormalizedX(7)).toBeCloseTo(0.42 / 7, 10);
  });
});

describe("slotIndexFromNormalizedX", () => {
  const slotCount = 7;
  it("帯を等分したレーンへ写し、レーンの境界は右側のレーンに属する", () => {
    expect(slotIndexFromNormalizedX(0, slotCount)).toBe(0);
    expect(slotIndexFromNormalizedX(0.03, slotCount)).toBe(0);
    expect(slotIndexFromNormalizedX(laneBoundaryNormalizedX(1, slotCount), slotCount)).toBe(1);
    expect(slotIndexFromNormalizedX(laneBoundaryNormalizedX(2, slotCount), slotCount)).toBe(2);
  });
  it("帯の外側は最近接の端レーンへ寄せ、非有限値は最も左のレーンへ丸める", () => {
    expect(slotIndexFromNormalizedX(-0.5, slotCount)).toBe(0);
    expect(slotIndexFromNormalizedX(0.42, slotCount)).toBe(6);
    expect(slotIndexFromNormalizedX(1, slotCount)).toBe(6);
    expect(slotIndexFromNormalizedX(Number.NaN, slotCount)).toBe(0);
    expect(slotIndexFromNormalizedX(Number.POSITIVE_INFINITY, slotCount)).toBe(0);
  });
});

describe("laneCenterNormalizedX と往復の不変条件", () => {
  it("レーンの中央を写すと元のレーン番号へ戻る（表示と入力の一致の根拠）", () => {
    for (const slotCount of [5, 7, 9]) {
      for (let i = 0; i < slotCount; i += 1) {
        const center = laneCenterNormalizedX(i, slotCount);
        expect(slotIndexFromNormalizedX(center, slotCount)).toBe(i);
      }
    }
  });
  it("レーン0の中央と最終レーンの中央は帯の式に従う", () => {
    expect(laneCenterNormalizedX(0, 7)).toBeCloseTo((0.5 / 7) * 0.42, 10);
    expect(laneCenterNormalizedX(6, 7)).toBeCloseTo((6.5 / 7) * 0.42, 10);
  });
});

describe("laneBoundaryNormalizedX", () => {
  it("境界0が帯左端、slotCount が帯右端", () => {
    expect(laneBoundaryNormalizedX(0, 7)).toBeCloseTo(0, 10);
    expect(laneBoundaryNormalizedX(7, 7)).toBeCloseTo(0.42, 10);
    expect(laneBoundaryNormalizedX(1, 7)).toBeCloseTo(0.42 / 7, 10);
  });
});

describe("columnCenterX（2次元層の横位置）", () => {
  const aspect = 844 / 390;
  const slotCount = 7;
  it("レーン番号0が最も左、最終レーンが最も右で、番号順に単調に増える", () => {
    const centers = [];
    for (let i = 0; i < slotCount; i += 1) {
      centers.push(columnCenterX(i, slotCount, aspect));
    }
    for (let i = 1; i < slotCount; i += 1) {
      expect(centers[i]).toBeGreaterThan(centers[i - 1]);
    }
  });
  it("レーン中心の正規化Xを2次元層へ写した値と一致する", () => {
    for (let i = 0; i < slotCount; i += 1) {
      const expected = overlayXFromNormalizedX(laneCenterNormalizedX(i, slotCount), aspect);
      expect(columnCenterX(i, slotCount, aspect)).toBeCloseTo(expected, 10);
    }
  });
});
