import { describe, expect, it } from "vitest";
import { reactionToScale, reactionToBrightness } from "./sunflowerReactionMapping";
import {
  SUNFLOWER_BRIGHTNESS_MAX,
  SUNFLOWER_BRIGHTNESS_MIN,
  SUNFLOWER_SCALE_MAX,
  SUNFLOWER_SCALE_MIN,
} from "../constants";

// 反応強度（0以上1以下の素の数値）から大きさ・輝度への写像の純粋関数を検証する。three.js には依存しない。

describe("reactionToScale（大きさ強度→大きさ）", () => {
  it("強度0で最小、強度1で最大", () => {
    expect(reactionToScale(0)).toBeCloseTo(SUNFLOWER_SCALE_MIN, 5);
    expect(reactionToScale(1)).toBeCloseTo(SUNFLOWER_SCALE_MAX, 5);
  });

  it("強度0.5で最小と最大の中点（線形）", () => {
    expect(reactionToScale(0.5)).toBeCloseTo((SUNFLOWER_SCALE_MIN + SUNFLOWER_SCALE_MAX) / 2, 5);
  });

  it("強度に対して単調増加", () => {
    expect(reactionToScale(0.25)).toBeLessThan(reactionToScale(0.75));
  });

  it("範囲外は0以上1以下へ丸める", () => {
    expect(reactionToScale(-1)).toBeCloseTo(SUNFLOWER_SCALE_MIN, 5);
    expect(reactionToScale(2)).toBeCloseTo(SUNFLOWER_SCALE_MAX, 5);
  });

  it("最小は0と区別できる正の値", () => {
    expect(SUNFLOWER_SCALE_MIN).toBeGreaterThan(0);
  });

  it("非有限値は例外", () => {
    expect(() => reactionToScale(Number.NaN)).toThrow();
    expect(() => reactionToScale(Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe("reactionToBrightness（輝度強度→輝度）", () => {
  it("強度0で最小、強度1で最大", () => {
    expect(reactionToBrightness(0)).toBeCloseTo(SUNFLOWER_BRIGHTNESS_MIN, 5);
    expect(reactionToBrightness(1)).toBeCloseTo(SUNFLOWER_BRIGHTNESS_MAX, 5);
  });

  it("強度に対して単調増加", () => {
    expect(reactionToBrightness(0.25)).toBeLessThan(reactionToBrightness(0.75));
  });

  it("範囲外は0以上1以下へ丸める", () => {
    expect(reactionToBrightness(-1)).toBeCloseTo(SUNFLOWER_BRIGHTNESS_MIN, 5);
    expect(reactionToBrightness(2)).toBeCloseTo(SUNFLOWER_BRIGHTNESS_MAX, 5);
  });

  it("最小はブルーム下限と消失の境を分ける正の値", () => {
    expect(SUNFLOWER_BRIGHTNESS_MIN).toBeGreaterThan(0);
  });

  it("非有限値は例外", () => {
    expect(() => reactionToBrightness(Number.NaN)).toThrow();
    expect(() => reactionToBrightness(Number.NEGATIVE_INFINITY)).toThrow();
  });
});
