import { describe, expect, it } from "vitest";
import {
  calculateTapBudget,
  estimateFullPossibleTaps,
  generateTapBudget,
  InvalidTapBudgetInputError,
  type TapBudgetInput,
} from "./tapBudget";
import {
  TAP_LIMIT_RATIO_MIN,
  TAP_LIMIT_RATIO_MAX,
} from "../../config/tuning";

// 拍を等間隔で並べた配列を作る補助。startMs から count 個、stepMs 間隔。厳密昇順になる。
function makeBeats(count: number, startMs: number, stepMs: number): number[] {
  const beats: number[] = [];
  for (let i = 0; i < count; i++) beats.push(startMs + i * stepMs);
  return beats;
}

describe("estimateFullPossibleTaps（母数算出）", () => {
  it("全拍が非サビなら、拍数×非サビ密度を返す", () => {
    // 拍を10個、サビ区間なし。既定の非サビ密度0.5なら 10×0.5=5。
    const input: TapBudgetInput = { beatsMs: makeBeats(10, 0, 100), chorusSegments: [] };
    expect(estimateFullPossibleTaps(input)).toBe(5);
  });

  it("全拍がサビなら、拍数×サビ密度を返す", () => {
    // 拍を10個（0〜900ミリ秒）、サビ区間で全拍を覆う。既定のサビ密度1.0なら 10×1.0=10。
    const input: TapBudgetInput = {
      beatsMs: makeBeats(10, 0, 100),
      chorusSegments: [{ startMs: 0, endMs: 1000 }],
    };
    expect(estimateFullPossibleTaps(input)).toBe(10);
  });

  it("サビと非サビが混在するなら、それぞれの密度で合算する", () => {
    // 拍を10個（0,100,...,900）。サビ区間[0,500)は0〜400の5拍を覆う。サビ5×1.0 + 非サビ5×0.5 = 7.5 → 丸め8。
    const input: TapBudgetInput = {
      beatsMs: makeBeats(10, 0, 100),
      chorusSegments: [{ startMs: 0, endMs: 500 }],
    };
    expect(estimateFullPossibleTaps(input)).toBe(8);
  });

  it("半開区間の境界では、開始時刻の拍は含み終端時刻の拍は含まない", () => {
    // 拍は 0,100,200,300。サビ区間[100,300)は100と200を含み、300は含まない。サビ2×1.0 + 非サビ2×0.5 = 3。
    const input: TapBudgetInput = {
      beatsMs: [0, 100, 200, 300],
      chorusSegments: [{ startMs: 100, endMs: 300 }],
    };
    expect(estimateFullPossibleTaps(input)).toBe(3);
  });

  it("サビ区間が重なって与えられても、各拍を一度だけ数える", () => {
    // 拍は 0,100,200,300。区間[0,250)と[100,400)が重なる。0,100,200,300すべてサビ（重なる100,200を二重に数えない）。
    // サビ4×1.0 = 4。
    const input: TapBudgetInput = {
      beatsMs: [0, 100, 200, 300],
      chorusSegments: [
        { startMs: 0, endMs: 250 },
        { startMs: 100, endMs: 400 },
      ],
    };
    expect(estimateFullPossibleTaps(input)).toBe(4);
  });

  it("サビ区間の並び順が乱れていても、正しく数える", () => {
    // 拍は 0,100,200,300。区間を後ろから先に並べる。[200,400)が200,300、[0,150)が0,100。全拍サビで 4×1.0=4。
    const input: TapBudgetInput = {
      beatsMs: [0, 100, 200, 300],
      chorusSegments: [
        { startMs: 200, endMs: 400 },
        { startMs: 0, endMs: 150 },
      ],
    };
    expect(estimateFullPossibleTaps(input)).toBe(4);
  });

  it("密度を指定すると、その密度で合算する", () => {
    // 拍10個全非サビ。非サビ密度0.25なら 10×0.25=2.5 → 丸め3（最近接、端数0.5は偶数側でなく上へ。Math.roundは0.5を切り上げる）。
    const input: TapBudgetInput = { beatsMs: makeBeats(10, 0, 100), chorusSegments: [] };
    expect(estimateFullPossibleTaps(input, { nonChorusTapsPerBeat: 0.25 })).toBe(3);
  });

  it("拍の配列が空なら例外になる", () => {
    expect(() => estimateFullPossibleTaps({ beatsMs: [], chorusSegments: [] })).toThrow(
      InvalidTapBudgetInputError,
    );
  });

  it("拍の時刻が非有限なら例外になる", () => {
    expect(() =>
      estimateFullPossibleTaps({ beatsMs: [0, Number.NaN, 200], chorusSegments: [] }),
    ).toThrow(InvalidTapBudgetInputError);
    expect(() =>
      estimateFullPossibleTaps({ beatsMs: [0, Number.POSITIVE_INFINITY], chorusSegments: [] }),
    ).toThrow(InvalidTapBudgetInputError);
  });

  it("拍が厳密昇順でない（重複や逆順）なら例外になる", () => {
    expect(() =>
      estimateFullPossibleTaps({ beatsMs: [0, 100, 100, 200], chorusSegments: [] }),
    ).toThrow(InvalidTapBudgetInputError);
    expect(() =>
      estimateFullPossibleTaps({ beatsMs: [0, 200, 100], chorusSegments: [] }),
    ).toThrow(InvalidTapBudgetInputError);
  });

  it("密度が正でない（ゼロ・負・非有限）なら例外になる", () => {
    const input: TapBudgetInput = { beatsMs: makeBeats(4, 0, 100), chorusSegments: [] };
    expect(() => estimateFullPossibleTaps(input, { nonChorusTapsPerBeat: 0 })).toThrow(
      InvalidTapBudgetInputError,
    );
    expect(() => estimateFullPossibleTaps(input, { chorusTapsPerBeat: -1 })).toThrow(
      InvalidTapBudgetInputError,
    );
    expect(() =>
      estimateFullPossibleTaps(input, { nonChorusTapsPerBeat: Number.NaN }),
    ).toThrow(InvalidTapBudgetInputError);
  });

  it("サビ区間の開始が終端以上、または値が非有限なら例外になる", () => {
    const beatsMs = makeBeats(4, 0, 100);
    expect(() =>
      estimateFullPossibleTaps({ beatsMs, chorusSegments: [{ startMs: 200, endMs: 200 }] }),
    ).toThrow(InvalidTapBudgetInputError);
    expect(() =>
      estimateFullPossibleTaps({ beatsMs, chorusSegments: [{ startMs: 300, endMs: 100 }] }),
    ).toThrow(InvalidTapBudgetInputError);
    expect(() =>
      estimateFullPossibleTaps({ beatsMs, chorusSegments: [{ startMs: 0, endMs: Number.NaN }] }),
    ).toThrow(InvalidTapBudgetInputError);
  });
});

describe("calculateTapBudget（上限算出）", () => {
  it("既定比率0.6で、上限=round(母数×0.6)を返す", () => {
    // 434×0.6=260.4 → 丸め260。
    expect(calculateTapBudget(434)).toEqual({ fullPossible: 434, limit: 260 });
    // 100×0.6=60。
    expect(calculateTapBudget(100)).toEqual({ fullPossible: 100, limit: 60 });
  });

  it("比率を指定すると、その比率で上限を算出する", () => {
    // 範囲内の比率0.5。200×0.5=100。
    expect(calculateTapBudget(200, { limitRatio: 0.5 })).toEqual({ fullPossible: 200, limit: 100 });
  });

  it("比率が境界ちょうど（0.4と0.8）でも算出できる", () => {
    expect(calculateTapBudget(100, { limitRatio: TAP_LIMIT_RATIO_MIN })).toEqual({
      fullPossible: 100,
      limit: 40,
    });
    expect(calculateTapBudget(100, { limitRatio: TAP_LIMIT_RATIO_MAX })).toEqual({
      fullPossible: 100,
      limit: 80,
    });
  });

  it("比率が範囲外なら例外になる", () => {
    expect(() => calculateTapBudget(100, { limitRatio: 0.3 })).toThrow(InvalidTapBudgetInputError);
    expect(() => calculateTapBudget(100, { limitRatio: 0.9 })).toThrow(InvalidTapBudgetInputError);
  });

  it("母数が正の整数でない（小数・非有限・ゼロ・負）なら例外になる", () => {
    expect(() => calculateTapBudget(100.5)).toThrow(InvalidTapBudgetInputError);
    expect(() => calculateTapBudget(Number.NaN)).toThrow(InvalidTapBudgetInputError);
    expect(() => calculateTapBudget(Number.POSITIVE_INFINITY)).toThrow(InvalidTapBudgetInputError);
    expect(() => calculateTapBudget(0)).toThrow(InvalidTapBudgetInputError);
    expect(() => calculateTapBudget(-10)).toThrow(InvalidTapBudgetInputError);
  });

  it("母数が小さく、丸めで上限の比率が範囲を外れる場合は例外になる", () => {
    // 母数1、比率0.8。round(1×0.8)=1。比率 1/1=1.0 は上限0.8を超えるため失敗させる。
    expect(() => calculateTapBudget(1, { limitRatio: TAP_LIMIT_RATIO_MAX })).toThrow(
      InvalidTapBudgetInputError,
    );
  });
});

describe("generateTapBudget（母数算出と上限算出の合成）", () => {
  it("入力から母数を算出し、上限まで一括で返す", () => {
    // 拍10個全非サビ、非サビ密度0.5なら母数5。だが比率0.6では round(5×0.6)=3、比率3/5=0.6で範囲内。
    const input: TapBudgetInput = { beatsMs: makeBeats(10, 0, 100), chorusSegments: [] };
    expect(generateTapBudget(input)).toEqual({ fullPossible: 5, limit: 3 });
  });

  it("estimateFullPossibleTaps と calculateTapBudget を順に適用した結果と一致する", () => {
    const input: TapBudgetInput = {
      beatsMs: makeBeats(20, 0, 100),
      chorusSegments: [{ startMs: 0, endMs: 1000 }],
    };
    const full = estimateFullPossibleTaps(input);
    expect(generateTapBudget(input)).toEqual(calculateTapBudget(full));
  });
});
