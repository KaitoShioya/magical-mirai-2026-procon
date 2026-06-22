// タップ素点 a の合成（Issue #55）。判定結果のタイミング精度と音程精度を、得点に寄与する単一のスカラ a へまとめる。
// 反応強度（reactionStrength.ts）は表示用の2チャンネルを返すだけで得点用スカラを作らないため、本モジュールが a を担う。
// 依存規則（docs/decisions/architecture.md §5、src/scoring/README.md）に従い profiles・rendering・tools・three.js を取り込まない。

import type { JudgmentResult } from "./types";

export interface TapBaseScoreWeights {
  timing: number;
  pitch: number;
}

// 採用理由を先に述べる。タイミングと音程は「ハメ」の対称な2チャンネルであり（出典 docs/idea/concept-final.md §4・§6、
// タイミング精度→大きさ・音程精度→輝度を対等に扱う）、得点側で一方を優遇する記述が正典に無い。推測で非対称化しない方針
// （src/config/tuning.ts 行17）に従い等重みとする。重みの和を1.0にすると、両精度が[0,1]のとき素点 a も[0,1]に収まり、
// 両JUST（両精度1.0）で a=1.0 が最大になる（docs/decisions/app-overall-decisions.md §3.4「両方がJUSTのとき最大」を満たす）。
// 重みの基準値は #55 が所有し tuning.ts には置かない（src/config/tuning.ts 行15から17の所有規則）。実装後のプレイ検証で調整する★暫定値。
export const TAP_SCORE_WEIGHTS: TapBaseScoreWeights = { timing: 0.5, pitch: 0.5 };

// 値を0以上1以下へ収める。非有限値は0へ倒す（既存 timingAccuracy・reactionStrength と同じ規約。判定を止めない床の方針）。
function clampUnitInterval(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  return value >= 1 ? 1 : value;
}

// タップ素点 a を返す。a = タイミング精度 × 重み + 音程精度 × 重み。X軸の色は読まない（得点に寄与しない）。
// 値域は重みの和が1.0のとき [0,1]。両JUSTで最大1.0。
export function tapBaseScore(
  judgment: Pick<JudgmentResult, "timingAccuracy" | "pitchAccuracy">,
  weights: TapBaseScoreWeights = TAP_SCORE_WEIGHTS,
): number {
  const timing = clampUnitInterval(judgment.timingAccuracy) * weights.timing;
  const pitch = clampUnitInterval(judgment.pitchAccuracy) * weights.pitch;
  const a = timing + pitch;
  return a > 0 ? a : 0;
}
