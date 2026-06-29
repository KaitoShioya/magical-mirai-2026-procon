// 部首分解・縦横ブラインドの矩形切り抜きの純粋計算。
// 設計根拠: docs/decisions/visual-expression-design.md §5.3（部首分解は同じ文字を相補的な矩形で切り抜き、左右
// または上下に割れて動くように見せる近似）・§5.5（縦横ブラインドは矩形の切り抜きの時間変化）。
// 切り抜き矩形は文字のローカル座標系の境界 [minX, minY, maxX, maxY] に対する部分矩形で表す（troika の clipRect
// と同じ並び）。本モジュールは矩形の計算だけを担い、取っ手への反映は適用層・エンジンが行う（依存規則§5、純粋関数）。

/** 切り抜き矩形（ローカル座標。最小が最大以下）。 */
export interface ClipRect {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** 切り抜きの軸。"x"＝左右に割る（縦の境界線）、"y"＝上下に割る（横の境界線）。 */
export type ClipAxis = "x" | "y";

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * 文字の境界を、指定軸の分割位置（割合 fraction、0以上1以下）で相補的な2つの矩形へ分ける。
 * 戻り値の2矩形は重なりなく境界を覆う（部首分解の左右・上下の2片に使う）。
 * fraction は分割線の位置で、軸方向の最小から最大までの割合。0や1では片方が退化（面積0）するため、
 * 呼び出し側は分割線を内側（0と1の間）に置く。
 */
export function computeSplitRects(bounds: ClipRect, axis: ClipAxis, fraction: number): [ClipRect, ClipRect] {
  const f = clamp01(fraction);
  if (axis === "x") {
    const splitX = bounds.minX + (bounds.maxX - bounds.minX) * f;
    const left: ClipRect = { minX: bounds.minX, minY: bounds.minY, maxX: splitX, maxY: bounds.maxY };
    const right: ClipRect = { minX: splitX, minY: bounds.minY, maxX: bounds.maxX, maxY: bounds.maxY };
    return [left, right];
  }
  const splitY = bounds.minY + (bounds.maxY - bounds.minY) * f;
  const bottom: ClipRect = { minX: bounds.minX, minY: bounds.minY, maxX: bounds.maxX, maxY: splitY };
  const top: ClipRect = { minX: bounds.minX, minY: splitY, maxX: bounds.maxX, maxY: bounds.maxY };
  return [bottom, top];
}

/**
 * 文字の境界を、指定軸へ等幅の N 本の縞（ブラインド）へ分ける。slices は1以上の整数。
 * 戻り値の N 矩形は重なりなく境界を覆う（縦横ブラインドの各帯に使う）。
 */
export function computeBlindRects(bounds: ClipRect, axis: ClipAxis, slices: number): ClipRect[] {
  const count = Math.max(1, Math.floor(slices));
  const rects: ClipRect[] = [];
  if (axis === "x") {
    const width = (bounds.maxX - bounds.minX) / count;
    for (let i = 0; i < count; i += 1) {
      const minX = bounds.minX + width * i;
      rects.push({ minX, minY: bounds.minY, maxX: minX + width, maxY: bounds.maxY });
    }
    return rects;
  }
  const height = (bounds.maxY - bounds.minY) / count;
  for (let i = 0; i < count; i += 1) {
    const minY = bounds.minY + height * i;
    rects.push({ minX: bounds.minX, minY, maxX: bounds.maxX, maxY: minY + height });
  }
  return rects;
}
