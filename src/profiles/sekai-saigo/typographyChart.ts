// 世界最後の音楽隊のタイポ・コンポジション譜面データ（横展開。TAKEOVER の typographyChart.ts と同形）。
//
// 曲固有の演出割付の上書きと読ませる役の配置を持つ値。型は共有の型置き場 src/types/typography.ts に定義し、
// ここはその型の値（曲固有の内容）だけを持つ。依存規則: profiles は中核（typography 等）を import しない。
// ここで取り込むのは src/types のデータ型のみである。
//
// 最小成立の方針: 演出の曲固有上書きと読ませる役の配置は与えず、既定に任せる。配置指定の無いフレーズは既定の
// 表示領域・想定表示寸法を用い、表示領域に収まらない長フレーズは駆動部の読ませる役レイアウトが実行時に単語・チャンクへ
// 自動分割して収める。曲固有の演出上書きが必要になれば後から加える。

import type { TypographyChart, TypographyDisplayRegion } from "../../types/typography";

// 既定の読ませる役の表示領域。採用理由は TAKEOVER と同じ（中心のミクを避けて中央より下の帯に置き、左右に余白を残す）。
// 中心の縦位置の割合 0.72 は画面の下から約4分の1の高さ、幅の割合 0.86 は左右に余白、高さの割合 0.16 は1行に十分。
// いずれも実機調整で確定する暫定値。TAKEOVER と共通の世界観のため同値を用いる。
export const SEKAI_SAIGO_DEFAULT_READING_REGION: TypographyDisplayRegion = {
  centerXRatio: 0.5,
  centerYRatio: 0.72,
  widthRatio: 0.86,
  heightRatio: 0.16,
};

// 既定の想定表示寸法（デバイス画素）。採用理由は TAKEOVER と同じ（最小表示寸法18デバイス画素に対し、歌詞の見出し相当の
// はっきり読める大きさとして48デバイス画素を採り、既定の表示領域に収める）。実機調整で確定する暫定値。
export const SEKAI_SAIGO_DEFAULT_READING_PIXEL_HEIGHT = 48;

/**
 * 世界最後の音楽隊のタイポ譜面。当面は既定採用に任せ、曲固有の上書きと配置は空とする。
 */
export const sekaiSaigoTypographyChart: TypographyChart = {
  effectOverrides: [],
  readingPlacements: [],
};
