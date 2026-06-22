// 総合得点の集計（Issue #55）。タップ1回の得点 a×D×M+combo を合成し、その合計 S を純粋reducerで積み上げる。
// 状態は呼び出し側（#56 結線・#59 本編結線）が保持する。combo の総得点に占める割合は最終確定で全体に対して再正規化し、上限割合以下に厳密に抑える。
// 依存規則に従い profiles・rendering・tools・three.js を取り込まない。

import type { JudgmentResult } from "./types";
import { COMBO_SHARE_MAX, DEFAULT_COMBO_CONFIG, comboPoint, nextComboRun, type ComboConfig } from "./combo";

export interface ScoreState {
  baseTotal: number;     // Σ(a×D×M)
  comboRawTotal: number; // Σ comboPoint（再正規化前）
  comboRun: number;      // 現在の連続走長
  tapCount: number;      // 反映済みタップ数
}

export const INITIAL_SCORE_STATE: ScoreState = {
  baseTotal: 0,
  comboRawTotal: 0,
  comboRun: 0,
  tapCount: 0,
};

export interface ScoreTapInput {
  a: number;          // タップ素点 a（tapBaseScore の戻り値、[0,1]）
  diversity: number;  // 多様性係数 D（computeDiversityCoefficient の戻り値、[0,1]。0 は最大逓減の有効値）
  multiplier: number; // 投下倍率 M（deploymentMultiplier の戻り値、[1,2]）
  result: Pick<JudgmentResult, "timingJust" | "pitchJust">; // combo 継続判定に使う
}

export interface ScoreConfig {
  combo: ComboConfig;
  comboShareMax: number; // combo が総得点に占める上限割合
}

export const DEFAULT_SCORE_CONFIG: ScoreConfig = {
  combo: DEFAULT_COMBO_CONFIG,
  comboShareMax: COMBO_SHARE_MAX,
};

// 実行時入力を安全側へ倒す補助。手本は src/scoring/gauge.ts の clamp 群（設定値は信頼し、実行時入力は防御する規約）。
// 素点 a を値域 [0,1] へ収める。非有限値は床（0）へ倒す。範囲外は端へ丸める。
function clampTapScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  return value >= 1 ? 1 : value;
}
// 多様性係数 D を値域 [0,1] へ収める。非有限値だけ逓減なし（1.0）へ倒す。D=0 は最大逓減の有効値であり
// そのまま0を通す（computeDiversityCoefficient は [0,1) を返し得る）。範囲外（1超）は1へ、負は0へ丸める。
function clampDiversity(value: number): number {
  if (!Number.isFinite(value)) return 1;
  if (value <= 0) return 0;
  return value >= 1 ? 1 : value;
}
// 投下倍率 M を値域 [1,2] へ収める。非有限値・1未満は倍率なし（1.0）へ倒す。2超は2へ丸める。
function clampMultiplier(value: number): number {
  if (!Number.isFinite(value)) return 1;
  if (value <= 1) return 1;
  return value >= 2 ? 2 : value;
}
// 累積値を非負へ守る（再正規化の前処理）。
function nonNegOrZero(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

// 純粋reducer。現在状態と1タップ入力から次状態を返す（src/scoring/gauge.ts の accumulateGauge と同型）。引数 state は変更しない。
// タップ1回の素点 base = a × D × M を加算し、combo は連続走長から別に加算する（合成式 a×D×M+combo の前半をここで合成する）。
export function reduceScore(
  state: ScoreState,
  input: ScoreTapInput,
  config: ScoreConfig = DEFAULT_SCORE_CONFIG,
): ScoreState {
  const base = clampTapScore(input.a) * clampDiversity(input.diversity) * clampMultiplier(input.multiplier);
  const run = nextComboRun(state.comboRun, input.result);
  const combo = comboPoint(run, config.combo);
  return {
    baseTotal: state.baseTotal + base,
    comboRawTotal: state.comboRawTotal + combo,
    comboRun: run,
    tapCount: state.tapCount + 1,
  };
}

export interface ScoreSummary {
  baseTotal: number;      // Σ(a×D×M)
  comboRawTotal: number;  // 再正規化前の combo 総和
  comboEffective: number; // 再正規化後の combo（総得点に反映する値）
  total: number;          // 総合得点 S = baseTotal + comboEffective
  comboShare: number;     // comboEffective / total（total=0 のとき0）
}

// combo の許容上限を base 総和から導く比。採用理由を先に述べる。docs/decisions/app-overall-decisions.md §3.4 は
// 「全体の得点に占める割合を抑える」と全体に対する制約を述べる。comboEffective ≤ baseTotal×(p/(1-p)) とすると、
// total = baseTotal + comboEffective に対し comboEffective/total ≤ p が baseTotal の大小に依らず成り立つ。
// 導出: comboEffective = b×p/(1-p) のとき comboEffective/(b + b×p/(1-p)) = [p/(1-p)]/[1 + p/(1-p)] = p。
// p（comboShareMax）が[0,1)の外（負・1以上・非有限）なら combo を載せない安全側（0）へ倒す。
function headroomRatio(comboShareMax: number): number {
  if (!Number.isFinite(comboShareMax) || comboShareMax <= 0 || comboShareMax >= 1) return 0;
  return comboShareMax / (1 - comboShareMax);
}

// 最終確定。combo 総和を全体に対して再正規化し、総得点に占める combo の割合を comboShareMax 以下に厳密に抑える。
export function finalizeScore(
  state: ScoreState,
  config: ScoreConfig = DEFAULT_SCORE_CONFIG,
): ScoreSummary {
  const baseTotal = nonNegOrZero(state.baseTotal);
  const comboRawTotal = nonNegOrZero(state.comboRawTotal);
  const cap = baseTotal * headroomRatio(config.comboShareMax);
  const comboEffective = Math.min(comboRawTotal, cap);
  const total = baseTotal + comboEffective;
  const comboShare = total > 0 ? comboEffective / total : 0;
  return { baseTotal, comboRawTotal, comboEffective, total, comboShare };
}
