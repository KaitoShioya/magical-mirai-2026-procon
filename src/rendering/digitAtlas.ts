// 判定UI（落下式レーン Issue #57）の数字図版。数字1〜9を canvas の2次元描画で1枚のテクスチャへ描き、
// 各セルのテクスチャ座標を提供する。プログラミングによる動的描画であり、表示物にAI生成アセットを使わない
// 規約（CLAUDE.md）に適合する。埋め込み画像は使わない。本Issueの落下式レーンと、左端Y軸音程帯（#58）が
// 同じ図版を再利用できるよう独立モジュールにする。

import { CanvasTexture, LinearFilter, SRGBColorSpace, type Texture } from "three";

/** 図版が持つセル数（数字1〜9）。スロット数の上限9（スキーマの値域5〜9）まで賄う。 */
export const DIGIT_ATLAS_CELL_COUNT = 9;

/** 1セルのデバイス画素四方。表示の大きさより十分大きくして、縮小描画で字形がにじまないようにする（★暫定）。 */
export const DIGIT_ATLAS_CELL_PIXELS = 128;

/** セルのテクスチャ座標の矩形（u0,v0 が左下、u1,v1 が右上）。 */
export interface DigitCellUv {
  readonly u0: number;
  readonly v0: number;
  readonly u1: number;
  readonly v1: number;
}

/** 数字図版。テクスチャとセル座標の取得、後始末を提供する。 */
export interface DigitAtlas {
  /** 全数字を横一列に並べたテクスチャ。 */
  readonly texture: Texture;
  /** セル数（DIGIT_ATLAS_CELL_COUNT と同じ）。 */
  readonly cellCount: number;
  /** セル添字（0以上 cellCount 未満）のテクスチャ座標の矩形を返す。 */
  cellUv(cellIndex: number): DigitCellUv;
  /** 後始末。生成したテクスチャを解放する。冪等。 */
  dispose(): void;
}

/**
 * 数字図版を生成する。
 * 透明な背景に、白の塗りと暗い縁取りで数字を描く。黒の不透明な背景だと黒い矩形が出るか混色加算で背景に
 * 依存するため、透明背景に白塗りと暗い縁取りで描いて明暗どちらの背景でも数字が分離して読めるようにする。
 * 字形には端末標準のサンセリフ書体を用いる（数字はあらゆる標準サンセリフに含まれ、canvas描画は埋め込み
 * アセットでなくプログラム描画のため規約に触れない）。
 */
export function createDigitAtlas(): DigitAtlas {
  const cellCount = DIGIT_ATLAS_CELL_COUNT;
  const cellPixels = DIGIT_ATLAS_CELL_PIXELS;

  const canvas = document.createElement("canvas");
  canvas.width = cellPixels * cellCount;
  canvas.height = cellPixels;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("数字図版の2次元描画文脈を取得できませんでした");
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
    const digit = String(cell + 1); // セル0=数字1 … セル8=数字9
    const centerX = cell * cellPixels + cellPixels / 2;
    const centerY = cellPixels / 2;
    // 先に暗い縁取りを描き、その上へ白で塗ることで、白い数字の周囲に暗い縁が残り背景から分離する。
    context.strokeStyle = "#0a0a14";
    context.strokeText(digit, centerX, centerY);
    context.fillStyle = "#ffffff";
    context.fillText(digit, centerX, centerY);
  }

  const texture = new CanvasTexture(canvas);
  // 数字は色として表示するため sRGB 色空間で扱う。縮小・拡大とも線形補間で滑らかにする。
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  let disposed = false;

  return {
    texture,
    cellCount,
    cellUv(cellIndex: number): DigitCellUv {
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
