// 結果要約（Issue #55）。スコア累積状態と理論端の素材から、総合得点・百分位・ランクを1つにまとめる通しの入口。
// #59 本編結線が組み立て、ランクゲージ（#65）・百分位の磨き（#66）・Result 画面が消費する。
// 依存規則に従い profiles・rendering・tools・three.js を取り込まない。

import { finalizeScore, DEFAULT_SCORE_CONFIG, type ScoreConfig, type ScoreState } from "./scoreAccumulator";
import { theoreticalScoreBounds, type ScoreBoundsInput } from "./scoreBounds";
import { simplePercentile, type ScoreBounds, type PercentileBasis } from "./percentile";
import { rankFromPercentile, type Rank } from "./rank";

// プレイ結果の得点要約。
export interface ScoreResult {
  totalScore: number;               // 総合得点 S
  percentile: number;               // 百分位 [0,100]
  rank: Rank;                       // C/B/A/S
  bounds: ScoreBounds;              // 算出に使った理論端（再現性・デバッグ用）
  percentileBasis: PercentileBasis; // "fixed-uniform"（#55 の簡易版）
}

// スコア累積状態と理論端の素材から、総合得点・百分位・ランクを1つにまとめて返す。
// これが「固定閾値ランクが出る」（Issue #55 受け入れ基準）の通しの入口である。
export function summarizeScore(
  state: ScoreState,
  boundsInput: ScoreBoundsInput,
  config: ScoreConfig = DEFAULT_SCORE_CONFIG,
): ScoreResult {
  const summary = finalizeScore(state, config);
  // 理論最大 Smax の算出に使う combo 上限割合を、集計（finalizeScore）と同じ値に揃える。採用理由を先に述べる。
  // 揃えないと、既定以外の上限割合を使ったとき総合得点 S と理論最大 Smax の前提がずれ、百分位が過大・過小になる。
  // boundsInput が明示の comboShareCap を持つときはそれを優先し、無いときは config の comboShareMax を使う。
  const bounds = theoreticalScoreBounds({
    ...boundsInput,
    comboShareCap: boundsInput.comboShareCap ?? config.comboShareMax,
  });
  const percentile = simplePercentile(summary.total, bounds);
  const rank = rankFromPercentile(percentile);
  return {
    totalScore: summary.total,
    percentile,
    rank,
    bounds,
    percentileBasis: "fixed-uniform",
  };
}
