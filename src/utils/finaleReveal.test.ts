import { describe, expect, it } from "vitest";
import {
  finaleLocalProgress,
  finalePulse,
  finaleBrightnessMultiplier,
  isFinaleComplete,
  type FinaleParams,
} from "./finaleReveal";

const PARAMS: FinaleParams = {
  riseDurationSec: 1.2,
  staggerTotalSec: 1.0,
  brightnessOvershoot: 0.4,
};

describe("finaleLocalProgress 局所進行", () => {
  it("開始の時間差の前は0、十分な経過で1", () => {
    // index 2/総数5 → 開始は (1.0/4)*2 = 0.5秒。
    expect(finaleLocalProgress(0, 2, 5, PARAMS)).toBe(0);
    expect(finaleLocalProgress(0.4, 2, 5, PARAMS)).toBe(0); // 開始前
    expect(finaleLocalProgress(0.5 + 1.2 + 0.1, 2, 5, PARAMS)).toBe(1); // 開始+継続を超える
  });
  it("経過時間に対して単調非減少", () => {
    let prev = -1;
    for (let t = 0; t <= 3; t += 0.1) {
      const v = finaleLocalProgress(t, 3, 8, PARAMS);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
  it("同じ経過時間では配置順が後の個体ほど進行が小さい（時間差）", () => {
    const early = finaleLocalProgress(0.6, 0, 5, PARAMS);
    const late = finaleLocalProgress(0.6, 4, 5, PARAMS);
    expect(early).toBeGreaterThan(late);
  });
  it("総数1で0除算しない（開始は0）", () => {
    expect(finaleLocalProgress(1.2, 0, 1, PARAMS)).toBe(1);
    expect(finaleLocalProgress(0, 0, 1, PARAMS)).toBe(0);
  });
});

describe("finalePulse 点灯の盛り上がりの形", () => {
  it("局所進行0と1で0、中ほどで最大", () => {
    expect(finalePulse(0)).toBeCloseTo(0, 6);
    expect(finalePulse(1)).toBeCloseTo(0, 6);
    expect(finalePulse(0.5)).toBeCloseTo(1, 6);
  });
});

describe("finaleBrightnessMultiplier 輝度倍率", () => {
  it("局所進行0と1で1.0（暗転しない）、中ほどで1.0超", () => {
    expect(finaleBrightnessMultiplier(0, 0.4)).toBeCloseTo(1, 6);
    expect(finaleBrightnessMultiplier(1, 0.4)).toBeCloseTo(1, 6);
    expect(finaleBrightnessMultiplier(0.5, 0.4)).toBeCloseTo(1.4, 6);
  });
  it("どの局所進行でも1.0を下回らない", () => {
    for (let t = 0; t <= 1; t += 0.05) {
      expect(finaleBrightnessMultiplier(t, 0.4)).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("isFinaleComplete 完了判定", () => {
  it("時間差合計＋継続を超えたら完了", () => {
    expect(isFinaleComplete(2.2 - 0.01, PARAMS)).toBe(false);
    expect(isFinaleComplete(2.2, PARAMS)).toBe(true);
  });
});
