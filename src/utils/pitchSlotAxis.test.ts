import { describe, expect, it } from "vitest";
import {
  slotBoundaryNormalizedY,
  slotCenterNormalizedY,
  slotDisplayNumber,
  slotIndexFromNormalizedY,
} from "./pitchSlotAxis";

describe("slotBoundaryNormalizedY", () => {
  it("境界番号を slotCount で割った値を返す", () => {
    const slotCount = 7;
    expect(slotBoundaryNormalizedY(0, slotCount)).toBeCloseTo(0, 10);
    expect(slotBoundaryNormalizedY(1, slotCount)).toBeCloseTo(1 / 7, 10);
    expect(slotBoundaryNormalizedY(7, slotCount)).toBeCloseTo(1, 10);
  });
});

describe("slotCenterNormalizedY", () => {
  it("帯の中央の正規化Yを返す", () => {
    const slotCount = 7;
    expect(slotCenterNormalizedY(0, slotCount)).toBeCloseTo(0.5 / 7, 10);
    expect(slotCenterNormalizedY(6, slotCount)).toBeCloseTo(6.5 / 7, 10);
  });
});

describe("slotIndexFromNormalizedY", () => {
  it("両端と境界をスロット番号へ写す", () => {
    const slotCount = 7;
    expect(slotIndexFromNormalizedY(0, slotCount)).toBe(0);
    expect(slotIndexFromNormalizedY(1, slotCount)).toBe(6);
    expect(slotIndexFromNormalizedY(1 / 7, slotCount)).toBe(1);
    expect(slotIndexFromNormalizedY(2 / 7, slotCount)).toBe(2);
  });

  it("範囲外と非有限値を端・最上部へ丸める", () => {
    const slotCount = 7;
    expect(slotIndexFromNormalizedY(-0.5, slotCount)).toBe(0);
    expect(slotIndexFromNormalizedY(1.5, slotCount)).toBe(6);
    expect(slotIndexFromNormalizedY(Number.NaN, slotCount)).toBe(0);
    expect(slotIndexFromNormalizedY(Number.POSITIVE_INFINITY, slotCount)).toBe(0);
    expect(slotIndexFromNormalizedY(Number.NEGATIVE_INFINITY, slotCount)).toBe(0);
  });
});

describe("slotCenterNormalizedY と slotIndexFromNormalizedY の往復", () => {
  it("中央の正規化Yを写すと元のスロット番号へ戻る", () => {
    for (const slotCount of [5, 7, 9]) {
      for (let i = 0; i < slotCount; i += 1) {
        const center = slotCenterNormalizedY(i, slotCount);
        expect(slotIndexFromNormalizedY(center, slotCount)).toBe(i);
      }
    }
  });
});

describe("slotDisplayNumber", () => {
  it("0始まりのスロット番号を1始まりの表示番号へ写す", () => {
    expect(slotDisplayNumber(0)).toBe(1);
    expect(slotDisplayNumber(6)).toBe(7);
  });
});
