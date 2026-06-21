// 「舞って消える」寿命の純粋関数（Issue #61）。three.js にも文書要素にも依存しないため決定的に単体検証できる。
// 蝶の二役のうち演奏中のノーツ効果（出現→上昇→消滅）の時間制御を、上昇量・横揺れ・フェード係数として表す。
// sin羽ばたきだけに頼らず、上昇経路と個体差にも自然さを持たせる（docs/research/02-non-text-expression.md §5）。

import {
  BUTTERFLY_FADE_IN_FRACTION,
  BUTTERFLY_FADE_OUT_START,
  BUTTERFLY_SWAY_SPEED,
} from "../constants";

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} は有限値でなければなりません（受領: ${value}）`);
  }
}

/**
 * 経過時間を0以上1以下の寿命進行へ正規化する。開始0・寿命到達1。寿命を超えた経過は1へ丸める。
 * 寿命は正でなければならない（0以下は割り算が破綻するため例外）。
 */
export function lifeProgress(elapsedSeconds: number, lifeSeconds: number): number {
  assertFinite(elapsedSeconds, "経過秒");
  assertFinite(lifeSeconds, "寿命秒");
  if (lifeSeconds <= 0) {
    throw new Error(`寿命秒は正でなければなりません（受領: ${lifeSeconds}）`);
  }
  const u = elapsedSeconds / lifeSeconds;
  if (u <= 0) {
    return 0;
  }
  return u >= 1 ? 1 : u;
}

/**
 * 上昇量。上昇速度×経過秒の等速で表す。
 * 採用理由を先に述べる。蝶が空中へ舞い上がる穏やかな上昇を最小の式で表す。上昇速度は spawn 時に基準値へ
 * 個体ごとの小さなばらつきを掛けた値を渡す（spawn初速のばらつき）。
 */
export function riseOffset(elapsedSeconds: number, riseSpeed: number): number {
  assertFinite(elapsedSeconds, "経過秒");
  assertFinite(riseSpeed, "上昇速度");
  return riseSpeed * elapsedSeconds;
}

/**
 * 上昇中の微小な横揺れ。水平面の片方向（x）へ振幅×正弦を与え、もう一方（z）は動かさない。
 * 採用理由を先に述べる。真っ直ぐ上昇すると機械的に見えるため、羽ばたきと位相を共有しない小振幅の横揺れで
 * 「舞い」を加える。角速度は羽ばたきより遅い横揺れの定数（BUTTERFLY_SWAY_SPEED）を使う。
 */
export function swayOffset(
  elapsedSeconds: number,
  phase: number,
  amplitude: number
): { x: number; z: number } {
  assertFinite(elapsedSeconds, "経過秒");
  assertFinite(phase, "横揺れ位相");
  assertFinite(amplitude, "横揺れ振幅");
  return { x: amplitude * Math.sin(elapsedSeconds * BUTTERFLY_SWAY_SPEED + phase), z: 0 };
}

/**
 * 出現→中盤→消滅のフェード係数（0以上1以下）。
 * 採用理由を先に述べる。唐突な出現と消滅は不自然なため、寿命進行の前半 BUTTERFLY_FADE_IN_FRACTION までで
 * 0から1へ立ち上げ、後半 BUTTERFLY_FADE_OUT_START 以降で1から0へ滑らかに消す。その間は1を保つ。
 * フェード係数は大きさと輝度の両方に乗じるため、消えるときは小さくかつ暗くなる。
 */
export function fadeFactor(lifeU: number): number {
  assertFinite(lifeU, "寿命進行");
  if (lifeU <= 0) {
    return 0;
  }
  if (lifeU < BUTTERFLY_FADE_IN_FRACTION) {
    return lifeU / BUTTERFLY_FADE_IN_FRACTION;
  }
  if (lifeU <= BUTTERFLY_FADE_OUT_START) {
    return 1;
  }
  if (lifeU < 1) {
    return (1 - lifeU) / (1 - BUTTERFLY_FADE_OUT_START);
  }
  return 0;
}
