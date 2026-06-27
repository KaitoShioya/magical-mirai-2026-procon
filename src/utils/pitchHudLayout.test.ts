import { describe, expect, it } from "vitest";
import {
  LANE_BAND_LEFT_NORMALIZED_X,
  LANE_BAND_RIGHT_NORMALIZED_X,
  columnCenterX,
  laneBoundaryNormalizedX,
  laneCenterNormalizedX,
  laneWidthNormalizedX,
  overlayXFromNormalizedX,
  resolveSlotCount,
  slotIndexFromNormalizedX,
} from "./pitchHudLayout";

describe("帯の定数とレーン幅", () => {
  it("帯は左端から右端まで、1レーンの幅は帯幅をスロット数で割った値", () => {
    expect(LANE_BAND_LEFT_NORMALIZED_X).toBeCloseTo(0.02, 10);
    expect(LANE_BAND_RIGHT_NORMALIZED_X).toBeCloseTo(0.44, 10);
    const bandWidth = LANE_BAND_RIGHT_NORMALIZED_X - LANE_BAND_LEFT_NORMALIZED_X;
    expect(laneWidthNormalizedX(7)).toBeCloseTo(bandWidth / 7, 10);
  });
});

describe("resolveSlotCount", () => {
  const fallback = 7;
  it("未指定・1未満・非整数・非有限は予備値へ丸め、正の整数はその値を返す", () => {
    expect(resolveSlotCount(undefined, fallback)).toBe(7);
    expect(resolveSlotCount(5, fallback)).toBe(5);
    expect(resolveSlotCount(1, fallback)).toBe(1);
    expect(resolveSlotCount(0, fallback)).toBe(7);
    expect(resolveSlotCount(5.5, fallback)).toBe(7);
    expect(resolveSlotCount(Number.NaN, fallback)).toBe(7);
  });
});

describe("slotIndexFromNormalizedX", () => {
  const slotCount = 7;
  it("帯を等分したレーンへ写し、区間は隙間なく連続する（境界のわずか内側は右側、わずか手前は左側）", () => {
    // 境界ちょうどの値は浮動小数点の丸めでどちらの隣レーンへも落ちうる（実機の任意タップでは「失敗のない床」により
    // どちらでも有効音が鳴るため帰属は不問）。ここでは区間の連続性を検証するため、レーン幅のごく一部だけ境界の内側・手前へ
    // 寄せた点で帰属を確かめる。
    const inset = laneWidthNormalizedX(slotCount) * 0.001;
    expect(slotIndexFromNormalizedX(0, slotCount)).toBe(0);
    expect(slotIndexFromNormalizedX(LANE_BAND_LEFT_NORMALIZED_X + inset, slotCount)).toBe(0);
    expect(slotIndexFromNormalizedX(laneBoundaryNormalizedX(1, slotCount) + inset, slotCount)).toBe(1);
    expect(slotIndexFromNormalizedX(laneBoundaryNormalizedX(2, slotCount) + inset, slotCount)).toBe(2);
    expect(slotIndexFromNormalizedX(laneBoundaryNormalizedX(2, slotCount) - inset, slotCount)).toBe(1);
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
    const bandWidth = LANE_BAND_RIGHT_NORMALIZED_X - LANE_BAND_LEFT_NORMALIZED_X;
    expect(laneCenterNormalizedX(0, 7)).toBeCloseTo(LANE_BAND_LEFT_NORMALIZED_X + (0.5 / 7) * bandWidth, 10);
    expect(laneCenterNormalizedX(6, 7)).toBeCloseTo(LANE_BAND_LEFT_NORMALIZED_X + (6.5 / 7) * bandWidth, 10);
  });
});

describe("laneBoundaryNormalizedX", () => {
  it("境界0が帯左端、slotCount が帯右端", () => {
    const bandWidth = LANE_BAND_RIGHT_NORMALIZED_X - LANE_BAND_LEFT_NORMALIZED_X;
    expect(laneBoundaryNormalizedX(0, 7)).toBeCloseTo(LANE_BAND_LEFT_NORMALIZED_X, 10);
    expect(laneBoundaryNormalizedX(7, 7)).toBeCloseTo(LANE_BAND_RIGHT_NORMALIZED_X, 10);
    expect(laneBoundaryNormalizedX(1, 7)).toBeCloseTo(LANE_BAND_LEFT_NORMALIZED_X + bandWidth / 7, 10);
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
