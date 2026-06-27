import { describe, expect, it } from "vitest";
import {
  PITCH_AXIS_HEIGHT_FRACTION,
  PITCH_AXIS_TOP_MARGIN,
  slotBoundaryNormalizedY,
  slotCenterNormalizedY,
  slotDisplayNumber,
  slotIndexFromNormalizedY,
} from "./pitchSlotAxis";

describe("帯の定数", () => {
  it("帯割合は4分の3、上端余白は上下を等分した値", () => {
    expect(PITCH_AXIS_HEIGHT_FRACTION).toBeCloseTo(0.75, 10);
    expect(PITCH_AXIS_TOP_MARGIN).toBeCloseTo(0.125, 10);
  });
});

describe("slotBoundaryNormalizedY", () => {
  it("帯を slotCount 等分した境界の正規化Yを返す", () => {
    const slotCount = 7;
    expect(slotBoundaryNormalizedY(0, slotCount)).toBeCloseTo(0.125, 10);
    expect(slotBoundaryNormalizedY(1, slotCount)).toBeCloseTo(0.125 + (1 / 7) * 0.75, 10);
    expect(slotBoundaryNormalizedY(7, slotCount)).toBeCloseTo(0.875, 10);
  });
});

describe("slotCenterNormalizedY", () => {
  it("帯を slotCount 等分した区画の中央の正規化Yを返す", () => {
    const slotCount = 7;
    expect(slotCenterNormalizedY(0, slotCount)).toBeCloseTo(0.125 + (0.5 / 7) * 0.75, 10);
    expect(slotCenterNormalizedY(6, slotCount)).toBeCloseTo(0.125 + (6.5 / 7) * 0.75, 10);
  });
});

describe("slotIndexFromNormalizedY", () => {
  it("帯の両端と境界をスロット番号へ写す", () => {
    const slotCount = 7;
    // 帯の上端の正規化Y（0.125）は最上段、帯の下端（0.875）は最下段へ写る。
    expect(slotIndexFromNormalizedY(0.125, slotCount)).toBe(0);
    expect(slotIndexFromNormalizedY(0.875, slotCount)).toBe(6);
    // 帯の内側の境界は、番号が大きい方の区画（画面で下側）へ属する。
    expect(slotIndexFromNormalizedY(slotBoundaryNormalizedY(1, slotCount), slotCount)).toBe(1);
    expect(slotIndexFromNormalizedY(slotBoundaryNormalizedY(2, slotCount), slotCount)).toBe(2);
  });

  it("帯の外側と範囲外と非有限値を端・最上部へ丸める", () => {
    const slotCount = 7;
    // 帯の上の余白（0.125未満）は最上段、下の余白（0.875超）は最下段へ寄せる。
    expect(slotIndexFromNormalizedY(0, slotCount)).toBe(0);
    expect(slotIndexFromNormalizedY(1, slotCount)).toBe(6);
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
