// 音程スロットの縦方向の規約を定める純粋関数群（数値計算のみ）。
// 画面の縦方向（Y軸）の一部の帯を音程スロットへ等分する際の、境界の正規化Y・スロット中央の正規化Y・
// 正規化Yからスロット番号への写像・表示番号への写像を、単一の定義として提供する。
// 入力（src/input/coordinateMapping.ts）と描画（src/rendering の音程ガイド）の双方がこの定義を共有する。
// 共有の純粋関数を utils へ置く根拠は src/utils/README.md（描画と判定が共有する数値計算の置き場）。
// 文書要素にも three.js にも依存せず、他モジュールを取り込まない（循環依存を作らない）。
// 正規化Yは左上原点・下方向正・0以上1以下とする（入力層の座標規約に合わせる）。

// 採用理由を先に述べる。音程スロットを画面の縦幅全体に広げると、最下段の番号が画面下端の出典表記に重なり、
// かつ上端から落下するノーツを見て合わせる余地が無い。そこで音程スロットの帯を画面縦幅の一部に圧縮し、
// 上下に等しい余白を置いて中央へ寄せる。割合は4分の3（=0.75）とし、上端余白は (1 - 0.75) / 2 = 0.125 とする。
// この2つの値はここを単一の所有者とし、入力と描画の双方がこの定義を共有して一致させる。

/** 音程スロットの帯が画面の縦幅全体に占める割合。 */
export const PITCH_AXIS_HEIGHT_FRACTION = 0.75;

/** 音程スロットの帯の上端の正規化Y。中央寄せのため上下の余白を等分する。 */
export const PITCH_AXIS_TOP_MARGIN = (1 - PITCH_AXIS_HEIGHT_FRACTION) / 2;

/**
 * スロットの境界にあたる正規化Yを返す。
 * 境界番号 i（0以上 slotCount 以下）の境界は、帯 [上端余白, 上端余白 + 帯割合] を slotCount 等分した位置に置く。
 * すなわち 上端余白 + (i / slotCount) × 帯割合。境界番号0が帯の上端、境界番号 slotCount が帯の下端に対応する。
 */
export function slotBoundaryNormalizedY(boundaryIndex: number, slotCount: number): number {
  return PITCH_AXIS_TOP_MARGIN + (boundaryIndex / slotCount) * PITCH_AXIS_HEIGHT_FRACTION;
}

/**
 * スロット番号の帯の中央にあたる正規化Yを返す。
 * キーボードが指定スロットの中央を押下相当へ変換するため、および音程ガイドが番号を帯の中央へ置くために用いる。
 * 帯 [上端余白, 上端余白 + 帯割合] を slotCount 等分した各区画の中央であり、上端余白 + ((i + 0.5) / slotCount) × 帯割合。
 * slotIndexFromNormalizedY(slotCenterNormalizedY(i, n), n) === i が常に成り立つ。
 */
export function slotCenterNormalizedY(slotIndex: number, slotCount: number): number {
  return PITCH_AXIS_TOP_MARGIN + ((slotIndex + 0.5) / slotCount) * PITCH_AXIS_HEIGHT_FRACTION;
}

/**
 * 正規化Yを音程スロット番号へ写す。番号0が帯の最上部の区画、増えるほど画面下側の区画になる。
 * まず帯の局所座標 local = (normalizedY − 上端余白) / 帯割合 へ写し、その後 floor(local × slotCount) を取る。
 * 番号 i の区画は局所座標の区間 [i / slotCount, (i + 1) / slotCount) を占める半開区間とする。
 * すなわち小さい方（画面で上側の境界）を含み、大きい方（画面で下側の境界）を含まない。
 * 帯の外側（上の余白は局所座標が負、下の余白は1超）は、それぞれ最上段（0）・最下段（slotCount−1）へ寄せる。
 * 採用理由を先に述べる。本作は「失敗のない床（画面のどこを叩いても有効な音が出る）」の方針のため、余白を反応しない不感帯にしない。
 * 非有限値は帯0（最上部）へ丸める。
 */
export function slotIndexFromNormalizedY(normalizedY: number, slotCount: number): number {
  if (!Number.isFinite(normalizedY)) {
    return 0;
  }
  const local = (normalizedY - PITCH_AXIS_TOP_MARGIN) / PITCH_AXIS_HEIGHT_FRACTION;
  const index = Math.floor(local * slotCount);
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
