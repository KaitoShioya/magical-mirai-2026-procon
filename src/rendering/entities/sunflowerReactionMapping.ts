// 反応強度からひまわりの見た目への写像（Issue #60）。three.js にも文書要素にも依存しない純粋関数で、
// 決定的に単体検証できる。docs/idea/concept-final.md §6 の「タイミング精度→大きさ、音程精度→輝度」を表す。
// 入力はいずれも0以上1以下の素の数値（大きさ強度・輝度強度）で、得点層（src/scoring）の型は取り込まない。
// 得点層の ReactionStrength（size と brightness、各0以上1以下）から大きさ強度・輝度強度を取り出す変換は
// 下流のシーン結線（#63）が担う。これにより rendering 層が得点層へ依存しない（依存規則 architecture.md §5）。
// 色は固定でスコアに寄与しないため写像しない。

import {
  SUNFLOWER_BRIGHTNESS_MAX,
  SUNFLOWER_BRIGHTNESS_MIN,
  SUNFLOWER_SCALE_MAX,
  SUNFLOWER_SCALE_MIN,
} from "../constants";

// 非有限値の防御。採用理由を先に述べる。NaN や無限大を写像へ通すと結果が NaN のまま行列や色へ流れ込み描画を
// 汚すため、入力段で弾く（既存 entities/glowPoints.ts・butterflyReactionMapping.ts の防御と同じ）。
function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} は有限値でなければなりません（受領: ${value}）`);
  }
}

// 有限値を0以上1以下へ丸める。採用理由を先に述べる。強度は0以上1以下で与える約束だが、上流の丸め誤差や
// 境界外の値が来ても写像が破綻しないよう範囲内へ収める。
function clamp01(value: number): number {
  if (value <= 0) {
    return 0;
  }
  return value >= 1 ? 1 : value;
}

/**
 * 大きさ強度（0以上1以下）からひまわりの大きさへの線形写像。強度0で最小、強度1で最大。
 * 採用理由を先に述べる。反応0でも灯しが完全に消えると湖面が寂しくなるため最小値を正の値にし、
 * 強度に対し単調増加の線形写像で「成功するほど大きい」を表す。
 */
export function reactionToScale(sizeStrength: number): number {
  assertFinite(sizeStrength, "大きさ強度");
  return SUNFLOWER_SCALE_MIN + (SUNFLOWER_SCALE_MAX - SUNFLOWER_SCALE_MIN) * clamp01(sizeStrength);
}

/**
 * 輝度強度（0以上1以下）からひまわりの輝度への線形写像。強度0で最小、強度1で最大。
 * 採用理由を先に述べる。反応0でも灯る正の最小はブルーム下限と消失の境を分ける値にし、
 * 強度に対し単調増加の線形写像で「成功するほど明るい」を表す。
 */
export function reactionToBrightness(brightnessStrength: number): number {
  assertFinite(brightnessStrength, "輝度強度");
  return (
    SUNFLOWER_BRIGHTNESS_MIN +
    (SUNFLOWER_BRIGHTNESS_MAX - SUNFLOWER_BRIGHTNESS_MIN) * clamp01(brightnessStrength)
  );
}
