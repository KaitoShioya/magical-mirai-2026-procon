// アフター・ザ・カーテンのタイポ・コンポジション譜面データ（Issue #33 と同じ枠組み）。
//
// 曲固有の演出割付の上書きと読ませる役の配置を持つ値。型は共有の型置き場 src/types/typography.ts に定義し、
// ここはその型の値（曲固有の内容）だけを持つ。依存規則: profiles は中核（typography 等）を import しない。
// ここで取り込むのは src/types のデータ型のみである。構成は TAKEOVER の typographyChart.ts と同一である。
//
// 最小成立の方針: 既定の表示領域・想定表示寸法を用い、曲固有の演出上書きと読ませる役の配置は持たない。
// 表示領域に収まらない長フレーズは駆動部の読ませる役レイアウトが実行時に単語・チャンクへ自動分割して収める。

import type { TypographyChart, TypographyDisplayRegion } from "../../types/typography";

// 既定の読ませる役の表示領域（採用理由を先に述べる）。中心のミクは湖の中心（画面中央）に常在するため、
// 読ませる役を画面中央へ置くとミクと重なる。よって中心より下の帯に置く。中心の縦位置の割合 0.72 は画面の
// 下から約4分の1の高さで、中央のミクを避けつつ画面外の切り欠きに掛からない位置である。幅の割合 0.86 は
// 左右に余白を残し、安全余白（読ませる役レイアウトの5パーセント）と合わせて縁に文字が接しないようにする。
// 高さの割合 0.16 は1行の読ませる役に十分で、上下の他要素と干渉しない。舞台と中心のミクは曲非依存で TAKEOVER と
// 同一のため、同じ値を用いる。いずれも実機調整で確定する暫定値。
export const AFTER_THE_CURTAIN_DEFAULT_READING_REGION: TypographyDisplayRegion = {
  centerXRatio: 0.5,
  centerYRatio: 0.72,
  widthRatio: 0.86,
  heightRatio: 0.16,
};

// 既定の想定表示寸法（デバイス画素、採用理由を先に述べる）。可読性処理の最小表示寸法の既定は18デバイス画素だが、
// 目視確認で24デバイス画素は小さく読みにくかった。48デバイス画素は最小の約2.7倍で、歌詞の見出し相当の
// はっきり読める大きさであり、表示領域（既定の高さ割合0.16）にも収まる。TAKEOVER と同じ舞台・同じ可読性処理のため
// 同じ値を用いる。実機調整で確定する暫定値。
export const AFTER_THE_CURTAIN_DEFAULT_READING_PIXEL_HEIGHT = 48;

/**
 * アフター・ザ・カーテンのタイポ譜面。既定採用に任せ、曲固有の上書きと配置は空とする。
 */
export const afterTheCurtainTypographyChart: TypographyChart = {
  effectOverrides: [],
  readingPlacements: [],
};
