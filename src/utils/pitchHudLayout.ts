// プレイ画面左側の縦7レーン（音程をX軸で選ぶレーン）の、横方向の配置を決める純粋関数群。
// 表示のレーンと入力のレーンを必ず一致させるため、帯の境界を正規化Xの定数として1か所で持ち、
// 入力（src/input/coordinateMapping.ts のタップ→スロット）と描画（src/rendering/fallingLane.ts のレーン位置）の
// 双方がこの定義から導出する。共有の数値計算を utils へ置く根拠は src/utils/README.md。three.js にも文書要素にも依存しない。
//
// 正規化Xは左上原点・右方向正・0以上1以下（入力層の座標規約）。2次元層の横位置は高さ基準で左端 −縦横比・右端 +縦横比。
// 両座標系を結ぶ写像は x = (正規化X − 0.5) × 2 × 縦横比（src/rendering/viewport.ts の overlayPointFromNormalized と同式）。

/** レーン帯の左端の正規化X。採用理由を先に述べる。画面左端そのもの（0）に置くと、最も左のレーンの仕切り線が画面端に
 * 重なって見えず、左端のレーンの境界が分からない。少し内側（0.02、横持ちの代表幅844画素で約17画素）へ寄せて、左端の
 * 仕切り線も画面内に見えるようにする。★暫定。 */
export const LANE_BAND_LEFT_NORMALIZED_X = 0.02;

/** レーン帯の右端の正規化X。採用理由を先に述べる。主たる操作は横持ち両手（docs/research/04-ux-and-chart-design.md §4）で、
 * 帯の幅（右端 − 左端 ＝ 0.42）を横持ちの代表幅844画素に掛けて7レーンで割ると、1レーンの幅は 0.42 × 844 ÷ 7 ＝ 約50.6画素となり、
 * 最小タップ目標48画素（src/config/tuning.ts の MIN_TOUCH_TARGET_PX）を満たす。左端を内側へ寄せた分だけ右端も右へずらして帯の幅を
 * 保つ。右側の3Dシーン・ミクを広く見せるためにも、左側の約4割に収める。★暫定。 */
export const LANE_BAND_RIGHT_NORMALIZED_X = 0.44;

/** 帯の幅（正規化X）。 */
function bandWidthNormalizedX(): number {
  return LANE_BAND_RIGHT_NORMALIZED_X - LANE_BAND_LEFT_NORMALIZED_X;
}

/** 1レーンの幅（正規化X）。帯の幅をスロット数で割る。 */
export function laneWidthNormalizedX(slotCount: number): number {
  return bandWidthNormalizedX() / slotCount;
}

/**
 * スロット総数の設定値を検証して確定する。正の有限整数のときはその値、それ以外は予備値を返す。
 * スロット番号は0以上 slotCount-1 以下の整数であり、レーンを成立させるには1以上の整数が必要なため、
 * 1未満・非整数・非有限の値は予備値へ丸める。本作の「失敗のない床」の方針のため、不正な設定でも継続する。
 * レーン幅はここで帯の幅を slotCount で割るため、0や非整数の slotCount を素通しすると幅が無限大や非整数の刻みになる。
 * その混入を入力（src/input）と描画（src/rendering/fallingLane.ts）の双方が同じ正典で防げるよう、検証をレーン幾何の所有者であるこのモジュールへ置く。
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
