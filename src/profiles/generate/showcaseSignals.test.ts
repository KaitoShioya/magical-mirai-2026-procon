import { describe, expect, it } from "vitest";
import {
  binCenterMs,
  binCount,
  buildCompositeCurve,
  combineComposite,
  lyricDensityPerBin,
  normalizeByMax,
  resampleAmplitudeToGrid,
  smooth,
} from "./showcaseSignals";
import { DEFAULT_SHOWCASE_OPTIONS, type ShowcaseInput } from "./types";

describe("binCount", () => {
  it("曲長を刻みで割り切り上げる", () => {
    expect(binCount(4000, 1000)).toBe(4);
    expect(binCount(237250, 1000)).toBe(238);
    expect(binCount(2500, 1000)).toBe(3);
  });
  it("曲長0以下・非有限は0", () => {
    expect(binCount(0, 1000)).toBe(0);
    expect(binCount(-1, 1000)).toBe(0);
    expect(binCount(Number.NaN, 1000)).toBe(0);
    expect(binCount(4000, 0)).toBe(0);
  });
});

describe("binCenterMs", () => {
  it("ビン中心 = index×gridMs + gridMs/2", () => {
    expect(binCenterMs(0, 1000)).toBe(500);
    expect(binCenterMs(25, 1000)).toBe(25500);
  });
});

describe("resampleAmplitudeToGrid", () => {
  it("ビン内サンプルの平均を採る", () => {
    // 200ms刻み、1秒ビンに5サンプル。最初のビン=[0,5)の平均、次のビン=[5,10)の平均。
    const curve = [10, 20, 30, 40, 50, 100, 100, 100, 100, 100];
    const out = resampleAmplitudeToGrid(curve, 200, 1000, 2);
    expect(out[0]).toBe(30); // (10+20+30+40+50)/5
    expect(out[1]).toBe(100);
  });
  it("負値(−1)は0へ丸めるが分母に数え値を引き下げる", () => {
    const curve = [-1, -1, -1, -1, -1]; // 無音のみ → 平均0
    expect(resampleAmplitudeToGrid(curve, 200, 1000, 1)[0]).toBe(0);
    const mixed = [100, 100, -1, -1, -1]; // (100+100+0+0+0)/5 = 40
    expect(resampleAmplitudeToGrid(mixed, 200, 1000, 1)[0]).toBe(40);
  });
  it("曲末の半端ビンは実サンプル数で割る", () => {
    // 7サンプル、ビン1は[5,10)に2サンプルしか無い → 理論個数5でなく実数2で割る。
    const curve = [0, 0, 0, 0, 0, 60, 80];
    const out = resampleAmplitudeToGrid(curve, 200, 1000, 2);
    expect(out[1]).toBe(70); // (60+80)/2
  });
  it("サンプルが無いビンは0", () => {
    const out = resampleAmplitudeToGrid([10, 20], 200, 1000, 3);
    expect(out[1]).toBe(0);
    expect(out[2]).toBe(0);
  });
  it("空配列は全0", () => {
    expect(resampleAmplitudeToGrid([], 200, 1000, 2)).toEqual([0, 0]);
  });
});

describe("lyricDensityPerBin", () => {
  it("各ビンに開始時刻が入る文字数を数える", () => {
    const onsets = [100, 200, 1500, 1700, 1900];
    expect(lyricDensityPerBin(onsets, 1000, 3)).toEqual([2, 3, 0]);
  });
  it("ビン境界ちょうどの文字は右側のビンに入る", () => {
    // 1000msは [1000,2000) のビン1に入る（[0,1000)はビン0）。
    expect(lyricDensityPerBin([1000], 1000, 2)).toEqual([0, 1]);
  });
  it("範囲外の文字は無視する", () => {
    expect(lyricDensityPerBin([-50, 5000], 1000, 2)).toEqual([0, 0]);
  });
});

describe("smooth", () => {
  it("中心移動平均で平滑化し端は寄与ビン数で割る", () => {
    const out = smooth([0, 10, 0], 1);
    // i=0: (0+10)/2=5、i=1: (0+10+0)/3≈3.333、i=2: (10+0)/2=5
    expect(out[0]).toBeCloseTo(5, 10);
    expect(out[1]).toBeCloseTo(10 / 3, 10);
    expect(out[2]).toBeCloseTo(5, 10);
  });
  it("halfBins=0 は変化させない", () => {
    expect(smooth([1, 2, 3], 0)).toEqual([1, 2, 3]);
  });
});

describe("normalizeByMax", () => {
  it("最大値で割り[0,1]へ揃える", () => {
    expect(normalizeByMax([0, 5, 10])).toEqual([0, 0.5, 1]);
  });
  it("全0（最大0以下）は全0を返す", () => {
    expect(normalizeByMax([0, 0, 0])).toEqual([0, 0, 0]);
  });
});

describe("combineComposite", () => {
  it("重み付きで足し合わせる", () => {
    expect(combineComposite([1, 0], [0, 1], 0.5, 0.5)).toEqual([0.5, 0.5]);
    expect(combineComposite([1], [1], 0.5, 0.5)).toEqual([1]);
  });
});

describe("buildCompositeCurve", () => {
  it("声量も歌詞も平坦に強い区間で合成値が最大になる", () => {
    const input: ShowcaseInput = {
      durationMs: 5000,
      amplitudeStepMs: 1000,
      // ビン2(2000-3000)を最も強く、両端を弱く。
      amplitudeCurve: [10, 30, 100, 30, 10],
      lyricCharOnsetsMs: [2100, 2300, 2500, 2700, 2900],
      chorusSegments: [],
      beatsMs: [],
    };
    // 平滑化（±2ビン）は5ビンの短い入力では山を端へ均すため、合成そのものを検証する目的では0にする。
    // 平滑化の挙動は smooth の単体テストで別途確認している。
    const curve = buildCompositeCurve(input, { ...DEFAULT_SHOWCASE_OPTIONS, smoothHalfBins: 0 });
    expect(curve.gridMs).toBe(1000);
    expect(curve.values.length).toBe(5);
    const maxIndex = curve.values.indexOf(Math.max(...curve.values));
    expect(maxIndex).toBe(2);
  });
  it("声量・歌詞が全0なら合成値も全0", () => {
    const input: ShowcaseInput = {
      durationMs: 3000,
      amplitudeStepMs: 1000,
      amplitudeCurve: [0, 0, 0],
      lyricCharOnsetsMs: [],
      chorusSegments: [],
      beatsMs: [],
    };
    const curve = buildCompositeCurve(input, DEFAULT_SHOWCASE_OPTIONS);
    expect(curve.values).toEqual([0, 0, 0]);
  });
});
