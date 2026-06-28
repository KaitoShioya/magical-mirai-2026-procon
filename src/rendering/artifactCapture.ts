// 成果物画像の書き出し（成果物タスク #69）。現在のカメラ構図でブルームを含む最終合成を専用の合成器で固定解像度へ描き、
// 画素を読み戻して2次元キャンバスへ転写し、その上に作品名・スコア・ランク・百分位・出典の文字を重ね描きして画像（Blob）にする。
//
// 文字を2次元キャンバスで重ねる理由を先に述べる。距離場文字（troika）を3次元で重ねると同期待ちと色管理が複雑になるため、
// 読み戻した画素（既にsRGBの8ビット）を2次元キャンバスへ載せ、その上に2次元キャンバスの文字描画で重ねると色管理が一意に定まる。
// 判定・得点の論理は持たず、文字は統括（src/app）が整形済みの文字列で渡す（依存規則 docs/decisions/architecture.md §5）。

import type { PerspectiveCamera, Scene, WebGLRenderer } from "three";
import { createArtifactCaptureComposer } from "./bloom";
import { computeArtifactDimensions, flipRowsRgba } from "./captureEncode";

/** 成果物画像へ焼き込む文字。統括（src/app）が整形して渡す。 */
export interface ArtifactTextLines {
  /** 作品名（見出し）。 */
  workTitle: string;
  /** 曲名と作者の行（例「TAKEOVER / Twinfield」）。 */
  songLine: string;
  /** スコアの行（例「スコア 12345」）。 */
  scoreText: string;
  /** ランクの行（例「ランク S」）。 */
  rankText: string;
  /** 百分位の行（例「上位 12%」）。 */
  percentileText: string;
  /** 出典（ミクの権利表記。§16 の出典明示を画像内に残す）。 */
  creditText: string;
}

/** 成果物画像のキャプチャ入力。 */
export interface ArtifactCaptureInput {
  /** 焼き込む文字。 */
  lines: ArtifactTextLines;
}

/** 画素の読み戻しに必要な依存。renderRoot が内部の描画資源を渡す。 */
export interface ArtifactCaptureDeps {
  renderer: WebGLRenderer;
  scene: Scene;
  /** 構図の基準にする本編カメラ。位置・注視点・視野角を複製し、縦横比だけ出力解像度に合わせる。 */
  camera: PerspectiveCamera;
  bloomEnabled: boolean;
  postEffectEnabled: boolean;
  /** 現在のビューポート寸法（出力解像度の縦横比を決める）。 */
  viewportWidth: number;
  viewportHeight: number;
}

/** 読み戻した画素と、その出力解像度。 */
export interface CapturedArtifactPixels {
  /** 8ビットの赤緑青と不透明度の並び（左下原点）。 */
  pixels: Uint8Array;
  width: number;
  height: number;
}

/** 成果物文字に使うフォントの家族名（2次元キャンバスの font 指定で参照する一意の名前）。 */
const ARTIFACT_FONT_FAMILY = "ArtifactGothic";
/** 成果物文字に使うサブセットフォントのアドレス（被覆は build-font-subset.mjs が保証する）。 */
const ARTIFACT_FONT_URL = "/fonts/zen-kaku-gothic-new-subset.woff";

// フォントの読み込みは一度だけ行い、以後は同じ読み込みを使い回す。読み込み結果（成功か失敗か）を保持する。
let fontLoadPromise: Promise<boolean> | null = null;

/**
 * 成果物文字用フォントを読み込み、文書のフォント集合へ登録する。読み込み完了を待ってから文字を描くために使う。
 * 読み込みに失敗したときは false を返し、呼び出し側は端末標準のゴシックで描く（font 指定の代替に sans-serif を含める）。
 */
async function ensureArtifactFont(): Promise<boolean> {
  if (fontLoadPromise !== null) {
    return fontLoadPromise;
  }
  fontLoadPromise = (async (): Promise<boolean> => {
    try {
      const face = new FontFace(ARTIFACT_FONT_FAMILY, `url(${ARTIFACT_FONT_URL})`);
      await face.load();
      document.fonts.add(face);
      return true;
    } catch {
      // 読み込み失敗時は欠字を黙って出さず、端末標準のゴシックへ倒す。
      return false;
    }
  })();
  return fontLoadPromise;
}

/**
 * 2次元キャンバスの文字列を中央寄せで、暗い縁取り付きで描く（任意背景でも読めるようにする）。
 * 文字の幅が maxWidth を超える場合は、収まるように文字寸法を縮める。理由を先に述べる。出典など長い行は、
 * 画像の幅を超えると右端で切れて読めなくなるため、幅に収まる寸法へ自動で縮めて欠けを防ぐ。
 */
function drawOutlinedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  baselineY: number,
  fontPx: number,
  maxWidth: number
): void {
  let effectiveFontPx = fontPx;
  ctx.font = `${effectiveFontPx}px "${ARTIFACT_FONT_FAMILY}", sans-serif`;
  const measured = ctx.measureText(text).width;
  if (measured > maxWidth && measured > 0) {
    // 最小8画素を下限にする（これ以上小さいと読めないため）。
    effectiveFontPx = Math.max(8, Math.floor((effectiveFontPx * maxWidth) / measured));
    ctx.font = `${effectiveFontPx}px "${ARTIFACT_FONT_FAMILY}", sans-serif`;
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  // 縁取りの太さは文字寸法に比例させ、最小2画素を保つ。理由を先に述べる。細すぎると明るい背景で輪郭が消え、
  // 太すぎると文字が潰れるため、文字寸法の約12%で輪郭の濃さと可読性を両立させる。
  ctx.lineWidth = Math.max(2, effectiveFontPx * 0.12);
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
  ctx.strokeText(text, centerX, baselineY);
  ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
  ctx.fillText(text, centerX, baselineY);
}

/** 画素を載せた2次元キャンバスへ、成果物の文字を所定の位置に重ね描きする。 */
function drawArtifactText(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  lines: ArtifactTextLines
): void {
  const centerX = width / 2;
  // 文字が収まる最大幅（左右に余白を残す）。はみ出す行はこの幅に収まるよう文字寸法を縮める。
  const maxTextWidth = width * 0.94;

  // 下部に暗いグラデーションの帯を敷く。理由を先に述べる。スコアや出典は明るい湖面の上にも置かれ得るため、
  // 下部を暗く落として文字の可読性（背景とのコントラスト）を確保する。
  const stripTop = height * 0.7;
  const gradient = ctx.createLinearGradient(0, stripTop, 0, height);
  gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0.62)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, stripTop, width, height - stripTop);

  // 見出し（作品名）は上部に大きく。
  drawOutlinedText(ctx, lines.workTitle, centerX, height * 0.12, height * 0.058, maxTextWidth);

  // 曲名・スコア・ランク・百分位は下部に積む。文字寸法は画像の高さに比例させ、どの解像度でも釣り合いを保つ。
  drawOutlinedText(ctx, lines.songLine, centerX, height * 0.8, height * 0.034, maxTextWidth);
  drawOutlinedText(
    ctx,
    `${lines.scoreText}　${lines.rankText}`,
    centerX,
    height * 0.86,
    height * 0.05,
    maxTextWidth
  );
  drawOutlinedText(ctx, lines.percentileText, centerX, height * 0.905, height * 0.032, maxTextWidth);

  // 出典は最下部に小さく。§16 の出典明示を画像内に残す。長いため幅に収まるよう縮める。
  drawOutlinedText(ctx, lines.creditText, centerX, height * 0.965, height * 0.02, maxTextWidth);
}

/** canvas.toBlob を約束（Promise）にする。 */
function toBlobAsync(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type);
  });
}

/**
 * 2次元キャンバスを画像（Blob）にする。無圧縮可逆形式（PNG）で出す。容量の上限は設けず、容量の大小に依らず常に
 * PNG で保存する。PNG に固定する理由を先に述べる。成果物は劣化のない可逆形式で残したいというユーザーの方針により、
 * 容量制限と不可逆形式への切り替えは行わない。
 */
async function encodeArtifactBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return toBlobAsync(canvas, "image/png");
}

/**
 * 現在のカメラ構図で、ブルームを含む最終合成を出力解像度へ描き、8ビットの画素を読み戻す（成果物タスク #69）。
 * この関数は同期で、描画資源（レンダラ・場面）に触れる唯一の段である。呼び出し側（renderRoot.captureArtifact）は、
 * 本関数の前にレンダラの画素密度倍率を1へ退避し、本関数の直後（非同期の画像化に入る前）に倍率を復元する。
 * 倍率を1にする理由を先に述べる。専用合成器は構築時のレンダラ倍率で内部バッファの実画素数を決めるため、倍率1で
 * 構築すれば width×height の実画素数になり、読み戻す寸法が出力解像度と一致する。
 */
export function captureArtifactPixels(deps: ArtifactCaptureDeps): CapturedArtifactPixels {
  const { renderer, scene, camera, bloomEnabled, postEffectEnabled, viewportWidth, viewportHeight } =
    deps;

  const { width, height } = computeArtifactDimensions(viewportWidth, viewportHeight);

  // 構図の基準にする本編カメラを複製し、縦横比だけ出力解像度に合わせる。位置・注視点（向き）・視野角は本編のまま使う。
  const captureCamera = camera.clone();
  captureCamera.aspect = width / height;
  captureCamera.updateProjectionMatrix();

  // 専用の合成器で出力解像度へ描き、8ビットの画素を読み戻す。使い終えたら解放する。
  const composer = createArtifactCaptureComposer(renderer, scene, captureCamera, {
    width,
    height,
    bloomEnabled,
    postEffectEnabled,
  });
  try {
    return { pixels: composer.capturePixels(), width, height };
  } finally {
    composer.dispose();
  }
}

/**
 * 読み戻した画素から成果物画像（Blob）を作る（成果物タスク #69）。行反転→2次元キャンバス転写→文字合成→画像化を行う。
 * 描画資源（レンダラ・場面）には触れないため、非同期（フォント読み込みと画像化）でも画面描画と競合しない。
 */
export async function encodeArtifactImage(
  captured: CapturedArtifactPixels,
  lines: ArtifactTextLines
): Promise<Blob | null> {
  const { pixels, width, height } = captured;

  // 読み戻し画素（左下原点）を行反転して2次元キャンバスへ転写する。
  const flipped = flipRowsRgba(pixels, width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    return null;
  }
  // ctx.createImageData で空の画像データを作り、行反転済みの画素を写してから載せる。
  // この方法を採る理由を先に述べる。ImageData のコンストラクタは型注釈上、確保元のバッファの種別に厳密で取り回しにくいが、
  // createImageData が返す画像データの data へ set で写す方法はその制約を受けず、同じ結果を簡潔に得られる。
  const imageData = ctx.createImageData(width, height);
  imageData.data.set(flipped);
  ctx.putImageData(imageData, 0, 0);

  // フォントの読み込み完了を待ってから文字を描く（欠字や差し替え途中の描画を避ける）。
  await ensureArtifactFont();
  drawArtifactText(ctx, width, height, lines);

  return encodeArtifactBlob(canvas);
}
