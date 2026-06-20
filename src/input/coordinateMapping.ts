// 入力の純粋関数群。画面座標の正規化、音程スロット番号への写像、色パラメータへの写像、入力源の判定、
// および全入力源（ポインタとキーボード）が通る判定面写像関数を提供する。
// 副作用を持たず、非有限値（非数・無限大）に対する丸めを定義する。
// 依存規則（docs/decisions/architecture.md §5）に従い、profiles・tools・rendering・three.js を import しない。
// 設計の出典: docs/decisions/app-overall-decisions.md §3.3、docs/idea/concept-final.md §4。

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
 * 正規化Yを音程スロット番号へ写す。番号0が画面最上部の帯、増えるほど画面下側の帯になる。
 * 番号 i の帯は正規化Yの区間 [i / slotCount, (i + 1) / slotCount) を占める半開区間とする。
 * すなわち小さい方の正規化Y（画面で上側の境界）を含み、大きい方（画面で下側の境界）を含まない。
 * よって2つの帯が共有する境界の座標は、番号が大きい方の帯（画面で下側の帯）に属する。
 * 非有限値は帯0（最上部）へ丸める。
 */
export function slotIndexFromNormalizedY(normalizedY: number, slotCount: number): number {
  if (!Number.isFinite(normalizedY)) {
    return 0;
  }
  const index = Math.floor(normalizedY * slotCount);
  if (index < 0) {
    return 0;
  }
  if (index > slotCount - 1) {
    return slotCount - 1;
  }
  return index;
}

/**
 * スロット番号の帯の中央にあたる正規化Yを返す。
 * キーボードが指定スロットの中央を押下相当へ変換するために用いる。
 * slotIndexFromNormalizedY(slotCenterNormalizedY(i, n), n) === i が常に成り立つ。
 */
export function slotCenterNormalizedY(slotIndex: number, slotCount: number): number {
  return (slotIndex + 0.5) / slotCount;
}

/**
 * 正規化Xを色パラメータ（0以上1以下）へ線形に写す（恒等写像）。
 * 色の実体（色相・彩度）は rendering が解釈するため、ここでは位置を色パラメータへそろえるに留める。
 * 非有限値は中央0.5へ丸める。
 */
export function colorParamFromNormalizedX(normalizedX: number): number {
  return clamp01(normalizedX, 0.5);
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
 * スロット総数の設定値を検証して確定する。正の有限整数のときはその値、それ以外は予備値を返す。
 * スロット番号は0以上 slotCount-1 以下の整数であり、帯を成立させるには1以上の整数が必要なため、
 * 1未満・非整数・非有限の値は予備値へ丸める。入力は「失敗のない床」の方針のため、不正な設定でも継続する。
 */
export function resolveSlotCount(requested: number | undefined, fallback: number): number {
  if (requested === undefined) {
    return fallback;
  }
  if (Number.isInteger(requested) && requested >= 1) {
    return requested;
  }
  return fallback;
}

/**
 * 全入力源（ポインタとキーボード）が通る判定面写像関数。
 * 正規化座標からスロット番号と色パラメータを返す。これを単一の通り道にすることで入力同等性を保証する。
 */
export function mapToReactionCore(
  normalizedX: number,
  normalizedY: number,
  slotCount: number
): { slotIndex: number; colorX01: number } {
  return {
    slotIndex: slotIndexFromNormalizedY(normalizedY, slotCount),
    colorX01: colorParamFromNormalizedX(normalizedX),
  };
}
