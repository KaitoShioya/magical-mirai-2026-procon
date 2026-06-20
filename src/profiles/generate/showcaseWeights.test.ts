import { describe, expect, it } from "vitest";
import { assignWeights, windowMeanComposite } from "./showcaseWeights";
import { DEFAULT_SHOWCASE_OPTIONS, type CompositeCurve, type ShowcaseWindow } from "./types";

function curveOf(values: number[]): CompositeCurve {
  return { values, gridMs: 1000 };
}
function win(startMs: number, endMs: number, isClimax: boolean): ShowcaseWindow {
  return { startMs, endMs, representativeMs: (startMs + endMs) / 2, source: "nonChorus", isClimax };
}

describe("windowMeanComposite", () => {
  it("中心が窓内に入るビンの平均を採る", () => {
    // gridMs=1000、ビン中心は 500,1500,2500,3500。窓[1000,4000) はビン1,2,3を含む。
    const curve = curveOf([1, 0.2, 0.4, 0.6]);
    expect(windowMeanComposite(curve, { startMs: 1000, endMs: 4000 })).toBeCloseTo((0.2 + 0.4 + 0.6) / 3, 10);
  });
  it("窓が短くビン中心を含まないときは中央に最も近いビンの値", () => {
    const curve = curveOf([0.1, 0.9, 0.2]);
    // 窓[1400,1600) は中心1500のビン1のみが該当（中心1500 ∈ [1400,1600)）。
    expect(windowMeanComposite(curve, { startMs: 1400, endMs: 1600 })).toBe(0.9);
  });
  it("空曲線は0", () => {
    expect(windowMeanComposite(curveOf([]), { startMs: 0, endMs: 1000 })).toBe(0);
  });
});

describe("assignWeights", () => {
  it("climax は1.0で固定、非climaxは0.4〜0.9へ線形写像", () => {
    // 合成値: ビン中心ごと。窓を3つ、うち1つclimax。
    const curve = curveOf(new Array(10).fill(0).map((_, i) => i / 10)); // 0,0.1,...,0.9
    const windows: ShowcaseWindow[] = [
      win(1000, 2000, false), // 中心1500→ビン1=0.1
      win(5000, 6000, false), // 中心5500→ビン5=0.5
      win(8000, 9000, true), // climax
    ];
    const weights = assignWeights(windows, curve, DEFAULT_SHOWCASE_OPTIONS);
    expect(weights[2]).toBe(1.0); // climax
    // 非climax代表値 min=0.1,max=0.5。0.1→0.4、0.5→0.9。
    expect(weights[0]).toBeCloseTo(0.4, 10);
    expect(weights[1]).toBeCloseTo(0.9, 10);
  });
  it("climax は常に非climaxより厳密に大きい", () => {
    const curve = curveOf(new Array(10).fill(0.5));
    const windows: ShowcaseWindow[] = [win(1000, 2000, false), win(5000, 6000, true)];
    const weights = assignWeights(windows, curve, DEFAULT_SHOWCASE_OPTIONS);
    expect(weights[1]).toBe(1.0);
    expect(weights[1]).toBeGreaterThan(weights[0]);
  });
  it("非climax代表値が同値なら全員中点0.65", () => {
    const curve = curveOf(new Array(10).fill(0.5));
    const windows: ShowcaseWindow[] = [
      win(1000, 2000, false),
      win(3000, 4000, false),
      win(8000, 9000, true),
    ];
    const weights = assignWeights(windows, curve, DEFAULT_SHOWCASE_OPTIONS);
    expect(weights[0]).toBe(0.65);
    expect(weights[1]).toBe(0.65);
    expect(weights[2]).toBe(1.0);
  });
  it("全 weight が0〜1の範囲に収まる", () => {
    const curve = curveOf(new Array(10).fill(0).map((_, i) => i / 10));
    const windows: ShowcaseWindow[] = [
      win(1000, 2000, false),
      win(5000, 6000, false),
      win(8000, 9000, true),
    ];
    for (const w of assignWeights(windows, curve, DEFAULT_SHOWCASE_OPTIONS)) {
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(1);
    }
  });
});
