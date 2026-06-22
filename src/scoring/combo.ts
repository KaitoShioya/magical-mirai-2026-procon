// コンボ加点（Issue #55）。連続して精度の高いタップが続くほど増える加算値で、上限を持ち、精度の低いタップで途切れる（§3.4）。
// 状態（連続走長）は呼び出し側が保持し、本モジュールは純粋関数で次走長と1タップ分の加点を返す（手本 src/scoring/gauge.ts）。
// 依存規則に従い profiles・rendering・tools・three.js を取り込まない。

import type { JudgmentResult } from "./types";

export interface ComboConfig {
  step: number;
  maxSteps: number;
}

// 採用理由を先に述べる。combo は「連続して精度の高いタップが続くほど増える加算値で、上限を持つ」（docs/decisions/app-overall-decisions.md §3.4）。
// 連続走長から飽和線形で加点する。step は1段あたりの加点、maxSteps は段数の上限であり、1タップの combo 上限 = step × maxSteps。
// step=0.05・maxSteps=10 は★暫定値。最終的な combo の総得点に占める割合は finalizeScore の再正規化が上限割合で頭打ちにするため、
// これらの値は上限への到達速度だけを左右し、10パーセント以下の保証には影響しない。実装後のプレイ検証で調整する。
export const DEFAULT_COMBO_CONFIG: ComboConfig = { step: 0.05, maxSteps: 10 };

// combo が総得点に占める上限割合。採用理由を先に述べる。Issue #55 の技術要件「combo上限は総得点の10パーセント以下」を採る
// （§3.4 は「十数パーセント以内」とより緩いが、Issue #55 はより厳しい10パーセントを明記）。原典に単一確定値が無く所有 Issue #55 が確定する
// （src/config/tuning.ts 行17）。tuning.ts には置かない。
export const COMBO_SHARE_MAX = 0.1;

// combo を継続（連続走長を伸ばす）させる「精度の高いタップ」か。タイミングと音程の両方が満点窓（JUST）のときだけ真。
// 採用理由を先に述べる。判定エンジン #48 が確定済みの JUST 二値（timingJust・pitchJust）を再利用し、新しい閾値定数を増やさない
// （src/config/tuning.ts 行17）。ゲージ蓄積 #54 の「成功」基準も JUST であり、scoring 層内の基準を JUST に揃える。
export function isComboHit(result: Pick<JudgmentResult, "timingJust" | "pitchJust">): boolean {
  return result.timingJust && result.pitchJust;
}

// 次の連続走長。継続するタップで +1、しないタップで 0 へ戻す（途切れ）。非有限・負の現在走長は0起点とする（既存 gauge と同規約）。
export function nextComboRun(
  currentRun: number,
  result: Pick<JudgmentResult, "timingJust" | "pitchJust">,
): number {
  if (!isComboHit(result)) return 0;
  const base = Number.isFinite(currentRun) && currentRun > 0 ? Math.floor(currentRun) : 0;
  return base + 1;
}

// 連続走長から1タップ分の combo 加点（再正規化前の素の値）を返す。combo = step × min(max(run−1, 0), maxSteps)。
// run−1 とするのは「連続して初めて加点する」ため（単発 run=1 では0）。maxSteps で頭打ちにして「上限を持つ」を満たす。
export function comboPoint(run: number, config: ComboConfig = DEFAULT_COMBO_CONFIG): number {
  const r = Number.isFinite(run) && run > 0 ? Math.floor(run) : 0;
  const steps = Math.min(Math.max(r - 1, 0), config.maxSteps);
  return config.step * steps;
}
