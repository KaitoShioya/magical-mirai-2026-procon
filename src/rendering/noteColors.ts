// 音程レーン（X軸の7レーン）の固有色の配色。各レーン（音程スロット）に1色ずつ割り当て、落下ノーツの色・着水
// エフェクトの色・レーン背景の薄い色味に用いる。色はスコアに寄与しない（docs/idea/concept-final.md §4・§6）。
// 配色実体を rendering に置く根拠を先に述べる。色の実体を消費するのは描画だけで、入力は数値（colorX01）しか持たない
// （依存規則 docs/decisions/architecture.md §5）。深夜の暗い背景の上で見分けやすいネオン系の色相を等間隔で並べる。
// 各成分は0以上1以下の線形値。具体値は実機目視で確定する★暫定。

/** レーンごとの固有色（各チャンネル0..1）。配列の添字が音程スロット番号（0始まり、0が最も左のレーン）。 */
export const LANE_COLORS: ReadonlyArray<readonly [number, number, number]> = [
  [0.16, 0.78, 1.0], // 1: シアン
  [0.27, 0.55, 1.0], // 2: 青
  [0.55, 0.45, 1.0], // 3: 青紫
  [0.82, 0.42, 1.0], // 4: 紫
  [1.0, 0.4, 0.85], // 5: 桃紫
  [1.0, 0.45, 0.55], // 6: 珊瑚
  [1.0, 0.66, 0.3], // 7: 橙
];

/** 音程スロット番号（0始まり）に対応するレーンの固有色を返す。範囲外は端の色へ丸める（失敗のない床に合わせる）。 */
export function laneColor(slotIndex0: number): readonly [number, number, number] {
  if (!Number.isInteger(slotIndex0) || slotIndex0 < 0) {
    return LANE_COLORS[0];
  }
  if (slotIndex0 > LANE_COLORS.length - 1) {
    return LANE_COLORS[LANE_COLORS.length - 1];
  }
  return LANE_COLORS[slotIndex0];
}
