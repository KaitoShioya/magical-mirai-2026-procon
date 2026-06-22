// 理論最大・最小の算出（Issue #55）。簡易百分位の写像の端 Smin・Smax を構成要素から算出する。
// 曲固有の絶対値（タップ総数上限）は引数で受け取り、本モジュールにはハードコードしない（src/config/tuning.ts 行12から14）。
// 依存規則に従い profiles・rendering・tools・three.js を取り込まない。

import { TAP_SCORE_WEIGHTS } from "./tapBaseScore";
import { COMBO_SHARE_MAX } from "./combo";
import type { ScoreBounds } from "./percentile";

export interface ScoreBoundsInput {
  tapBudget: number;        // タップ総数上限 N（曲固有。TAKEOVER は260。#44/#46 が算出して渡す）
  maxTapScore?: number;     // タップ素点 a の最大。既定は重みの和（等重みなら1.0）
  maxDiversity?: number;    // 多様性係数 D の最大（逓減なし）。既定1.0
  maxMultiplier?: number;   // 投下倍率 M の最大（満タン消費×見せ場重み最大）。既定2.0
  comboShareCap?: number;   // combo が総得点に占める上限割合。既定 COMBO_SHARE_MAX
}

// a の最大の既定は重みの和。重みの単一の所有元は tapBaseScore.ts であり、ここで値を複製しない。
const DEFAULT_MAX_TAP_SCORE = TAP_SCORE_WEIGHTS.timing + TAP_SCORE_WEIGHTS.pitch;

// 任意項目を、非有限・負なら既定値へ倒して取り出す。
function orDefault(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

// combo の許容上限を base に対する比へ変換する。p が[0,1)の外なら0（combo を載せない安全側）。
function comboHeadroom(comboShareCap: number): number {
  if (!Number.isFinite(comboShareCap) || comboShareCap <= 0 || comboShareCap >= 1) return 0;
  return comboShareCap / (1 - comboShareCap);
}

// 総合得点 S の理論的な最大・最小を構成要素から算出する。
// 理論最小 Smin は0に固定する。採用理由を先に述べる。docs/decisions/app-overall-decisions.md §3.4 は「タップしないこと自体は減点しない」と定め、
// 床タップの素点は0（発音・光点は演出で得点に寄与しない）であるため、達成可能な最小の総合得点は0である（タップしない、または素点0の床タップだけのプレイ）。
// 理論最大 Smax は次で算出する。S = Σ(a×D×M) + 再正規化後 combo。combo は再正規化後に baseMax×(p/(1-p)) を上限とするため、
// Smax = baseMax×(1 + p/(1-p)) = baseMax/(1-p)。baseMax = N × a最大 × D最大 × M最大。
export function theoreticalScoreBounds(input: ScoreBoundsInput): ScoreBounds {
  const tapBudget = Number.isFinite(input.tapBudget) && input.tapBudget > 0 ? input.tapBudget : 0;
  const maxTapScore = orDefault(input.maxTapScore, DEFAULT_MAX_TAP_SCORE);
  const maxDiversity = orDefault(input.maxDiversity, 1);
  const maxMultiplier = orDefault(input.maxMultiplier, 2);
  const comboShareCap = input.comboShareCap === undefined ? COMBO_SHARE_MAX : input.comboShareCap;

  const baseMax = tapBudget * maxTapScore * maxDiversity * maxMultiplier;
  const max = baseMax * (1 + comboHeadroom(comboShareCap));
  // Smin は0固定。max は縮退入力（非有限・負）に備え有限・非負へ守る。min=0<=max が常に成り立つ。
  return { min: 0, max: Number.isFinite(max) && max > 0 ? max : 0 };
}
