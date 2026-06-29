// シャッターチャンスのタイポ・コンポジション譜面データ（Issue #88 横展開）。
//
// 曲固有の演出割付の上書きと読ませる役の配置を持つ値。型は共有の型置き場 src/types/typography.ts に定義し、
// ここはその型の値（曲固有の内容）だけを持つ。依存規則: profiles は中核（typography 等）を import しない。
// ここで取り込むのは src/types のデータ型のみである。TAKEOVER の typographyChart.ts と同じ構造に倣う。
//
// 最小成立の方針: 既定の表示領域・想定表示寸法を採用し、曲固有の上書きと配置は空とする。読ませる役の値は
// 中心のミク（画面中央に常在）と重ならないよう中心より下の帯に置く。これらは曲非依存の既定値であり、TAKEOVER と
// 同じ根拠（中央のミクを避ける縦位置、左右余白を残す幅、1行に十分な高さ、可読な見出し相当の寸法）で同値を採る。
// 曲固有の見せ場上書き（演出文法を伴う）は今後の磨きで加える器とする。

import type { TypographyChart, TypographyDisplayRegion } from "../../types/typography";

// 既定の読ませる役の表示領域（採用理由は TAKEOVER と同じ）。中心の縦位置の割合 0.72 は画面の下から約4分の1の高さで、
// 中央のミクを避けつつ画面外の切り欠きに掛からない。幅の割合 0.86 は左右に余白を残す。高さの割合 0.16 は1行に十分。
// いずれも実機調整で確定する暫定値。
export const SHUTTER_CHANCE_DEFAULT_READING_REGION: TypographyDisplayRegion = {
  centerXRatio: 0.5,
  centerYRatio: 0.72,
  widthRatio: 0.86,
  heightRatio: 0.16,
};

// 既定の想定表示寸法（デバイス画素、採用理由は TAKEOVER と同じ）。48デバイス画素は最小表示寸法18の約2.7倍で、
// 歌詞の見出し相当のはっきり読める大きさであり、表示領域（既定の高さ割合0.16）にも収まる。実機調整で確定する暫定値。
export const SHUTTER_CHANCE_DEFAULT_READING_PIXEL_HEIGHT = 48;

/**
 * シャッターチャンスのタイポ譜面。当面は既定採用に任せ、曲固有の上書きと配置は空とする。
 * 既定で賄えない見せ場の上書きは今後の磨きで加える。
 */
export const shutterChanceTypographyChart: TypographyChart = {
  effectOverrides: [],
  readingPlacements: [],
};
