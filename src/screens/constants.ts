// 画面状態の有限状態機械が使う定数。状態の並び・許可遷移表・進行の時間・安全上限を置く。
//
// 進行の時間定数（導入演出の固定尺・カウントインの段あたり時間）は screens が所有・定義する。
// これらを src/config/tuning.ts には置かない。理由: tuning.ts 冒頭と src/config/README.md の
// 所有境界が「ウォームアップのカウントダウンは screens（#2）が所有・定義する」と明記しているため、
// screens に恒久的に置く（src/config/tuning.ts への移管はしない）。
// 時間値は判定や得点に影響しないUI進行の暫定値であり、実演出の実装と共に調整する。

import type { ScreenKey } from "./types";

/** 状態キーの並び。安全上限の導出と網羅の基準に使う。 */
export const SCREEN_KEYS: readonly ScreenKey[] = [
  "title",
  "warmup",
  "play",
  "result",
  "retry",
];

/**
 * 許可する遷移表。各状態から進める先のキーを列挙する。
 * 表に無い遷移要求は機械が不正として例外を投げる。
 * 基本経路: 題名→ウォームアップ→プレイ→結果→再挑戦→題名 の一巡。
 * 結果から「ウォームアップ」へ戻る経路を加える理由を先に述べる。結果画面（Issue #74）の
 * 「もう一度」は同じ曲を遊び直す再挑戦であり、題名（曲選択）を経由せずプレイの直前
 * （ウォームアップ）へ戻すのが意味に合う。「タイトルに戻る」は従来どおり結果→再挑戦→題名で戻す。
 */
export const ALLOWED_TRANSITIONS: Readonly<Record<ScreenKey, readonly ScreenKey[]>> = {
  title: ["warmup"],
  warmup: ["play"],
  play: ["result"],
  result: ["retry", "warmup"],
  retry: ["title"],
};

/**
 * 導入演出の固定尺（ミリ秒）。★暫定。
 * 骨格段階では実際の湖の導入演出が未実装で固定尺の正解値が存在しないため、
 * 流れを観察・自動検証しやすい短めの暫定値とする。実演出の実装と共に調整する。
 */
export const WARMUP_INTRO_DURATION_MS = 2000;

/**
 * カウントインの1段あたり時間（ミリ秒）。★暫定。
 * 「3-2-1」は3段の表示を意味する。楽曲非同期の中立な既定として1段1秒を採る。
 * 楽曲テンポへ同期させる調整は TextAlive統合（#4）と譜面パイプライン（M1）で行う。
 */
export const WARMUP_COUNTDOWN_STEP_MS = 1000;

/** カウントインの段数。3-2-1 の3段。 */
export const WARMUP_COUNTDOWN_STEPS = 3;

/** ウォームアップ全体の固定尺（ミリ秒）。導入演出とカウントインの合計。 */
export const WARMUP_TOTAL_DURATION_MS =
  WARMUP_INTRO_DURATION_MS + WARMUP_COUNTDOWN_STEP_MS * WARMUP_COUNTDOWN_STEPS;

/**
 * 1回の反映処理で反映する遷移回数の上限。状態数に1を加えた値。
 * 健全な遷移連鎖は各状態を高々1回ずつ経由するため、状態数を超える反映は循環（無限連鎖）を意味する。
 * 状態数から導出することで、将来状態が増えても上限が整合する。上限超過は不具合として例外で表面化させる。
 */
export const MAX_TRANSITIONS_PER_DRAIN = SCREEN_KEYS.length + 1;
