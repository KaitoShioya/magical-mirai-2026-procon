// 反応強度から蝶の見た目への写像（Issue #61）。three.js にも文書要素にも依存しない純粋関数で、
// 決定的に単体検証できる。docs/idea/concept-final.md §6 の「タイミング精度→大きさ、音程精度→輝度」を表す。
// 入力はいずれも0〜1の精度（算出は上流 Issue #51）。色は固定でスコアに寄与しないため写像しない。

import {
  BUTTERFLY_BRIGHTNESS_MAX,
  BUTTERFLY_BRIGHTNESS_MIN,
  BUTTERFLY_SCALE_MAX,
  BUTTERFLY_SCALE_MIN,
} from "../constants";

// 非有限値の防御。採用理由を先に述べる。NaN や無限大を Math.min・Math.max に通すと結果が NaN のまま
// 行列や色へ流れ込み描画を汚すため、入力段で弾く（既存 entities/glowPoints.ts の assertFinite と同じ防御）。
function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} は有限値でなければなりません（受領: ${value}）`);
  }
}

// 有限値を0以上1以下へ丸める。採用理由を先に述べる。精度は0〜1で与える約束だが、上流の丸め誤差や境界外の値が
// 来ても写像が破綻しないよう範囲内へ収める。
function clamp01(value: number): number {
  if (value <= 0) {
    return 0;
  }
  return value >= 1 ? 1 : value;
}

/**
 * タイミング精度（0〜1）から蝶の大きさへの線形写像。精度0で最小、精度1で最大。
 * 採用理由を先に述べる。反応0でも灯しが完全に消えると湖面が寂しくなるため最小値を正の値にし、
 * 精度に対し単調増加の線形写像で「成功するほど大きい」を表す。
 */
export function reactionToScale(timingPrecision: number): number {
  assertFinite(timingPrecision, "タイミング精度");
  return BUTTERFLY_SCALE_MIN + (BUTTERFLY_SCALE_MAX - BUTTERFLY_SCALE_MIN) * clamp01(timingPrecision);
}

/**
 * 音程精度（0〜1）から蝶の輝度への線形写像。精度0で最小、精度1で最大。
 * 採用理由を先に述べる。反応0でも灯る正の最小は寿命フェードと合成しても消失と混同しない値にし、
 * 精度に対し単調増加の線形写像で「成功するほど明るい」を表す。
 */
export function reactionToBrightness(pitchPrecision: number): number {
  assertFinite(pitchPrecision, "音程精度");
  return (
    BUTTERFLY_BRIGHTNESS_MIN + (BUTTERFLY_BRIGHTNESS_MAX - BUTTERFLY_BRIGHTNESS_MIN) * clamp01(pitchPrecision)
  );
}
