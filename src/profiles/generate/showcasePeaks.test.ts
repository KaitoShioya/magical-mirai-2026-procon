import { describe, expect, it } from "vitest";
import {
  distanceToRange,
  isTimeExcluded,
  maxValue,
  NotEnoughPeaksError,
  selectClimaxChorusIndex,
  selectPeaksFromCurve,
} from "./showcasePeaks";
import type { ChorusSegment } from "./types";

describe("distanceToRange", () => {
  it("区間の前・内・後で距離を返す", () => {
    const r = { startMs: 1000, endMs: 2000 };
    expect(distanceToRange(500, r)).toBe(500);
    expect(distanceToRange(1500, r)).toBe(0);
    expect(distanceToRange(2500, r)).toBe(500);
  });
});

describe("selectClimaxChorusIndex", () => {
  const segs: ChorusSegment[] = [
    { startMs: 1000, endMs: 23000 },
    { startMs: 88000, endMs: 111000 },
    { startMs: 165000, endMs: 188000 },
  ];
  it("アンカーに最も近い chorus を選ぶ（189000は最終chorus終端の直後）", () => {
    expect(selectClimaxChorusIndex(segs, 189000)).toBe(2);
  });
  it("アンカーを含む chorus を選ぶ", () => {
    expect(selectClimaxChorusIndex(segs, 100000)).toBe(1);
  });
  it("距離が同じなら最も早い chorus（決定論）", () => {
    const two: ChorusSegment[] = [
      { startMs: 0, endMs: 1000 },
      { startMs: 3000, endMs: 4000 },
    ];
    // 2000 は両区間から1000ずつ等距離 → 早い方(index 0)。
    expect(selectClimaxChorusIndex(two, 2000)).toBe(0);
  });
  it("chorus が無ければ -1", () => {
    expect(selectClimaxChorusIndex([], 189000)).toBe(-1);
  });
});

describe("isTimeExcluded", () => {
  const segs: ChorusSegment[] = [{ startMs: 1000, endMs: 2000 }];
  it("chorus 内側は右半開で除外（開始は除外・終了は非除外）", () => {
    expect(isTimeExcluded(1000, segs, null, 0)).toBe(true); // 開始ちょうど
    expect(isTimeExcluded(1999, segs, null, 0)).toBe(true);
    expect(isTimeExcluded(2000, segs, null, 0)).toBe(false); // 終了ちょうどは外（右半開）
    expect(isTimeExcluded(500, segs, null, 0)).toBe(false);
  });
  it("climax ガード帯は両端を含めて除外", () => {
    const climax = { startMs: 100000, endMs: 120000 };
    expect(isTimeExcluded(92000, [], climax, 8000)).toBe(true); // start-guard ちょうど
    expect(isTimeExcluded(128000, [], climax, 8000)).toBe(true); // end+guard ちょうど
    expect(isTimeExcluded(91999, [], climax, 8000)).toBe(false);
    expect(isTimeExcluded(128001, [], climax, 8000)).toBe(false);
  });
  it("climaxWindow が無ければガードを適用しない", () => {
    expect(isTimeExcluded(100000, [], null, 8000)).toBe(false);
  });
});

describe("maxValue", () => {
  it("非負配列の最大を返す", () => {
    expect(maxValue([0, 0.3, 0.86, 0.5])).toBe(0.86);
    expect(maxValue([0, 0, 0])).toBe(0);
  });
});

describe("selectPeaksFromCurve", () => {
  const never = () => false;
  it("全体最大を選び前後を抑制して次を選ぶ（時刻昇順で返す）", () => {
    // gridMs=1000、ビン中心は 500,1500,...。山を 5000ms付近(idx5) と 60000ms付近(idx60) に置く。
    const values = new Array<number>(80).fill(0);
    values[5] = 0.85; // 5500ms
    values[60] = 0.9; // 60500ms
    const globalMax = 0.9;
    const peaks = selectPeaksFromCurve(values, 1000, never, 2, 20000, globalMax);
    expect(peaks.map((p) => p.timeMs)).toEqual([5500, 60500]);
    expect(peaks[0].compositeRatio).toBeCloseTo(0.85 / 0.9, 10);
    expect(peaks[1].compositeRatio).toBeCloseTo(1, 10);
  });
  it("最小間隔以内の弱い山は抑制され選ばれない", () => {
    const values = new Array<number>(80).fill(0);
    values[10] = 0.9; // 10500ms
    values[15] = 0.8; // 15500ms（10500から5000msしか離れていない→抑制される）
    values[60] = 0.7; // 60500ms
    const peaks = selectPeaksFromCurve(values, 1000, never, 2, 20000, 0.9);
    expect(peaks.map((p) => p.timeMs)).toEqual([10500, 60500]);
  });
  it("同値は早い時刻（最小ビン番号）を選ぶ", () => {
    const values = new Array<number>(80).fill(0);
    values[10] = 0.5;
    values[60] = 0.5;
    const peaks = selectPeaksFromCurve(values, 1000, never, 1, 20000, 0.5);
    expect(peaks.map((p) => p.timeMs)).toEqual([10500]);
  });
  it("合成値0のビンは候補にしない", () => {
    const values = new Array<number>(80).fill(0);
    values[10] = 0.5;
    // 1個だけ正の値。2個要求すると不足でエラー。
    expect(() => selectPeaksFromCurve(values, 1000, never, 2, 20000, 0.5)).toThrow(NotEnoughPeaksError);
  });
  it("除外関数で弾かれた山は選ばれない", () => {
    const values = new Array<number>(80).fill(0);
    values[10] = 0.9; // 10500ms を除外
    values[60] = 0.7;
    const excludeAround10500 = (t: number) => Math.abs(t - 10500) < 1;
    const peaks = selectPeaksFromCurve(values, 1000, excludeAround10500, 1, 20000, 0.9);
    expect(peaks.map((p) => p.timeMs)).toEqual([60500]);
  });
  it("適格ビンが必要数に満たないとエラー", () => {
    const values = new Array<number>(80).fill(0);
    values[10] = 0.9;
    expect(() => selectPeaksFromCurve(values, 1000, never, 3, 20000, 0.9)).toThrow(NotEnoughPeaksError);
  });
});
