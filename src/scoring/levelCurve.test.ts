import { describe, expect, it } from "vitest";
import {
  percentileFromLevelCurve,
  topPercentFromPercentile,
  isValidLevelCurve,
  BUILTIN_LEVEL_CURVE,
  type LevelCurveAnchor,
} from "./levelCurve";
import { simplePercentile } from "./percentile";

// 得点率 t を直接スコアにできるよう、理論端を [0,1] にする（score=t）。曲非依存のため端は引数で与える。
const UNIT = { min: 0, max: 1 };
// 端が0でない曲非依存性の確認用。
const WIDE = { min: 0, max: 1000 };

describe("percentileFromLevelCurve 内蔵水準カーブの百分位（Issue #66）", () => {
  it("端点: 理論最小で百分位0、理論最大で百分位100", () => {
    expect(percentileFromLevelCurve(0, UNIT)).toBe(0);
    expect(percentileFromLevelCurve(1, UNIT)).toBe(100);
    expect(percentileFromLevelCurve(0, WIDE)).toBe(0);
    expect(percentileFromLevelCurve(1000, WIDE)).toBe(100);
  });

  it("内蔵アンカーの値（得点率0.25→10、0.5→50、0.75→90）", () => {
    expect(percentileFromLevelCurve(0.25, UNIT)).toBeCloseTo(10, 10);
    expect(percentileFromLevelCurve(0.5, UNIT)).toBeCloseTo(50, 10);
    expect(percentileFromLevelCurve(0.75, UNIT)).toBeCloseTo(90, 10);
  });

  it("アンカー間の区分線形補間（中点）", () => {
    // (0,0)-(0.25,10) の中点 t=0.125 → 5
    expect(percentileFromLevelCurve(0.125, UNIT)).toBeCloseTo(5, 10);
    // (0.5,50)-(0.75,90) の t=0.6 → 50 + 40×(0.1/0.25) = 66
    expect(percentileFromLevelCurve(0.6, UNIT)).toBeCloseTo(66, 10);
  });

  it("単調非減少（得点率を細かく掃く）", () => {
    let previous = -1;
    for (let i = 0; i <= 100; i++) {
      const p = percentileFromLevelCurve(i / 100, UNIT);
      expect(p).toBeGreaterThanOrEqual(previous);
      previous = p;
    }
  });

  it("対称: 百分位 p(t) + p(1-t) = 100", () => {
    for (const t of [0.1, 0.25, 0.3, 0.4, 0.45]) {
      const sum = percentileFromLevelCurve(t, UNIT) + percentileFromLevelCurve(1 - t, UNIT);
      expect(sum).toBeCloseTo(100, 10);
    }
  });

  it("中央集中（S字）: 中央付近の傾きが端付近より急", () => {
    // 同じ幅0.1の得点率差に対する百分位の増分を、中央と端で比べる。
    const centerDelta = percentileFromLevelCurve(0.55, UNIT) - percentileFromLevelCurve(0.45, UNIT);
    const edgeDelta = percentileFromLevelCurve(0.15, UNIT) - percentileFromLevelCurve(0.05, UNIT);
    expect(centerDelta).toBeGreaterThan(edgeDelta);
  });

  it("範囲外はクランプ（理論最小未満で0、理論最大超で100）", () => {
    expect(percentileFromLevelCurve(-100, UNIT)).toBe(0);
    expect(percentileFromLevelCurve(100, UNIT)).toBe(100);
  });

  it("縮退の防御: 非有限スコア・非有限端・区間幅0以下で0", () => {
    expect(percentileFromLevelCurve(Number.NaN, UNIT)).toBe(0);
    expect(percentileFromLevelCurve(0.5, { min: 0, max: Number.POSITIVE_INFINITY })).toBe(0);
    expect(percentileFromLevelCurve(0.5, { min: Number.NaN, max: 1 })).toBe(0);
    expect(percentileFromLevelCurve(0.5, { min: 1, max: 1 })).toBe(0); // 区間幅0
    expect(percentileFromLevelCurve(0.5, { min: 1, max: 0 })).toBe(0); // 区間幅負
  });

  it("後退互換: 対角線（端点2点）カーブは simplePercentile と一致", () => {
    const linear: LevelCurveAnchor[] = [
      { fraction: 0, percentile: 0 },
      { fraction: 1, percentile: 100 },
    ];
    for (const [score, bounds] of [
      [0, WIDE],
      [250, WIDE],
      [500, WIDE],
      [1000, WIDE],
      [300, { min: 100, max: 500 }],
    ] as const) {
      expect(percentileFromLevelCurve(score, bounds, linear)).toBeCloseTo(
        simplePercentile(score, bounds),
        10,
      );
    }
  });

  it("無効カーブを渡すと0を返す", () => {
    const invalidCurves: LevelCurveAnchor[][] = [
      [], // 空
      [{ fraction: 0, percentile: 0 }, { fraction: 0.5, percentile: 50 }, { fraction: 0.5, percentile: 60 }, { fraction: 1, percentile: 100 }], // 得点率重複
      [{ fraction: 0, percentile: 0 }, { fraction: 0.5, percentile: 50 }, { fraction: 0.3, percentile: 40 }, { fraction: 1, percentile: 100 }], // 得点率逆順
      [{ fraction: 0, percentile: 0 }, { fraction: 0.5, percentile: 60 }, { fraction: 0.75, percentile: 40 }, { fraction: 1, percentile: 100 }], // 百分位減少
      [{ fraction: 0, percentile: 0 }, { fraction: 0.5, percentile: Number.NaN }, { fraction: 1, percentile: 100 }], // 非有限
      [{ fraction: 0, percentile: 0 }, { fraction: 0.5, percentile: 150 }, { fraction: 1, percentile: 100 }], // 百分位が値域外
      [{ fraction: 0.1, percentile: 0 }, { fraction: 1, percentile: 100 }], // 先頭が(0,0)でない
      [{ fraction: 0, percentile: 5 }, { fraction: 1, percentile: 100 }], // 先頭の百分位が0でない
      [{ fraction: 0, percentile: 0 }, { fraction: 0.9, percentile: 100 }], // 末尾の得点率が1でない
      [{ fraction: 0, percentile: 0 }, { fraction: 1, percentile: 90 }], // 末尾の百分位が100でない
    ];
    for (const curve of invalidCurves) {
      expect(isValidLevelCurve(curve)).toBe(false);
      expect(percentileFromLevelCurve(0.5, UNIT, curve)).toBe(0);
    }
  });

  it("ランタイムで型に反する要素（null・疎配列の空き・非オブジェクト・フィールド欠落・数値でないフィールド）は例外でなく偽と0へ倒す", () => {
    const sparse: unknown[] = [];
    sparse.length = 2; // 空きを2つ持つ疎配列
    const runtimeInvalid: unknown[] = [
      [null],
      sparse,
      [{ fraction: 0, percentile: 0 }, 42, { fraction: 1, percentile: 100 }], // 非オブジェクト要素
      [{ fraction: 0 }, { fraction: 1, percentile: 100 }], // percentile 欠落
      [{ fraction: "0", percentile: 0 }, { fraction: 1, percentile: 100 }], // 数値でないフィールド
    ];
    for (const curve of runtimeInvalid) {
      const typed = curve as unknown as LevelCurveAnchor[];
      expect(() => isValidLevelCurve(typed)).not.toThrow();
      expect(isValidLevelCurve(typed)).toBe(false);
      expect(() => percentileFromLevelCurve(0.5, UNIT, typed)).not.toThrow();
      expect(percentileFromLevelCurve(0.5, UNIT, typed)).toBe(0);
    }
  });
});

describe("BUILTIN_LEVEL_CURVE 内蔵カーブのデータ妥当性", () => {
  it("妥当（端点固定・値域・厳密増加・単調非減少）を満たす", () => {
    expect(isValidLevelCurve(BUILTIN_LEVEL_CURVE)).toBe(true);
  });
  it("先頭が(0,0)、末尾が(1,100)", () => {
    const first = BUILTIN_LEVEL_CURVE[0];
    const last = BUILTIN_LEVEL_CURVE[BUILTIN_LEVEL_CURVE.length - 1];
    expect(first.fraction).toBe(0);
    expect(first.percentile).toBe(0);
    expect(last.fraction).toBe(1);
    expect(last.percentile).toBe(100);
  });
});

describe("topPercentFromPercentile 上位率変換（Issue #66、判断5）", () => {
  it("上位率＝100−百分位（百分位0で上位100、100で上位0、90で上位10、50で上位50）", () => {
    expect(topPercentFromPercentile(0)).toBe(100);
    expect(topPercentFromPercentile(100)).toBe(0);
    expect(topPercentFromPercentile(90)).toBe(10);
    expect(topPercentFromPercentile(50)).toBe(50);
    expect(topPercentFromPercentile(10)).toBe(90);
  });
  it("範囲外はクランプしてから変換（負→100、100超→0）", () => {
    expect(topPercentFromPercentile(-5)).toBe(100);
    expect(topPercentFromPercentile(150)).toBe(0);
  });
  it("非有限は最下位相当として100", () => {
    expect(topPercentFromPercentile(Number.NaN)).toBe(100);
  });
  it("整数を返す（四捨五入）", () => {
    const value = topPercentFromPercentile(33.3);
    expect(Number.isInteger(value)).toBe(true);
    expect(value).toBe(67); // round(100 - 33.3) = round(66.7) = 67
  });
});
