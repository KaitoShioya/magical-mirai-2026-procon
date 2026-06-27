// ランク専用ゲージ（Issue #65）のランク文字図版。文字 C・B・A・S を canvas の2次元描画で1枚のテクスチャへ
// 描き、各セルのテクスチャ座標を提供する。プログラミングによる動的描画であり、表示物にAI生成アセットを使わない
// 規約（CLAUDE.md）に適合する。埋め込み画像は使わず、字形は端末標準のサンセリフ書体を canvas で描く。

import { CanvasTexture, LinearFilter, SRGBColorSpace, type Texture } from "three";

/**
 * 図版が持つランク文字（ランクの昇順）。並びはランク判定の唯一所有元 src/scoring/rank.ts の RANKS_ASCENDING と
 * 一致させる（rankGaugeLetters.test.ts が一致を検証してドリフトを防ぐ）。ゲージはこの並びの添字 rankIndex
 * （0=C, 1=B, 2=A, 3=S）でセルを選ぶ。
 */
export const RANK_GAUGE_LETTERS = ["C", "B", "A", "S"] as const;

/** 図版が持つセル数（ランク文字の数）。 */
export const RANK_LETTER_ATLAS_CELL_COUNT = RANK_GAUGE_LETTERS.length;

/** 1セルのデバイス画素四方。表示の大きさより十分大きくして、縮小描画で字形がにじまないようにする（★暫定）。 */
export const RANK_LETTER_ATLAS_CELL_PIXELS = 128;

/** セルのテクスチャ座標の矩形（u0,v0 が左下、u1,v1 が右上）。 */
export interface RankLetterCellUv {
  readonly u0: number;
  readonly v0: number;
  readonly u1: number;
  readonly v1: number;
}

/** ランク文字図版。テクスチャとセル座標の取得、後始末を提供する。 */
export interface RankLetterAtlas {
  /** 全ランク文字を横一列に並べたテクスチャ。 */
  readonly texture: Texture;
  /** セル数（RANK_LETTER_ATLAS_CELL_COUNT と同じ）。 */
  readonly cellCount: number;
  /** セル添字（0以上 cellCount 未満）のテクスチャ座標の矩形を返す。 */
  cellUv(cellIndex: number): RankLetterCellUv;
  /** 後始末。生成したテクスチャを解放する。冪等。 */
  dispose(): void;
}

/**
 * ランク文字図版を生成する。
 * 透明な背景に、白の塗りと暗い縁取りで文字を描く。透明背景に白塗りと暗い縁取りで描くことで、明暗どちらの背景でも
 * 文字が分離して読める。字形には端末標準のサンセリフ書体を用いる（プログラム描画のため規約に触れない）。
 */
export function createRankLetterAtlas(): RankLetterAtlas {
  const cellCount = RANK_LETTER_ATLAS_CELL_COUNT;
  const cellPixels = RANK_LETTER_ATLAS_CELL_PIXELS;

  const canvas = document.createElement("canvas");
  canvas.width = cellPixels * cellCount;
  canvas.height = cellPixels;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("ランク文字図版の2次元描画文脈を取得できませんでした");
  }

  // 背景は透明のまま（clearRect で確実に透明へ）。
  context.clearRect(0, 0, canvas.width, canvas.height);

  // 字の大きさはセルの高さの75%。縁取りはセル高さの8%。中央揃え。
  const fontPixels = Math.round(cellPixels * 0.75);
  context.font = `bold ${fontPixels}px sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineJoin = "round";
  context.lineWidth = Math.max(2, Math.round(cellPixels * 0.08));

  for (let cell = 0; cell < cellCount; cell += 1) {
    const letter = RANK_GAUGE_LETTERS[cell];
    const centerX = cell * cellPixels + cellPixels / 2;
    const centerY = cellPixels / 2;
    // 先に暗い縁取りを描き、その上へ白で塗ることで、白い文字の周囲に暗い縁が残り背景から分離する。
    context.strokeStyle = "#0a0a14";
    context.strokeText(letter, centerX, centerY);
    context.fillStyle = "#ffffff";
    context.fillText(letter, centerX, centerY);
  }

  const texture = new CanvasTexture(canvas);
  // 文字は色として表示するため sRGB 色空間で扱う。縮小・拡大とも線形補間で滑らかにする。
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  let disposed = false;

  return {
    texture,
    cellCount,
    cellUv(cellIndex: number): RankLetterCellUv {
      if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex >= cellCount) {
        throw new Error(`セル添字は0以上${cellCount}未満の整数でなければなりません（受領: ${cellIndex}）`);
      }
      // セルは横方向に等分。テクスチャ座標 u は左から右へ 0→1。縦は全高を使う。
      // three.js は既定でテクスチャを上下反転して読み込む（flipY=true）ため、v=0 が下端・v=1 が上端になる。
      const u0 = cellIndex / cellCount;
      const u1 = (cellIndex + 1) / cellCount;
      return { u0, v0: 0, u1, v1: 1 };
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      texture.dispose();
    },
  };
}
