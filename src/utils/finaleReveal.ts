// 楽曲終了後の灯し立ち上げ演出（Issue #63）の進行計算。描画を伴わない決定的な純粋関数だけを置く。
// 既に湖面に灯っている蝶・ひまわりに、終了時だけ「点灯の盛り上がり（一過性の輝度の増加）」を、配置順（旅路の順）に
// わずかな時間差を付けて重ねる。点灯の波が中心の周りへ広がり「情景が立ち上がる」印象を作る。暗転は挟まず、輝度は
// 基準値を一度も下回らずに基準値へ収束する。

/** 立ち上げ演出の時間と強さのパラメータ。 */
export interface FinaleParams {
  /** 各個体が点灯の盛り上がりを始めてから終えるまでの時間（秒）。 */
  riseDurationSec: number;
  /** 最初の個体と最後の個体の点灯開始の時間差の合計（秒）。配置順に按分する。 */
  staggerTotalSec: number;
  /** 点灯の盛り上がりの最大の増分（基準輝度に対する倍率の上乗せ。0.4なら最大1.4倍）。 */
  brightnessOvershoot: number;
}

/** 有限値を0以上1以下へ丸める。 */
function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return value >= 1 ? 1 : value;
}

/**
 * 個体ごとの局所進行（0から1）を求める。配置順（index）に応じて点灯開始を遅らせる。
 * 開始前は0、開始から riseDurationSec で1に達する。
 * 時間差の按分の理由を先に述べる。最初の個体（index 0）を0秒、最後の個体（index count-1）を staggerTotalSec から
 * 始めるよう、個体間の間隔を staggerTotalSec ÷ (count-1) にする。count が1のときは間隔を0にして0除算を避ける。
 */
export function finaleLocalProgress(
  elapsedSec: number,
  index: number,
  count: number,
  params: FinaleParams
): number {
  if (!Number.isFinite(elapsedSec) || elapsedSec <= 0) {
    return 0;
  }
  const safeDuration = params.riseDurationSec > 0 ? params.riseDurationSec : 1;
  const step = count > 1 ? params.staggerTotalSec / (count - 1) : 0;
  const start = step * index;
  return clamp01((elapsedSec - start) / safeDuration);
}

/**
 * 局所進行（0から1）から、点灯の盛り上がりの形（0から1）を求める。
 * 局所進行が0と1のとき0、中ほど（0.5）で1になる山形にする。正弦半波を採る理由を先に述べる。
 * 始点と終点で0、中ほどで最大の滑らかな山であり、点灯が立ち上がって基準へ戻る一過性の盛り上がりを滑らかに表すため。
 */
export function finalePulse(local: number): number {
  const t = clamp01(local);
  return Math.sin(Math.PI * t);
}

/**
 * 局所進行と最大増分から、基準輝度に掛ける倍率を求める。局所進行が0と1のとき1.0（基準・暗転しない）、中ほどで 1+増分。
 * 倍率が1.0を下回らない理由を先に述べる。暗転を挟まない（既に灯っている灯しを暗くしない）要件を満たすため、
 * 基準輝度に正の増分だけを乗せる。
 */
export function finaleBrightnessMultiplier(local: number, brightnessOvershoot: number): number {
  const overshoot = Number.isFinite(brightnessOvershoot) && brightnessOvershoot > 0 ? brightnessOvershoot : 0;
  return 1 + overshoot * finalePulse(local);
}

/**
 * 立ち上げ演出が完了したか（全個体の局所進行が1に達したか）を返す。
 * 完了の条件を先に述べる。最後に始まる個体（開始が staggerTotalSec）が riseDurationSec を終えた時刻、すなわち
 * 経過時間が staggerTotalSec + riseDurationSec 以上になれば、全個体が基準輝度へ収束している。
 */
export function isFinaleComplete(elapsedSec: number, params: FinaleParams): boolean {
  if (!Number.isFinite(elapsedSec)) {
    return false;
  }
  return elapsedSec >= params.staggerTotalSec + params.riseDurationSec;
}
