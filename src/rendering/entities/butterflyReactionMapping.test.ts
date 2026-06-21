import { describe, expect, it } from "vitest";
import { reactionToScale, reactionToBrightness } from "./butterflyReactionMapping";
import {
  BUTTERFLY_BRIGHTNESS_MAX,
  BUTTERFLY_BRIGHTNESS_MIN,
  BUTTERFLY_SCALE_MAX,
  BUTTERFLY_SCALE_MIN,
} from "../constants";

// 反応強度（0〜1の精度）から大きさ・輝度への写像の純粋関数を検証する。three.js には依存しない。

describe("reactionToScale（タイミング精度→大きさ）", () => {
  it("精度0で最小、精度1で最大", () => {
    expect(reactionToScale(0)).toBeCloseTo(BUTTERFLY_SCALE_MIN, 5);
    expect(reactionToScale(1)).toBeCloseTo(BUTTERFLY_SCALE_MAX, 5);
  });

  it("精度0.5で最小と最大の中点（線形）", () => {
    expect(reactionToScale(0.5)).toBeCloseTo((BUTTERFLY_SCALE_MIN + BUTTERFLY_SCALE_MAX) / 2, 5);
  });

  it("精度に対して単調増加", () => {
    expect(reactionToScale(0.25)).toBeLessThan(reactionToScale(0.75));
  });

  it("範囲外は0〜1へ丸める", () => {
    expect(reactionToScale(-1)).toBeCloseTo(BUTTERFLY_SCALE_MIN, 5);
    expect(reactionToScale(2)).toBeCloseTo(BUTTERFLY_SCALE_MAX, 5);
  });

  it("最小は0と区別できる正の値", () => {
    expect(BUTTERFLY_SCALE_MIN).toBeGreaterThan(0);
  });

  it("非有限値は例外", () => {
    expect(() => reactionToScale(Number.NaN)).toThrow();
    expect(() => reactionToScale(Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe("reactionToBrightness（音程精度→輝度）", () => {
  it("精度0で最小、精度1で最大", () => {
    expect(reactionToBrightness(0)).toBeCloseTo(BUTTERFLY_BRIGHTNESS_MIN, 5);
    expect(reactionToBrightness(1)).toBeCloseTo(BUTTERFLY_BRIGHTNESS_MAX, 5);
  });

  it("精度に対して単調増加", () => {
    expect(reactionToBrightness(0.25)).toBeLessThan(reactionToBrightness(0.75));
  });

  it("範囲外は0〜1へ丸める", () => {
    expect(reactionToBrightness(-1)).toBeCloseTo(BUTTERFLY_BRIGHTNESS_MIN, 5);
    expect(reactionToBrightness(2)).toBeCloseTo(BUTTERFLY_BRIGHTNESS_MAX, 5);
  });

  it("最小は寿命フェードと合成しても消失と混同しない正の値", () => {
    expect(BUTTERFLY_BRIGHTNESS_MIN).toBeGreaterThan(0);
  });

  it("非有限値は例外", () => {
    expect(() => reactionToBrightness(Number.NaN)).toThrow();
    expect(() => reactionToBrightness(Number.NEGATIVE_INFINITY)).toThrow();
  });
});
