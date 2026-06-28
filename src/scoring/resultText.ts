// 結果表示の文字列整形（成果物タスク #71/#69）。総合得点・ランク・百分位を表示用の文字列に一度だけ整形し、
// 結果画面の文書要素と成果物画像の焼き込みの双方が同じ関数を使うことで、画面表示と画像内の数値を一致させる。
//
// 依存規則に従い profiles・rendering・ui・tools・three.js を取り込まない。scoring 内の型だけを用いる。
// 数値の丸め・百分位の言い回しは、既存の自己ベスト履歴表示（src/ui/scoreHistoryView.ts）と同じ規約に揃える。
// 理由を先に述べる。同じ百分位・得点を別々の言い回しで出すと、結果画面と履歴とで表示がぶれて利用者が混乱するため、
// 言い回しを1つの規約に統一する。

/** 結果表示・成果物画像の双方で使う、整形済みの表示文字列。 */
export interface ResultDisplayText {
  /** 総合得点（丸めた整数の文字列、非有限は「—」）。 */
  scoreText: string;
  /** ランク（C・B・A・S のいずれかの文字、非該当は「—」）。 */
  rankText: string;
  /** 百分位の言い回し（例「上位 12%」、非有限は「—」）。 */
  percentileText: string;
}

/** ランクとして妥当な文字の集合。これ以外が来たら表示は「—」にする（壊れた値を画像へ焼き込まないため）。 */
const VALID_RANKS = new Set(["C", "B", "A", "S"]);

/**
 * 総合得点を表示用の文字列にする。丸めて整数にし、非有限は「—」にする。
 * 丸める理由を先に述べる。得点は内部で小数を取り得るが、表示は読みやすさのため整数に揃える。
 * 桁区切りを入れない理由を先に述べる。既存の履歴表示（scoreHistoryView.ts の得点表示）が桁区切り無しのため、
 * 表示規約を1つに統一して画面間のぶれを無くす。
 */
export function formatResultScore(totalScore: number): string {
  if (!Number.isFinite(totalScore)) {
    return "—";
  }
  return String(Math.round(totalScore));
}

/**
 * ランクの文字を表示用にする。C・B・A・S 以外（壊れた値）は「—」にする。
 */
export function formatResultRank(rank: string): string {
  return VALID_RANKS.has(rank) ? rank : "—";
}

/**
 * 百分位を表示用の言い回しにする。0以上100以下へ丸めてから「上位 ◯%」にし、非有限は「—」にする。
 * 「上位 ◯%」にする理由を先に述べる。百分位は値が大きいほど上位を表すため、利用者が直感的に読める「上位」表現に変換する。
 * 100から引く理由を先に述べる。百分位の値そのものは下位からの順位であり、上位の割合はその補数（100−百分位）になる。
 * 範囲を0以上100以下へ丸める理由を先に述べる。算出側は百分位の有限性のみを保証し範囲は保証しないため、
 * 範囲外の値が表示に出ないよう表示の直前で丸める。これは既存の履歴表示（scoreHistoryView.ts の百分位表示）と同じ規約である。
 */
export function formatResultPercentile(percentile: number): string {
  if (!Number.isFinite(percentile)) {
    return "—";
  }
  const clamped = Math.min(100, Math.max(0, percentile));
  return `上位 ${Math.round(100 - clamped)}%`;
}

/**
 * 確定スコアの値から、表示用の3つの文字列をまとめて作る。
 * 結果画面の文書要素と成果物画像の焼き込みの双方がこの1つの関数を通すことで、数値の一致を構造的に担保する。
 * ランクは文字列で受ける。理由を先に述べる。結果画面の表示層は得点の帯分けの論理を持たず文字列だけを扱うため、
 * ランクの妥当性は formatResultRank が文字列として検査する。
 */
export function formatResultText(result: { totalScore: number; rank: string; percentile: number }): ResultDisplayText {
  return {
    scoreText: formatResultScore(result.totalScore),
    rankText: formatResultRank(result.rank),
    percentileText: formatResultPercentile(result.percentile),
  };
}
