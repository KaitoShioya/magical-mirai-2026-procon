// プレイ画面左側の縦7レーン（音程をX軸で選ぶレーン）の、横方向の配置を決める純粋関数群。
// 表示のレーンと入力のレーンを必ず一致させるため、帯の境界を正規化Xの定数として1か所で持ち、
// 入力（src/input/coordinateMapping.ts のタップ→スロット）と描画（src/rendering/fallingLane.ts のレーン位置）の
// 双方がこの定義から導出する。共有の数値計算を utils へ置く根拠は src/utils/README.md。three.js にも文書要素にも依存しない。
//
// 正規化Xは左上原点・右方向正・0以上1以下（入力層の座標規約）。2次元層の横位置は高さ基準で左端 −縦横比・右端 +縦横比。
// 両座標系を結ぶ写像は x = (正規化X − 0.5) × 2 × 縦横比（src/rendering/viewport.ts の overlayPointFromNormalized と同式）。

/** レーン帯の左端の正規化X。画面左端に置く。 */
export const LANE_BAND_LEFT_NORMALIZED_X = 0;

/** レーン帯の右端の正規化X。採用理由を先に述べる。主たる操作は横持ち両手（docs/research/04-ux-and-chart-design.md §4）で、
 * 横持ちの代表幅844画素で1レーンの幅は 0.42 × 844 ÷ 7 ＝ 約50.6画素となり、最小タップ目標48画素（src/config/tuning.ts の
 * MIN_TOUCH_TARGET_PX）を満たす。右側の3Dシーン・ミクを広く見せるためにも、左側の約4割に収める。★暫定。 */
export const LANE_BAND_RIGHT_NORMALIZED_X = 0.42;

/** 帯の幅（正規化X）。 */
function bandWidthNormalizedX(): number {
  return LANE_BAND_RIGHT_NORMALIZED_X - LANE_BAND_LEFT_NORMALIZED_X;
}

/** 1レーンの幅（正規化X）。帯の幅をスロット数で割る。 */
export function laneWidthNormalizedX(slotCount: number): number {
  return bandWidthNormalizedX() / slotCount;
}

/**
 * タップの正規化Xを音程スロット番号（0始まり）へ写す。番号0が最も左のレーン、増えるほど右のレーン。
 * `floor((normalizedX − 帯左端) ÷ レーンの正規化幅)`。0未満は0、slotCount−1超は slotCount−1 へ丸める。
 * 採用理由を先に述べる。帯の外側（右側の3Dシーン側など）のタップは最近接の端レーンへ寄せる。本作の「失敗のない床」
 * （画面のどこを叩いても有効な音が出る）方針に従い、余白を反応しない不感帯にしない。非有限値は最も左のレーン0へ丸める。
 */
export function slotIndexFromNormalizedX(normalizedX: number, slotCount: number): number {
  if (!Number.isFinite(normalizedX)) {
    return 0;
  }
  const index = Math.floor((normalizedX - LANE_BAND_LEFT_NORMALIZED_X) / laneWidthNormalizedX(slotCount));
  if (index < 0) {
    return 0;
  }
  if (index > slotCount - 1) {
    return slotCount - 1;
  }
  return index;
}

/**
 * 0始まりのスロット番号の、レーンの中心の正規化Xを返す。
 * 帯 [帯左端, 帯右端] を slotCount 等分した各レーンの中央であり、帯左端 + ((slot + 0.5) ÷ slotCount) × 帯の幅。
 * 往復の不変条件 slotIndexFromNormalizedX(laneCenterNormalizedX(i, n), n) === i が成り立つ。
 * キーボードの数字キーが指定スロットの中央を押下相当へ変換するために用いる。
 */
export function laneCenterNormalizedX(slot: number, slotCount: number): number {
  return LANE_BAND_LEFT_NORMALIZED_X + ((slot + 0.5) / slotCount) * bandWidthNormalizedX();
}

/**
 * レーンの境界の正規化Xを返す。境界番号 i（0以上 slotCount 以下）は 帯左端 + (i ÷ slotCount) × 帯の幅。
 * 境界番号0が帯の左端、slotCount が帯の右端、その間の i が内側の仕切り。
 */
export function laneBoundaryNormalizedX(boundaryIndex: number, slotCount: number): number {
  return LANE_BAND_LEFT_NORMALIZED_X + (boundaryIndex / slotCount) * bandWidthNormalizedX();
}

/** 正規化Xを2次元層の横位置へ写す（x = (正規化X − 0.5) × 2 × 縦横比）。 */
export function overlayXFromNormalizedX(normalizedX: number, aspect: number): number {
  return (normalizedX - 0.5) * 2 * aspect;
}

/**
 * 0始まりのスロット番号の、レーンの中心の2次元層の横位置を返す。ノーツ・着水・レーン背景の横位置に用いる。
 * 番号0が最も左、slotCount−1 が最も右。最も右のレーンの中心は帯の右端そのものではなく、右端から半レーン分内側にある。
 */
export function columnCenterX(slot: number, slotCount: number, aspect: number): number {
  return overlayXFromNormalizedX(laneCenterNormalizedX(slot, slotCount), aspect);
}

/** レーンの境界の2次元層の横位置を返す。仕切り線の描画に用いる。 */
export function laneBoundaryX(boundaryIndex: number, slotCount: number, aspect: number): number {
  return overlayXFromNormalizedX(laneBoundaryNormalizedX(boundaryIndex, slotCount), aspect);
}
