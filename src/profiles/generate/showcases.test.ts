import { describe, expect, it } from "vitest";
import {
  generateShowcases,
  InvalidChorusSegmentError,
  InvalidShowcaseOptionError,
  selectNonChorusPeaks,
  TooManyChorusError,
} from "./showcases";
import type { ShowcaseInput } from "./types";

// 1秒刻みの声量配列を作る補助。指定したビン範囲に値を置く。
function ampCurve(bins: number, spans: { from: number; to: number; value: number }[]): number[] {
  const out = new Array<number>(bins).fill(0);
  for (const s of spans) {
    for (let i = s.from; i <= s.to; i++) out[i] = s.value;
  }
  return out;
}

// 0からdurationMsまで500ms刻みの拍。
function beatsEvery500(durationMs: number): number[] {
  const out: number[] = [];
  for (let t = 0; t <= durationMs; t += 500) out.push(t);
  return out;
}

describe("generateShowcases（chorusあり）", () => {
  const durationMs = 120000;
  const input: ShowcaseInput = {
    durationMs,
    amplitudeStepMs: 1000,
    amplitudeCurve: ampCurve(120, [
      { from: 8, to: 12, value: 100 }, // 約10秒の山
      { from: 40, to: 59, value: 50 }, // chorus区間
      { from: 88, to: 92, value: 90 }, // 約90秒の山
    ]),
    lyricCharOnsetsMs: [],
    chorusSegments: [{ startMs: 40000, endMs: 60000 }],
    beatsMs: beatsEvery500(durationMs),
  };
  const options = { count: 3, climaxAnchorMs: 50000 };

  it("見せ場はちょうど count 個、isClimax はちょうど1つ", () => {
    const showcases = generateShowcases(input, options);
    expect(showcases).toHaveLength(3);
    expect(showcases.filter((s) => s.isClimax)).toHaveLength(1);
  });
  it("chorus 区間が見せ場として現れ境界が一致する", () => {
    const showcases = generateShowcases(input, options);
    const chorusShowcase = showcases.find((s) => s.startTimeMs === 40000);
    expect(chorusShowcase).toBeDefined();
    expect(chorusShowcase!.isClimax).toBe(true); // アンカー50000を含む
    expect(chorusShowcase!.endTimeMs).toBe(60000);
  });
  it("climax の weight は1.0で全見せ場の中で厳密に最大", () => {
    const showcases = generateShowcases(input, options);
    const climax = showcases.find((s) => s.isClimax)!;
    expect(climax.weight).toBe(1.0);
    for (const s of showcases) {
      if (!s.isClimax) expect(s.weight).toBeLessThan(climax.weight);
    }
  });
  it("見せ場は startTimeMs 昇順で index が0始まり連番", () => {
    const showcases = generateShowcases(input, options);
    for (let i = 0; i < showcases.length; i++) {
      expect(showcases[i].index).toBe(i);
      if (i > 0) expect(showcases[i].startTimeMs).toBeGreaterThanOrEqual(showcases[i - 1].startTimeMs);
    }
  });
  it("非chorusピークは chorus 区間外かつ climax ガード外", () => {
    const peaks = selectNonChorusPeaks(input, options);
    expect(peaks).toHaveLength(2);
    for (const p of peaks) {
      const inChorus = p.timeMs >= 40000 && p.timeMs < 60000;
      const inGuard = p.timeMs >= 40000 - 8000 && p.timeMs <= 60000 + 8000;
      expect(inChorus).toBe(false);
      expect(inGuard).toBe(false);
    }
  });
  it("決定論: 同じ入力で同じ結果", () => {
    expect(generateShowcases(input, options)).toEqual(generateShowcases(input, options));
  });
});

describe("generateShowcases（chorusなし）", () => {
  const durationMs = 120000;
  const input: ShowcaseInput = {
    durationMs,
    amplitudeStepMs: 1000,
    amplitudeCurve: ampCurve(120, [
      { from: 8, to: 12, value: 80 },
      { from: 58, to: 62, value: 100 }, // 最大 → climax
      { from: 88, to: 92, value: 70 },
    ]),
    lyricCharOnsetsMs: [],
    chorusSegments: [],
    beatsMs: beatsEvery500(durationMs),
  };
  const options = { count: 3 };

  it("6個全てを非chorusピークから選び合成最大を climax にする", () => {
    const showcases = generateShowcases(input, options);
    expect(showcases).toHaveLength(3);
    const climax = showcases.find((s) => s.isClimax)!;
    // 60秒付近の山が最大 → climax は中央付近
    expect(climax.startTimeMs).toBeLessThan(70000);
    expect(climax.endTimeMs).toBeGreaterThan(55000);
    expect(climax.weight).toBe(1.0);
  });
});

describe("generateShowcases（境界）", () => {
  const durationMs = 60000;
  const base = {
    durationMs,
    amplitudeStepMs: 1000,
    amplitudeCurve: ampCurve(60, [{ from: 0, to: 59, value: 50 }]),
    lyricCharOnsetsMs: [],
    beatsMs: beatsEvery500(durationMs),
  };

  it("chorus 数 = count なら非chorus採用0で全 chorus が見せ場", () => {
    const input: ShowcaseInput = {
      ...base,
      chorusSegments: [
        { startMs: 5000, endMs: 20000 },
        { startMs: 35000, endMs: 50000 },
      ],
    };
    const showcases = generateShowcases(input, { count: 2, climaxAnchorMs: 45000 });
    expect(showcases).toHaveLength(2);
    expect(showcases.filter((s) => s.isClimax)).toHaveLength(1);
  });
  it("chorus 数 > count はエラー", () => {
    const input: ShowcaseInput = {
      ...base,
      chorusSegments: [
        { startMs: 5000, endMs: 20000 },
        { startMs: 35000, endMs: 50000 },
      ],
    };
    expect(() => generateShowcases(input, { count: 1 })).toThrow(TooManyChorusError);
  });
});

describe("generateShowcases（入力・オプション検証）", () => {
  const durationMs = 60000;
  const base: ShowcaseInput = {
    durationMs,
    amplitudeStepMs: 1000,
    amplitudeCurve: ampCurve(60, [{ from: 0, to: 59, value: 50 }]),
    lyricCharOnsetsMs: [],
    chorusSegments: [],
    beatsMs: beatsEvery500(durationMs),
  };

  it("count が0以下はエラー（climaxちょうど1つの不変条件が崩れるため）", () => {
    expect(() => generateShowcases(base, { count: 0 })).toThrow(InvalidShowcaseOptionError);
    expect(() => generateShowcases(base, { count: -1 })).toThrow(InvalidShowcaseOptionError);
  });
  it("count が整数でないはエラー", () => {
    expect(() => generateShowcases(base, { count: 2.5 })).toThrow(InvalidShowcaseOptionError);
  });
  it("重みの下限が上限を超えるとエラー", () => {
    expect(() =>
      generateShowcases(base, { count: 1, nonClimaxWeightFloor: 0.9, nonClimaxWeightCeil: 0.4 })
    ).toThrow(InvalidShowcaseOptionError);
  });
  it("重みが0〜1の範囲外はエラー", () => {
    expect(() => generateShowcases(base, { count: 1, climaxWeight: 1.5 })).toThrow(InvalidShowcaseOptionError);
  });
  it("gridMs が0以下はエラー", () => {
    expect(() => generateShowcases(base, { count: 1, gridMs: 0 })).toThrow(InvalidShowcaseOptionError);
  });
  it("smoothHalfBins が非整数はエラー（平滑化の配列添字が壊れ合成値が非数になるため）", () => {
    expect(() => generateShowcases(base, { count: 1, smoothHalfBins: 0.5 })).toThrow(InvalidShowcaseOptionError);
  });
  it("smoothHalfBins が負はエラー", () => {
    expect(() => generateShowcases(base, { count: 1, smoothHalfBins: -1 })).toThrow(InvalidShowcaseOptionError);
  });
  it("climaxAnchorMs が非有限はエラー", () => {
    expect(() => generateShowcases(base, { count: 1, climaxAnchorMs: Number.NaN })).toThrow(
      InvalidShowcaseOptionError
    );
  });
  it("amplitudeWeight・densityWeight が負はエラー", () => {
    expect(() => generateShowcases(base, { count: 1, amplitudeWeight: -0.1 })).toThrow(InvalidShowcaseOptionError);
    expect(() => generateShowcases(base, { count: 1, densityWeight: -0.1 })).toThrow(InvalidShowcaseOptionError);
  });
  it("windowHalfBeats が非整数はエラー", () => {
    expect(() => generateShowcases(base, { count: 1, windowHalfBeats: 16.5 })).toThrow(InvalidShowcaseOptionError);
  });
  it("peakConfidenceRatio が0〜1の範囲外はエラー", () => {
    expect(() => generateShowcases(base, { count: 1, peakConfidenceRatio: 1.5 })).toThrow(
      InvalidShowcaseOptionError
    );
  });
  it("chorus 区間の開始が終了以上はエラー", () => {
    const input: ShowcaseInput = { ...base, chorusSegments: [{ startMs: 30000, endMs: 30000 }] };
    expect(() => generateShowcases(input, { count: 3 })).toThrow(InvalidChorusSegmentError);
  });
});
