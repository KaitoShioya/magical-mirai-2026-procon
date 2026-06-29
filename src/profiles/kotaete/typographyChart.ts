// 「こたえて」のタイポ・コンポジション譜面データ（横展開）。
//
// 曲固有の演出割付の上書きと読ませる役の配置を持つ値。型は共有の型置き場 src/types/typography.ts に定義し、
// ここはその型の値（曲固有の内容）だけを持つ。依存規則: profiles は中核（typography 等）を import しない。
// ここで取り込むのは src/types のデータ型のみである。
//
// 最小成立の方針: TAKEOVER と同じく、当面は既定採用に任せ、曲固有の上書きと配置は空とする。読ませる役の既定の表示領域・
// 想定表示寸法も TAKEOVER と同じ値を出発点とし（世界観の中心に常在するミクを避ける下方の帯）、こたえての歌詞長で
// 読みにくければ実機検証で調整する。曲固有の見せ場の上書きは実機検証後に加える。

import type { TypographyChart, TypographyDisplayRegion } from "../../types/typography";

// 既定の読ませる役の表示領域。採用理由は TAKEOVER と同じ（中心のミクを避け中心より下の帯へ置く）。
// 中心の縦位置の割合 0.72 は画面の下から約4分の1の高さで、中央のミクを避けつつ画面外の切り欠きに掛からない位置である。
// 幅の割合 0.86 は左右に余白を残す。高さの割合 0.16 は1行の読ませる役に十分である。いずれも実機調整で確定する暫定値。
export const KOTAETE_DEFAULT_READING_REGION: TypographyDisplayRegion = {
  centerXRatio: 0.5,
  centerYRatio: 0.72,
  widthRatio: 0.86,
  heightRatio: 0.16,
};

// 既定の想定表示寸法（デバイス画素）。TAKEOVER と同じ48デバイス画素を出発点とする（最小18の約2.7倍で、歌詞の見出し相当の
// はっきり読める大きさ。表示領域の高さ割合0.16にも収まる）。実機調整で確定する暫定値。
export const KOTAETE_DEFAULT_READING_PIXEL_HEIGHT = 48;

/**
 * 「こたえて」のタイポ譜面。当面は既定採用に任せ、曲固有の上書きと配置は空とする。
 * 既定で賄えない見せ場の上書きは実機検証後に加える。
 */
export const kotaeteTypographyChart: TypographyChart = {
  effectOverrides: [],
  readingPlacements: [],
};
