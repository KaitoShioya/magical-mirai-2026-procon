// 舞台土台モデル（Issue #105）の水面領域の算出。水面マーカーの軸平行の境界箱から、反射水面の平面を作る
// ための水面領域（幅・奥行き・中心・高さ）を求める純粋関数。three.js を import しないため node 環境で単体検証できる。

import type { WaterRegion } from "../../types/stage";

/** 水面マーカーの高さの差として許す上限。採用理由を先に述べる。マーカーは水平な矩形のため境界箱の高さの差は
 *  0に近いが、浮動小数点の丸めが乗りうるため、これ未満なら水平とみなす微小な許容値を置く。 */
export const WATER_HEIGHT_EPSILON = 1e-3;

/** 軸平行の境界箱の最小最大（世界座標）。 */
export interface BoundsMinMax {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/**
 * 水面マーカーの境界箱から水面領域を求める。
 * 高さは境界箱の中心の高さを用いる。採用理由を先に述べる。マーカーは水平な矩形で高さの差は0に近いが、
 * 浮動小数点の丸めが乗りうるため、最小値や最大値でなく中心の高さを採る。
 * 高さの差が許容値（epsilon）を超えるとき、マーカーが水平でないため例外を投げる。
 * @param bounds 水面マーカーの軸平行の境界箱（世界座標の最小最大）
 * @param epsilon 水平とみなす高さの差の上限
 * @param markerName 失敗時の説明に使う水面マーカーの名前
 */
export function waterRegionFromBounds(
  bounds: BoundsMinMax,
  epsilon: number,
  markerName: string
): WaterRegion {
  const heightSpan = bounds.maxY - bounds.minY;
  if (heightSpan > epsilon) {
    throw new Error(
      `水面マーカー ${markerName} が水平ではありません（高さの差 ${heightSpan.toFixed(4)}）。`
    );
  }
  return {
    width: bounds.maxX - bounds.minX,
    depth: bounds.maxZ - bounds.minZ,
    centerX: (bounds.minX + bounds.maxX) / 2,
    centerZ: (bounds.minZ + bounds.maxZ) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };
}
