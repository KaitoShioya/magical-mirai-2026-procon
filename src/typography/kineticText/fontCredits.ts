// 採用フォントの出典情報。素材の出典はアプリ内の常設区画とREADMEの両方に記す方針
// （docs/research/05-asset-procurement.md §5）であり、本Issueでこのデータを用意する。
// アプリ内の常設クレジット区画への表示の結線は、フォントを本編で使う担当Issue（#33・#59、表示はM5）で行う。

import type { FontCredit } from "./types";

/**
 * 主フォントの出典。Zen Kaku Gothic New は SIL Open Font License 1.1 で配布され、
 * 商用利用・改変・Web埋め込みが認められる（docs/research/05-asset-procurement.md §2）。
 */
export const ZEN_KAKU_GOTHIC_NEW_CREDIT: FontCredit = {
  fontName: "Zen Kaku Gothic New",
  author: "Yoshimichi Ohira / Zenfonts",
  sourceLabel: "Google Fonts",
  sourceUrl: "https://fonts.google.com/specimen/Zen+Kaku+Gothic+New",
  license: "SIL Open Font License 1.1",
  licenseFileUrl: "/fonts/zen-kaku-gothic-new-OFL.txt",
};

/**
 * 見出し用フォントの出典。M PLUS 1 は SIL Open Font License 1.1 で配布され、
 * 商用利用・改変（サブセット化）・Web埋め込み・再配布が認められる（単体販売のみ不可）。
 * 配布元は Google Fonts に揃える（Zen Kaku Gothic New と同じ配布元にして出典の記載と入手経路を一致させる）。
 */
export const MPLUS_1_CREDIT: FontCredit = {
  fontName: "M PLUS 1",
  author: "Coji Morishita / M+ FONTS Project",
  sourceLabel: "Google Fonts",
  sourceUrl: "https://fonts.google.com/specimen/M+PLUS+1",
  license: "SIL Open Font License 1.1",
  licenseFileUrl: "/fonts/m-plus-1-OFL.txt",
};
