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
  source: "Google Fonts（https://fonts.google.com/specimen/Zen+Kaku+Gothic+New）",
  license: "SIL Open Font License 1.1",
  licenseFileUrl: "/fonts/zen-kaku-gothic-new-OFL.txt",
};
