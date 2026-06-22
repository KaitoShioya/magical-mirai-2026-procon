// ゲージと投下の純粋ロジック（Issue #54）。
// 設計根拠 docs/decisions/app-overall-decisions.md §3.4・§3.6、docs/idea/concept-final.md §8、
// 見積もり docs/research/07-feasibility-and-parameters.md §2.5。
//
// 役割を先に述べる。タップの成功でゲージを蓄積し、見せ場で投下してゲージを消費し、
// 得点式 a×D×M+combo（§3.4）の投下倍率 M を供給する。判定そのものは行わず、
// 判定結果 JudgmentResult の timingJust・pitchJust（型コメントに「#54 ゲージが消費する」と明記）だけを消費する。
//
// 依存規則（docs/decisions/architecture.md §5、src/scoring/README.md）に従い、profiles・rendering・tools・three.js を
// 取り込まない。曲固有の値（満タン容量・見せ場重み）は呼び出し側（#59）から引数で受け取る。
// 状態は持たず、呼び出し側が現在のゲージ量を保持して「現在値→次値」を本モジュールの純関数で更新する
// （既存 tapJudgment.ts・timingAccuracy.ts と同じ純関数志向）。

import type { JudgmentResult } from "./types";
import { GAUGE_BOTH_JUST_MULTIPLIER } from "../config/tuning";

/** ゲージ蓄積と満タンの設定値。曲依存の絶対値であり、呼び出し側が妥当な値を渡す前提とする。
 *  fullCapacity は満タン容量、baseAmount は片JUST1回の加算量、bothJustMultiplier は両JUST時の倍率。 */
export interface GaugeConfig {
  fullCapacity: number;
  baseAmount: number;
  bothJustMultiplier: number;
}

/** 設定値の既定。★暫定（プレイ検証で調整、または #59 が TAKEOVER の tapBudget・showcases から導出して上書き）。
 *  満タン容量50・基本量1の出所を先に述べる。満タンはおよそ50タップ分＝投下5回分であり（§3.6、research07 §2.5）、
 *  TAKEOVER のタップ総数上限260を見せ場6箇所で割った約43タップを端数込みで丸めた曲依存の値である。
 *  この絶対値を src/config/tuning.ts に置かない理由は、同ファイル冒頭の注記が「満タンの絶対タップ数(約50)・
 *  投下回数(5)はゲージ機構(#54)と曲プロファイルに置く」と所有を定めているため。両JUST倍率だけは曲非依存の
 *  調整値として tuning.ts の GAUGE_BOTH_JUST_MULTIPLIER を借用する。 */
export const DEFAULT_GAUGE_CONFIG: GaugeConfig = {
  fullCapacity: 50,
  baseAmount: 1,
  bothJustMultiplier: GAUGE_BOTH_JUST_MULTIPLIER,
};

/** 投下1回の結果。consumedAmount は消費したゲージ量、consumedRatio は満タン容量に対する消費割合（0以上1以下）、
 *  multiplier は投下倍率 M、remaining は消費後のゲージ量。
 *  remaining の値の根拠を先に述べる。投下は現在ゲージを全消費する設計のため remaining は常に0を返す。
 *  将来の部分消費への拡張に備えてフィールドとして保持する。 */
export interface DeployResult {
  consumedAmount: number;
  consumedRatio: number;
  multiplier: number;
  remaining: number;
}

/** value を区間 [min, max] へ切り詰める。 */
function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

/** value を区間 [0, 1] へ切り詰める。非有限値は0へ倒す（失敗のない床の方針）。 */
function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return clamp(value, 0, 1);
}

/** fullCapacity を有限かつ0以上に整える。非有限は0へ倒す。0以下はそのまま縮退として返す（呼び出し側で退避判定する）。 */
function finiteCapacity(fullCapacity: number): number {
  if (!Number.isFinite(fullCapacity)) {
    return 0;
  }
  return fullCapacity;
}

/**
 * 1タップでゲージに加える量を返す。
 * 片JUST（timingJust と pitchJust の一方だけが真）で基本量、両JUST（両方が真）で基本量の bothJustMultiplier 倍、
 * どちらも偽（両軸を外したタップ、対応ノーツの無い床のタップ）で0（§3.6「どちらか一方が成功したとき基本量」）。
 * config の baseAmount・bothJustMultiplier は設定値として信頼し、返り値を防御的に切り詰めない
 * （異常値は呼び出し側責務。既存 timingAccuracy が設定値 JudgmentWindows を信頼するのと同じ扱い）。
 */
export function gaugeGain(result: JudgmentResult, config: GaugeConfig = DEFAULT_GAUGE_CONFIG): number {
  if (result.timingJust && result.pitchJust) {
    return config.baseAmount * config.bothJustMultiplier;
  }
  if (result.timingJust || result.pitchJust) {
    return config.baseAmount;
  }
  return 0;
}

/**
 * 現在のゲージ量に1タップ分を加え、満タン容量で頭打ちにした次のゲージ量を返す。
 * 結果は区間 [0, fullCapacity] へ切り詰める（既存 timingAccuracy の出力クランプと同じ扱い）。
 * 実行時入力 currentValue が非有限のときは0を起点にする（ゲージは非負の累積量であり、復元できない値は0へ倒す）。
 * 縮退した fullCapacity（0以下・非有限）ではゲージ量を0に保つ。
 */
export function accumulateGauge(
  currentValue: number,
  result: JudgmentResult,
  config: GaugeConfig = DEFAULT_GAUGE_CONFIG
): number {
  const capacity = finiteCapacity(config.fullCapacity);
  if (capacity <= 0) {
    return 0;
  }
  const current = Number.isFinite(currentValue) ? currentValue : 0;
  return clamp(current + gaugeGain(result, config), 0, capacity);
}

/**
 * 投下倍率 M を返す。M = 1 + (消費割合 × 見せ場重み)。
 * 採用する式の根拠を先に述べる。§3.4 は投下倍率を「投下したとき1.0より大きくなる」と定め、Issue本文は
 * 「消費割合×見せ場重み」と定める。積を基準値1.0への加点項として扱うと、未投下で1.0、投下で1.0超となり両者を満たす。
 * 2引数をそれぞれ [0, 1] へ切り詰めてから積を取るため、M は構造上 [1.0, 2.0] に収まる（最大2.0は消費割合1.0かつ見せ場重み1.0）。
 * showcaseWeight はフレームごとの実行時入力として防御的に切り詰める（素の Showcase.weight は #41 が[0,1]を保証する）。
 */
export function deploymentMultiplier(consumedRatio: number, showcaseWeight: number): number {
  return 1 + clamp01(consumedRatio) * clamp01(showcaseWeight);
}

/**
 * 見せ場で投下し、現在のゲージ量を全消費する。消費割合・投下倍率・消費後の残量（0）を返す。
 * 消費モデルの根拠を先に述べる。倍率が「消費した割合に応じて変わる」ためには消費量が可変でなければならず、
 * 投下時点のゲージ量がそのまま消費割合（消費量÷満タン容量）を決める方式が§3.6と整合する（§8「どの瞬間に投下するかを選ぶ」）。
 * 空ゲージ、および縮退した fullCapacity（0以下・非有限）では無操作（消費0・消費割合0・倍率1.0）とする。
 * fullCapacity を退避する理由は、満タン判定と消費割合の分母であり0以下や非有限だと0除算やNaN伝播で
 * 「ゲージは有限の非負量」という不変条件が壊れるためで、設定値を信頼する原則の構造的例外である。
 * multiplier は deploymentMultiplier を呼んで求め、倍率の計算経路を1つに保つ。
 */
export function deploy(
  currentValue: number,
  showcaseWeight: number,
  config: GaugeConfig = DEFAULT_GAUGE_CONFIG
): DeployResult {
  const capacity = finiteCapacity(config.fullCapacity);
  if (capacity <= 0) {
    return { consumedAmount: 0, consumedRatio: 0, multiplier: 1, remaining: 0 };
  }
  const current = Number.isFinite(currentValue) ? currentValue : 0;
  const consumedAmount = clamp(current, 0, capacity);
  const consumedRatio = clamp(consumedAmount / capacity, 0, 1);
  const multiplier = deploymentMultiplier(consumedRatio, showcaseWeight);
  return { consumedAmount, consumedRatio, multiplier, remaining: 0 };
}
