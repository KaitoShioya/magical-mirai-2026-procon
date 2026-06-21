// タイミング精度の純粋関数（Issue #48）。音楽の時刻と入力の時刻の差を連続値（0以上1以下）に写す。
// 採用する式の根拠を先に述べる。原典（docs/research/04-ux-and-chart-design.md §1、
// docs/research/07-feasibility-and-parameters.md §2.4）は満点窓を前後40ミリ秒、線形減衰の外端を前後90ミリ秒と定める。
// 両者の間を直線で結び、外端で0、満点窓の内側で1に切り詰めると、原典の3条件（40で1.0、90で0.0、その間は線形）を1つの式で満たす。
// 点推定の前後60ミリ秒は独立した分岐を持たせず、この連続曲線上の代表値（(90-60)/(90-40)=0.6）として扱う（ユーザー承認）。
// 数値40・90は src/config/tuning.ts の判定窓定数を呼び出し側が JudgmentWindows として渡し、本モジュールでは再定義しない。

import type { JudgmentWindows } from "./types";

/**
 * 中心化済み時間差（ミリ秒）を返す。
 * 補正値の符号の根拠を先に述べる。較正で測る遅れは「入力が一貫して遅れる量」であり、これを入力の音楽時刻から差し引くと
 * 判定窓の中心が遅れ側へ移動して体感に一致する（出典 Issue #48 受け入れ基準、docs/research/04 §1）。
 * 補正値の所有は較正UI #50 であり、本関数は引数として受け取る。
 */
export function centeredDiffMs(
  tapMusicTimeMs: number,
  noteMusicTimeMs: number,
  calibrationOffsetMs: number
): number {
  return tapMusicTimeMs - noteMusicTimeMs - calibrationOffsetMs;
}

/**
 * 中心化済み時間差と判定窓からタイミング精度（0以上1以下）を返す。
 * |diff| が perfectMs 以内で1.0、outerMs 以上で0.0、その間は線形。非有限値は床側（0.0）へ倒す。
 */
export function timingAccuracy(diffMs: number, windows: JudgmentWindows): number {
  if (!Number.isFinite(diffMs)) {
    return 0;
  }
  const distance = Math.abs(diffMs);
  const span = windows.outerMs - windows.perfectMs;
  if (!(span > 0)) {
    // 退避: 外端が満点窓以下（不正または縮退した窓）のときは、満点窓内のみ1、外は0とする。
    return distance <= windows.perfectMs ? 1 : 0;
  }
  const raw = (windows.outerMs - distance) / span;
  if (raw <= 0) {
    return 0;
  }
  if (raw >= 1) {
    return 1;
  }
  return raw;
}

/**
 * タイミングJUST（満点窓内）か。中心化済み時間差の絶対値が perfectMs 以内のとき真。
 * #54 ゲージと #55 スコアが「タイミングの成功」の素データとして用いる。
 * 非有限値は偽（失敗のない床の方針のため判定を止めず、JUSTには数えない）。
 */
export function isTimingJust(diffMs: number, windows: JudgmentWindows): boolean {
  if (!Number.isFinite(diffMs)) {
    return false;
  }
  return Math.abs(diffMs) <= windows.perfectMs;
}
