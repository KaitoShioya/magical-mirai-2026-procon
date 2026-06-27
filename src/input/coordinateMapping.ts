// 入力の純粋関数群。画面座標の正規化、音程スロット番号への写像、入力源の判定、
// および全入力源（ポインタとキーボード）が通る判定面写像関数を提供する。
// 副作用を持たず、非有限値（非数・無限大）に対する丸めを定義する。
// 依存規則（docs/decisions/architecture.md §5）に従い、profiles・tools・rendering・three.js を import しない。
// 設計の出典: docs/decisions/app-overall-decisions.md §3.3、docs/idea/concept-final.md §4。
//
// 音程はX軸の7レーンで選ぶ。タップの正規化Xからレーン番号（スロット）への写像と、レーンの中央の正規化Xは、
// 入力と描画（落下レーン）の双方が共有するため、その正典を src/utils/pitchHudLayout.ts に置く。ここでは正典を
// 取り込み、入力の取得経路（このモジュール）を変えずに同名で再エクスポートする。
import { resolveSlotCount, slotIndexFromNormalizedX } from "../utils/pitchHudLayout";

export { resolveSlotCount, slotIndexFromNormalizedX };

/** 入力面要素の矩形。位置（左上）と大きさを持つ。 */
export interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** ポインタ由来の入力源の種別。 */
export type PointerInputSource = "touch" | "mouse" | "pen";

/**
 * 0以上1以下へ切り詰める。非有限のときは予備値を返す。
 * 全ての正規化値を有限の0以上1以下へそろえる共通の土台とするための関数である。
 */
export function clamp01(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

/**
 * 画面座標を入力面要素の矩形を基準に0以上1以下へ正規化する。
 * 左上を原点、右方向と下方向を正とする。画素密度倍率は適用しない。
 * 寸法が0以下、または入力が非有限のときは中央 (0.5, 0.5) へ丸める。
 * 理由: 寸法が未確定の瞬間に座標を画面端へ偏らせないため中央へ丸める。
 */
export function normalizePointerPosition(
  clientX: number,
  clientY: number,
  rect: RectLike
): { x: number; y: number } {
  const { left, top, width, height } = rect;
  const usable =
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0 &&
    Number.isFinite(clientX) &&
    Number.isFinite(clientY) &&
    Number.isFinite(left) &&
    Number.isFinite(top);
  if (!usable) {
    return { x: 0.5, y: 0.5 };
  }
  return {
    x: clamp01((clientX - left) / width, 0.5),
    y: clamp01((clientY - top) / height, 0.5),
  };
}

/**
 * ポインタの種別を入力源へ写す。空文字や未知の値は既定の指示装置であるマウスへ丸める。
 */
export function inputSourceFromPointerType(pointerType: string): PointerInputSource {
  if (pointerType === "touch") {
    return "touch";
  }
  if (pointerType === "pen") {
    return "pen";
  }
  return "mouse";
}

/**
 * 全入力源（ポインタとキーボード）が通る判定面写像関数。
 * 正規化Xからレーン番号（スロット）を取り、効果色をそのレーンから離散的に導く。これを単一の通り道にすることで入力同等性を保証する。
 * 効果色の式は slotCount が2以上のとき slotIndex ÷ (slotCount − 1)、1以下のとき 0 とする。
 * 採用理由を先に述べる。slotCount は1以上が許されるため、slotCount = 1 で分母が0になり非数になるのを防ぐ。色はスコアに寄与しない。
 */
export function mapToReactionCore(
  normalizedX: number,
  slotCount: number
): { slotIndex: number; colorX01: number } {
  const slotIndex = slotIndexFromNormalizedX(normalizedX, slotCount);
  const colorX01 = slotCount > 1 ? slotIndex / (slotCount - 1) : 0;
  return { slotIndex, colorX01 };
}
