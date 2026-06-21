import { describe, expect, it } from "vitest";
import {
  JUDGE_DECAY_OUTER_WINDOW_MS,
  JUDGE_PERFECT_WINDOW_MS,
  JUDGE_POINT_ESTIMATE_WINDOW_MS,
} from "../config/tuning";
import { centeredDiffMs, isTimingJust, timingAccuracy } from "./timingAccuracy";
import type { JudgmentWindows } from "./types";

// 判定窓は tuning.ts の定数から組む（本テストで数値を再定義しない）。
const windows: JudgmentWindows = {
  perfectMs: JUDGE_PERFECT_WINDOW_MS,
  outerMs: JUDGE_DECAY_OUTER_WINDOW_MS,
};

describe("timingAccuracy 連続曲線（受け入れ基準1）", () => {
  it("満点窓内は1.0", () => {
    expect(timingAccuracy(0, windows)).toBe(1);
    expect(timingAccuracy(20, windows)).toBe(1);
    expect(timingAccuracy(39.999, windows)).toBe(1);
    expect(timingAccuracy(40, windows)).toBe(1);
  });

  it("満点窓の端を超えると厳密に1.0未満", () => {
    expect(timingAccuracy(40.001, windows)).toBeLessThan(1);
    expect(timingAccuracy(41, windows)).toBeCloseTo(0.98, 10);
  });

  it("満点窓と外端の間は線形（点推定60で0.6）", () => {
    expect(timingAccuracy(50, windows)).toBeCloseTo(0.8, 10);
    expect(timingAccuracy(JUDGE_POINT_ESTIMATE_WINDOW_MS, windows)).toBeCloseTo(0.6, 10);
    expect(timingAccuracy(65, windows)).toBeCloseTo(0.5, 10);
    expect(timingAccuracy(70, windows)).toBeCloseTo(0.4, 10);
  });

  it("外端の内側は0より大きく、外端以上は0", () => {
    expect(timingAccuracy(89.999, windows)).toBeGreaterThan(0);
    expect(timingAccuracy(90, windows)).toBe(0);
    expect(timingAccuracy(90.001, windows)).toBe(0);
    expect(timingAccuracy(91, windows)).toBe(0);
    expect(timingAccuracy(200, windows)).toBe(0);
  });

  it("負側も絶対値で対称", () => {
    expect(timingAccuracy(-40, windows)).toBe(1);
    expect(timingAccuracy(-60, windows)).toBeCloseTo(0.6, 10);
    expect(timingAccuracy(-90, windows)).toBe(0);
    expect(timingAccuracy(-100, windows)).toBe(0);
  });

  it("非有限値は床側0.0へ倒す", () => {
    expect(timingAccuracy(Number.NaN, windows)).toBe(0);
    expect(timingAccuracy(Number.POSITIVE_INFINITY, windows)).toBe(0);
    expect(timingAccuracy(Number.NEGATIVE_INFINITY, windows)).toBe(0);
  });
});

describe("centeredDiffMs 補正値（受け入れ基準3）", () => {
  it("補正値0なら素の時間差", () => {
    expect(centeredDiffMs(1020, 1000, 0)).toBe(20);
  });

  it("補正値を変えると判定窓の中心が移動する", () => {
    // 補正値+20: 本来+20ミリ秒だけ遅れていたタップの中心化差が0になり満点へ移る。
    expect(timingAccuracy(centeredDiffMs(1020, 1000, 20), windows)).toBe(1);
    // 補正値+20, 生差+70 → 中心化+50 → 0.8。
    expect(timingAccuracy(centeredDiffMs(1070, 1000, 20), windows)).toBeCloseTo(0.8, 10);
    // 補正値-20, 生差-60 → 中心化-40 → 1.0。
    expect(timingAccuracy(centeredDiffMs(940, 1000, -20), windows)).toBe(1);
  });
});

describe("isTimingJust と精度が同符号で動く（第2レビュー反映）", () => {
  it("満点境界40.0はJUST真かつ精度1.0、40.001はJUST偽かつ精度1.0未満", () => {
    expect(isTimingJust(40, windows)).toBe(true);
    expect(timingAccuracy(40, windows)).toBe(1);
    expect(isTimingJust(40.001, windows)).toBe(false);
    expect(timingAccuracy(40.001, windows)).toBeLessThan(1);
  });

  it("非有限値はJUST偽", () => {
    expect(isTimingJust(Number.NaN, windows)).toBe(false);
  });
});
