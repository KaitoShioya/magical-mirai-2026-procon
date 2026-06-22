import { describe, expect, it } from "vitest";
import { summarizeScore } from "./scoreResult";
import {
  reduceScore,
  INITIAL_SCORE_STATE,
  type ScoreState,
  type ScoreTapInput,
  type ScoreConfig,
} from "./scoreAccumulator";
import { DEFAULT_COMBO_CONFIG } from "./combo";
import type { ScoreBoundsInput } from "./scoreBounds";

const JUST = { timingJust: true, pitchJust: true };
const BOUNDS_INPUT: ScoreBoundsInput = { tapBudget: 260 };

function play(taps: ScoreTapInput[]): ScoreState {
  return taps.reduce((state, tap) => reduceScore(state, tap), INITIAL_SCORE_STATE);
}

describe("summarizeScore 通しの結果要約（受け入れ基準: 固定閾値ランクが出る）", () => {
  it("総合得点・百分位・ランク・推定種別を返す", () => {
    const state = play([{ a: 1, diversity: 1, multiplier: 1, result: JUST }]);
    const result = summarizeScore(state, BOUNDS_INPUT);
    expect(result.totalScore).toBeGreaterThan(0);
    expect(result.percentile).toBeGreaterThanOrEqual(0);
    expect(result.percentile).toBeLessThanOrEqual(100);
    expect(["C", "B", "A", "S"]).toContain(result.rank);
    expect(result.percentileBasis).toBe("fixed-uniform");
  });
  it("得点0なら百分位0・ランクC", () => {
    const result = summarizeScore(INITIAL_SCORE_STATE, BOUNDS_INPUT);
    expect(result.percentile).toBe(0);
    expect(result.rank).toBe("C");
  });
  it("理論最大に近い満点プレイで高ランク（S寄り）が出る", () => {
    // 260タップ全て両JUST・最大倍率M=2。理論最大に張り付く。
    const taps: ScoreTapInput[] = Array.from({ length: 260 }, () => ({
      a: 1,
      diversity: 1,
      multiplier: 2,
      result: JUST,
    }));
    const result = summarizeScore(play(taps), BOUNDS_INPUT);
    expect(result.rank).toBe("S");
  });
  it("既定以外の combo 上限割合を集計と理論最大で揃える（理論端が config の値で算出される）", () => {
    // combo 上限割合を 0.20 に上げる。理論最大は baseMax×(1+0.20/0.80)=520×1.25=650 になるべき。
    // 揃わない（既定0.10のまま）と 520×(1+0.10/0.90)=577.77… になり前提がずれる。
    const config: ScoreConfig = { combo: DEFAULT_COMBO_CONFIG, comboShareMax: 0.2 };
    const taps: ScoreTapInput[] = Array.from({ length: 260 }, () => ({ a: 1, diversity: 1, multiplier: 2, result: JUST }));
    const result = summarizeScore(play(taps), { tapBudget: 260 }, config);
    expect(result.bounds.max).toBeCloseTo(650, 6);
    expect(result.percentile).toBeLessThanOrEqual(100);
    expect(result.rank).toBe("S");
  });
  it("boundsInput が明示した combo 上限割合は config の値より優先される", () => {
    // boundsInput.comboShareCap=0（headroom 0、Smax=baseMax=520）が config.comboShareMax=0.2 を上書きする。
    // 優先順位が逆なら Smax=650 になるため、bounds.max=520 で優先順位を固定する。
    const config: ScoreConfig = { combo: DEFAULT_COMBO_CONFIG, comboShareMax: 0.2 };
    const result = summarizeScore(INITIAL_SCORE_STATE, { tapBudget: 260, comboShareCap: 0 }, config);
    expect(result.bounds.max).toBeCloseTo(520, 6);
  });
});
