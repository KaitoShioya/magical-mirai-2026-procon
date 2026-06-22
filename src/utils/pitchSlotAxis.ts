// 音程スロットの縦方向の規約を定める純粋関数群（数値計算のみ）。
// 画面の縦方向（Y軸）を音程スロットへ等分する際の、境界の正規化Y・スロット中央の正規化Y・
// 正規化Yからスロット番号への写像・表示番号への写像を、単一の定義として提供する。
// 入力（src/input/coordinateMapping.ts）と描画（src/rendering の音程ガイド）の双方がこの定義を共有する。
// 共有の純粋関数を utils へ置く根拠は src/utils/README.md（描画と判定が共有する数値計算の置き場）。
// 文書要素にも three.js にも依存せず、他モジュールを取り込まない（循環依存を作らない）。
// 正規化Yは左上原点・下方向正・0以上1以下とする（入力層の座標規約に合わせる）。

/**
 * スロットの境界にあたる正規化Yを返す。
 * 境界番号 i（0以上 slotCount 以下）の境界は正規化Y = i / slotCount に置く。
 * 境界番号0が画面最上部（正規化Y=0）、境界番号 slotCount が画面最下部（正規化Y=1）に対応する。
 */
export function slotBoundaryNormalizedY(boundaryIndex: number, slotCount: number): number {
  return boundaryIndex / slotCount;
}

/**
 * スロット番号の帯の中央にあたる正規化Yを返す。
 * キーボードが指定スロットの中央を押下相当へ変換するため、および音程ガイドが番号を帯の中央へ置くために用いる。
 * slotIndexFromNormalizedY(slotCenterNormalizedY(i, n), n) === i が常に成り立つ。
 */
export function slotCenterNormalizedY(slotIndex: number, slotCount: number): number {
  return (slotIndex + 0.5) / slotCount;
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
 * スロット番号（0始まり）を画面に表示する番号（1始まり）へ写す。
 * 1始まりにする根拠は、画面で最上部の帯を1とし最下部の帯を slotCount とする表示規約で、
 * キーボードの数字キーの並び（1から始まる）とも一致させるためである。
 */
export function slotDisplayNumber(slotIndex: number): number {
  return slotIndex + 1;
}
