// 距離場の事前生成（暖め）。読み込み時にサブセットの全グリフの符号付き距離場を生成し、
// 初回出現時の生成停止（フレーム落ちと初回表示遅延）を防ぐ。

import { preloadFont } from "troika-three-text";

/**
 * 指定フォントの指定文字の距離場を事前生成する。完了時に解決する Promise を返す。
 * fontUrl は troika 対応形式（.woff など）のURL。null のとき troika の既定フォントを暖める。
 */
export function warmUpFont(
  fontUrl: string | null,
  characters: string,
  sdfGlyphSize?: number
): Promise<void> {
  return new Promise<void>((resolve) => {
    preloadFont({ font: fontUrl, characters, sdfGlyphSize }, () => resolve());
  });
}
