// 固定閾値ランク（Issue #55）。総合得点 S を百分位へ変換し、C・B・A・S の4段階へ帯分けする暫定版。
// OKLCH ランクゲージ（#65）と累積分布関数による百分位（#66）が後継として磨く。
// 依存規則に従い profiles・rendering・tools・three.js を取り込まない。

import { simplePercentile, type ScoreBounds } from "./percentile";

// ランクを低い順に並べた正準配列。順序情報と帯分けの両方がこの配列を唯一の所有元にする。
export const RANKS_ASCENDING = ["C", "B", "A", "S"] as const;
export type Rank = (typeof RANKS_ASCENDING)[number];

// ランクの序数（C=0 < B=1 < A=2 < S=3）。比較やランクゲージの進捗（#65）が使う。
export function rankOrdinal(rank: Rank): number {
  return RANKS_ASCENDING.indexOf(rank);
}

// 百分位の帯境界（昇順、単位はパーセント）。p<B→C、B<=p<A→B、A<=p<S→A、S<=p→S。
// 採用理由を先に述べる。docs/decisions/app-overall-decisions.md §3.4 は「百分位に変換し…4段階に対応づける」と百分位経由を定める。
// 実測分布が無い #55 段階では等幅四分位（25・50・75）が中立かつ単調で、どのランクにも恣意的な偏りを入れない。
// docs/research/04-ux-and-chart-design.md §3 の少数実測の補正が来る #66 で非等幅へ磨く前提。閾値は #55 が所有し tuning.ts に置かない（src/config/tuning.ts 行15）。★暫定。
export const RANK_PERCENTILE_THRESHOLDS = { B: 25, A: 50, S: 75 } as const;

// 百分位 [0,100] を C/B/A/S へ帯分けする。左閉右開で帯の重複・欠落を作らない。非有限・負は最下位 C、100超は最上位 S。
export function rankFromPercentile(percentile: number): Rank {
  if (!Number.isFinite(percentile)) return "C";
  if (percentile < RANK_PERCENTILE_THRESHOLDS.B) return "C";
  if (percentile < RANK_PERCENTILE_THRESHOLDS.A) return "B";
  if (percentile < RANK_PERCENTILE_THRESHOLDS.S) return "A";
  return "S";
}

// 総合得点 S と理論端からランクを直接返す。
export function rankFromScore(score: number, bounds: ScoreBounds): Rank {
  return rankFromPercentile(simplePercentile(score, bounds));
}
