import { describe, expect, it } from "vitest";
import { fadeFactor, lifeProgress, riseOffset, swayOffset } from "./butterflyLifecycle";
import { BUTTERFLY_FADE_IN_FRACTION, BUTTERFLY_FADE_OUT_START } from "../constants";

// 「舞って消える」寿命の純粋関数を検証する。three.js には依存しない。

describe("lifeProgress（経過の正規化）", () => {
  it("開始で0、半分で0.5、寿命到達で1", () => {
    expect(lifeProgress(0, 1.2)).toBeCloseTo(0, 5);
    expect(lifeProgress(0.6, 1.2)).toBeCloseTo(0.5, 5);
    expect(lifeProgress(1.2, 1.2)).toBeCloseTo(1, 5);
  });

  it("寿命を超えた経過は1へ丸める", () => {
    expect(lifeProgress(5, 1.2)).toBeCloseTo(1, 5);
  });

  it("寿命が0以下は例外", () => {
    expect(() => lifeProgress(0.5, 0)).toThrow();
    expect(() => lifeProgress(0.5, -1)).toThrow();
  });

  it("非有限値は例外", () => {
    expect(() => lifeProgress(Number.NaN, 1.2)).toThrow();
    expect(() => lifeProgress(0.5, Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe("riseOffset（上昇量）", () => {
  it("開始で0、速度×経過で線形に上昇", () => {
    expect(riseOffset(0, 1.5)).toBeCloseTo(0, 5);
    expect(riseOffset(2, 1.5)).toBeCloseTo(3, 5);
  });

  it("経過に対して単調増加（正の速度）", () => {
    expect(riseOffset(1, 1.5)).toBeLessThan(riseOffset(2, 1.5));
  });

  it("非有限値は例外", () => {
    expect(() => riseOffset(Number.NaN, 1.5)).toThrow();
    expect(() => riseOffset(1, Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe("swayOffset（上昇中の横揺れ）", () => {
  it("水平面の片方向（x）に揺れ、もう一方（z）は動かない", () => {
    const offset = swayOffset(0.3, 0.7, 0.25);
    expect(offset.z).toBe(0);
    expect(Math.abs(offset.x)).toBeLessThanOrEqual(0.25 + 1e-9);
  });

  it("振幅0なら横揺れなし", () => {
    const offset = swayOffset(0.3, 0.7, 0);
    expect(offset.x).toBeCloseTo(0, 5);
  });

  it("非有限値は例外", () => {
    expect(() => swayOffset(Number.NaN, 0, 0.25)).toThrow();
    expect(() => swayOffset(0.3, Number.NaN, 0.25)).toThrow();
    expect(() => swayOffset(0.3, 0, Number.NaN)).toThrow();
  });
});

describe("fadeFactor（出現→中盤→消滅）", () => {
  it("開始は0、立ち上がり完了で1", () => {
    expect(fadeFactor(0)).toBeCloseTo(0, 5);
    expect(fadeFactor(BUTTERFLY_FADE_IN_FRACTION)).toBeCloseTo(1, 5);
  });

  it("中盤は1を保つ", () => {
    const middle = (BUTTERFLY_FADE_IN_FRACTION + BUTTERFLY_FADE_OUT_START) / 2;
    expect(fadeFactor(middle)).toBeCloseTo(1, 5);
  });

  it("フェードアウト開始で1、寿命末で0", () => {
    expect(fadeFactor(BUTTERFLY_FADE_OUT_START)).toBeCloseTo(1, 5);
    expect(fadeFactor(1)).toBeCloseTo(0, 5);
  });

  it("終盤は減少する", () => {
    const a = (BUTTERFLY_FADE_OUT_START + 1) / 2;
    expect(fadeFactor(a)).toBeLessThan(1);
    expect(fadeFactor(a)).toBeGreaterThan(0);
  });

  it("全域で0以上1以下", () => {
    for (let u = -0.2; u <= 1.2; u += 0.1) {
      const value = fadeFactor(u);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});
