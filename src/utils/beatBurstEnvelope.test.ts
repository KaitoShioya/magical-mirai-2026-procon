import { describe, it, expect } from "vitest";
import { createBeatBurst } from "./beatBurstEnvelope";

// 許容差を1e-9にする理由を先に述べる。指数関数の評価は浮動小数点演算で微小な丸めが入るため、
// 厳密一致でなく、知覚に影響しない十分に小さい差で比較する。
const EPSILON = 1e-9;

describe("createBeatBurst", () => {
  it("発火直後（拍の真の開始時刻）は強度1.0", () => {
    const burst = createBeatBurst(120);
    burst.trigger(500, 0);
    expect(burst.intensityAt(500)).toBeCloseTo(1.0, 9);
  });

  it("時定数τ後は約0.368、3τ後は0.05未満", () => {
    const tau = 120;
    const burst = createBeatBurst(tau);
    burst.trigger(500, 0);
    // exp(-1) ≈ 0.3679。
    expect(burst.intensityAt(500 + tau)).toBeCloseTo(Math.exp(-1), 9);
    // exp(-3) ≈ 0.0498 < 0.05。次の強拍前に十分減衰する根拠。
    expect(burst.intensityAt(500 + 3 * tau)).toBeLessThan(0.05);
  });

  it("発火前は強度0", () => {
    const burst = createBeatBurst(120);
    expect(burst.intensityAt(0)).toBe(0);
    expect(burst.intensityAt(1000)).toBe(0);
  });

  it("拍の開始時刻より前の時刻は強度0", () => {
    const burst = createBeatBurst(120);
    burst.trigger(500, 0);
    expect(burst.intensityAt(499)).toBe(0);
  });

  it("reset で未発火（強度0）へ戻る", () => {
    const burst = createBeatBurst(120);
    burst.trigger(500, 0);
    expect(burst.intensityAt(500)).toBeCloseTo(1.0, 9);
    burst.reset();
    expect(burst.intensityAt(500)).toBe(0);
  });

  it("遅延補正: フレーム落ちで発火が遅れても、最初の評価で経過分だけ減衰した値が返る", () => {
    const tau = 120;
    const burst = createBeatBurst(tau);
    // 拍は時刻500に開始したが、発火フレームは80ミリ秒遅れて時刻580で届いた。
    const beatTimeMs = 500;
    const elapsedSinceBeatMs = 80;
    burst.trigger(beatTimeMs, elapsedSinceBeatMs);
    // 最初に評価する時刻は発火フレーム時刻（拍時刻 + 経過）。経過分だけ減衰した値になる。
    const firstFrameTimeMs = beatTimeMs + elapsedSinceBeatMs;
    expect(burst.intensityAt(firstFrameTimeMs)).toBeCloseTo(Math.exp(-elapsedSinceBeatMs / tau), 9);
  });

  it("単調減少・非負・上限1: 発火後の時間経過で強度が増えず0以上1以下に収まる", () => {
    const burst = createBeatBurst(120);
    burst.trigger(500, 0);
    let previous = Number.POSITIVE_INFINITY;
    for (let t = 500; t <= 500 + 600; t += 20) {
      const value = burst.intensityAt(t);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1 + EPSILON);
      expect(value).toBeLessThanOrEqual(previous + EPSILON);
      previous = value;
    }
  });

  it("再発火で基準時刻が更新され、新しい強拍からの減衰になる", () => {
    const burst = createBeatBurst(120);
    burst.trigger(500, 0);
    burst.trigger(1500, 0);
    // 新しい強拍時刻1500で強度1.0、古い強拍時刻500は基準でなくなる。
    expect(burst.intensityAt(1500)).toBeCloseTo(1.0, 9);
    expect(burst.intensityAt(1499)).toBe(0);
  });

  it("有限でない拍時刻は無視され、基準が壊れない", () => {
    const burst = createBeatBurst(120);
    burst.trigger(500, 0);
    burst.trigger(Number.NaN, 0);
    // NaN の発火は無視され、直前の有効な強拍500が基準のまま。
    expect(burst.intensityAt(500)).toBeCloseTo(1.0, 9);
  });

  it("有限でない評価時刻は強度0", () => {
    const burst = createBeatBurst(120);
    burst.trigger(500, 0);
    expect(burst.intensityAt(Number.NaN)).toBe(0);
  });

  it("減衰時定数が正でないと生成時に失敗する", () => {
    expect(() => createBeatBurst(0)).toThrow();
    expect(() => createBeatBurst(-1)).toThrow();
    expect(() => createBeatBurst(Number.NaN)).toThrow();
  });
});
