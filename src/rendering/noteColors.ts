// 音程レーン（X軸の7レーン）の固有色の配色。各レーン（音程スロット）に1色ずつ割り当て、落下ノーツの色・着水
// エフェクトの色・レーン背景の薄い色味に用いる。色はスコアに寄与しない（docs/idea/concept-final.md §4・§6）。
// 配色実体を rendering に置く根拠を先に述べる。色の実体を消費するのは描画だけで、入力は数値（colorX01）しか持たない
// （依存規則 docs/decisions/architecture.md §5）。深夜の暗い背景の上で隣り合うレーンを見分けやすくするため、色相を狭く
// 寄せず広く取る。具体的には、青紫系に偏らないよう色相環をほぼ一周ぶん渡る7色（シアン→緑→黄→橙→赤→洋紅→菫）を、
// いずれも明るいネオンとして選ぶ。各成分は0以上1以下の線形値。具体値は実機目視で確定する★暫定。

/** レーンごとの固有色（各チャンネル0..1）。配列の添字が音程スロット番号（0始まり、0が最も左のレーン）。 */
export const LANE_COLORS: ReadonlyArray<readonly [number, number, number]> = [
  [0.0, 0.85, 1.0], // 1: シアン
  [0.1, 1.0, 0.45], // 2: 緑
  [0.95, 0.95, 0.15], // 3: 黄
  [1.0, 0.55, 0.1], // 4: 橙
  [1.0, 0.2, 0.3], // 5: 赤
  [1.0, 0.2, 0.85], // 6: 洋紅（マゼンタ）
  [0.55, 0.35, 1.0], // 7: 菫（バイオレット）
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
