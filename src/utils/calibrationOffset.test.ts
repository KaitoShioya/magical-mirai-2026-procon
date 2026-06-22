import { describe, it, expect } from "vitest";
import { estimateCalibrationOffsetMs } from "./calibrationOffset";

// 共通の選択肢。外れ値閾値は較正UIの既定（200ミリ秒）、フォールバックは未較正の既定（0ミリ秒）に揃える。
const OPTIONS = { outlierThresholdMs: 200, fallbackMs: 0 };

describe("estimateCalibrationOffsetMs", () => {
  it("一貫して遅れたタップの中央値を正の補正値として返す", () => {
    const blinks = [1000, 1600, 2200, 2800];
    const taps = [1030, 1630, 2230, 2830]; // すべて点滅より+30ミリ秒遅れ
    const result = estimateCalibrationOffsetMs(blinks, taps, OPTIONS);
    expect(result.offsetMs).toBe(30);
    expect(result.sampleCount).toBe(4);
  });

  it("同じ点滅への二度押しは最も近い1タップだけを採り、採用数は点滅数に等しい", () => {
    const blinks = [1000, 1600, 2200, 2800];
    // 点滅0に2タップ（+20と+190）。残りは各+20。
    const taps = [1020, 1190, 1620, 2220, 2820];
    const result = estimateCalibrationOffsetMs(blinks, taps, OPTIONS);
    // 二度押しの遠い方（+190）は捨てられ、採用は4（点滅数）であって5ではない。
    expect(result.sampleCount).toBe(4);
    expect(result.offsetMs).toBe(20);
  });

  it("外れ値のタップを除外してから中央値を取る", () => {
    const blinks = [1000, 1600, 2200, 2800];
    // 点滅3のタップは+300で閾値200超のため除外。残り3つは+20。
    const taps = [1020, 1620, 2220, 3100];
    const result = estimateCalibrationOffsetMs(blinks, taps, OPTIONS);
    expect(result.offsetMs).toBe(20);
    expect(result.sampleCount).toBe(3);
  });

  it("点滅より早いタップは負の補正値になる", () => {
    const blinks = [1000, 1600, 2200, 2800];
    const taps = [975, 1575, 2175, 2775]; // すべて-25ミリ秒
    const result = estimateCalibrationOffsetMs(blinks, taps, OPTIONS);
    expect(result.offsetMs).toBe(-25);
    expect(result.sampleCount).toBe(4);
  });

  it("採用できるタップが無ければ採用数0とフォールバック値を返す", () => {
    const blinks = [1000, 1600, 2200, 2800];
    const taps = [1300, 1900, 2500, 3100]; // すべて点滅から+300（閾値超）
    const result = estimateCalibrationOffsetMs(blinks, taps, OPTIONS);
    expect(result.sampleCount).toBe(0);
    expect(result.offsetMs).toBe(OPTIONS.fallbackMs);
  });

  it("偶数個のサンプルの中央値は中央2値の平均にする", () => {
    const blinks = [1000, 1600, 2200, 2800];
    const taps = [1010, 1620, 2230, 2840]; // +10, +20, +30, +40
    const result = estimateCalibrationOffsetMs(blinks, taps, OPTIONS);
    expect(result.offsetMs).toBe(25); // (20+30)/2
    expect(result.sampleCount).toBe(4);
  });

  it("各タップを最も近い点滅へ対応付ける", () => {
    const blinks = [1000, 2000];
    const taps = [1700]; // 2000に近い（差300）。1000（差700）ではない。
    const result = estimateCalibrationOffsetMs(blinks, taps, {
      outlierThresholdMs: 400,
      fallbackMs: 0,
    });
    expect(result.offsetMs).toBe(-300);
    expect(result.sampleCount).toBe(1);
  });

  it("タップが空なら採用数0とフォールバック値を返す", () => {
    const result = estimateCalibrationOffsetMs([1000, 1600], [], OPTIONS);
    expect(result.sampleCount).toBe(0);
    expect(result.offsetMs).toBe(OPTIONS.fallbackMs);
  });

  it("点滅が空なら採用数0とフォールバック値を返す", () => {
    const result = estimateCalibrationOffsetMs([], [1000, 1600], OPTIONS);
    expect(result.sampleCount).toBe(0);
    expect(result.offsetMs).toBe(OPTIONS.fallbackMs);
  });

  it("非有限のタップは無視する", () => {
    const blinks = [1000, 1600, 2200, 2800];
    const taps = [1020, Number.NaN, 1620, Number.POSITIVE_INFINITY];
    const result = estimateCalibrationOffsetMs(blinks, taps, OPTIONS);
    // 有効なのは+20の2タップだけ。
    expect(result.offsetMs).toBe(20);
    expect(result.sampleCount).toBe(2);
  });
});
