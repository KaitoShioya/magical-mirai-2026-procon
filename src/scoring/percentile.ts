// 簡易百分位（Issue #55）。総合得点 S を、内蔵の水準分布に照らした百分位へ写す。本モジュールは理論端の一様分布の累積分布（線形写像）で
// 簡易版を実装する。累積分布関数による磨きは Issue #66 が levelCurve.ts の percentileFromLevelCurve で実装した。
// simplePercentile は Issue #55 の参照実装かつ縮退（非有限・区間幅0以下）の参照として残す。
// 曲固有の絶対値は持たず理論端を引数で受け取り曲非依存を保つ。
// 依存規則に従い profiles・rendering・tools・three.js を取り込まない。

export interface ScoreBounds {
  min: number; // 理論最小 Smin
  max: number; // 理論最大 Smax
}

// 百分位の推定種別。"fixed-uniform" は Issue #55 の固定の一様分布（simplePercentile）、
// "builtin-level-curve" は Issue #66 の内蔵水準カーブによる累積分布関数（levelCurve.ts の percentileFromLevelCurve）を表す。
export type PercentileBasis = "fixed-uniform" | "builtin-level-curve";

// 百分位が、得点の理論端（理論最小・理論最大）に照らした到達度であり、実際のオンライン順位ではないことを示す文言。
// Issue #66 が Result 画面と README に明記する際に参照する。静的アプリ規約上オンライン順位は持てない（docs/decisions/app-overall-decisions.md 規約節）。
// 「理論値への到達度」と表す理由を先に述べる。百分位は過去のプレイの順位ではなく、得点を理論端 [Smin,Smax] に
// 照らした内蔵水準カーブの値であり（simplePercentile・levelCurve）、実装と齟齬の無い表現にするためである。
export const PERCENTILE_ESTIMATE_DISCLAIMER =
  "理論値への到達度であり、実際のオンライン順位ではありません。";

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  return value > max ? max : value;
}

// 総合得点 S を百分位 [0,100] へ写す簡易版（Issue #55）。
// 採用理由を先に述べる。docs/research/04-ux-and-chart-design.md §3 は「目的関数の理論的な最大と最小から合成した累積分布の関数を作り、
// 少数の実測で補正して同梱する」と定める。#55 の簡易版は、理論端 [Smin,Smax] 上の一様分布の累積分布（すなわち線形写像）だけを実装する。
// 一様分布は理論端だけから一意に決まり、追加の分布形状の仮定も実測も要しない。Smin→0、Smax→100、中点→50 と単調で、実測が無い
// #55 段階で中立かつ論理的に正しい唯一の選択である。#66 が分布形状の合成と少数実測の補正で磨く。
export function simplePercentile(score: number, bounds: ScoreBounds): number {
  if (!Number.isFinite(score)) return 0;
  // 理論端のいずれかが非有限なら順位差を定義できないため0（最下位相当）。非有限端では区間幅が非数や無限大になり、
  // 百分位が非数へ伝播するため、ここで止める。
  if (!Number.isFinite(bounds.min) || !Number.isFinite(bounds.max)) return 0;
  const span = bounds.max - bounds.min;
  if (!(span > 0)) return 0; // 縮退（Smax<=Smin）では順位差を作れないため0（最下位相当）
  const raw = ((score - bounds.min) / span) * 100;
  return clamp(raw, 0, 100);
}
