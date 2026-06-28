// 成果物画像の書き出し（Issue #69）の受け入れ診断ページ（artifact.html の入口）。
// 本物の描画基盤（createRenderRoot）で夜景に灯しを数個置き、現在のカメラ構図で成果物画像を作る。
// 作った画像を復号して、寸法・容量・形式・明るさ・文字領域の分布を window.__artifactCapture に公開する。
// scripts/rendering-artifact-smoke.mjs が読み、出力寸法が縦横比規則に従うこと、無圧縮可逆形式（PNG）で出ること、
// 画像が黒一色でないこと、下部の出典の帯（暗く落とした領域）が中ほどより暗いこと、文字を載せた領域が一様でないことを確かめる。
// 本ページは本番ビルド（--mode app）では配信しない。

import { createRenderRoot } from "../renderRoot";
import { resolveReflectionResolution } from "../reflection";

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`#${id} 要素が見つかりません`);
  }
  return element as T;
}

const container = requireElement<HTMLElement>("app");
const hud = requireElement<HTMLElement>("hud");

// 本物の描画基盤を作る（夜空・水面・灯し・カメラ・成果物キャプチャを備える）。ブルームは見えを本編に合わせるため有効。
const renderRoot = createRenderRoot(container, {
  reflectionResolution: resolveReflectionResolution("256"),
  bloomEnabled: true,
  placeholderGlowEnabled: false,
  lanternCapacity: 64,
});

// 灯しをミク中心の周りへ数個置き、画像に明るい内容（蝶・ひまわり）が入るようにする。位置・強度は診断用の固定値。
const LANTERN_COUNT = 16;
for (let index = 0; index < LANTERN_COUNT; index += 1) {
  const angle = (index / LANTERN_COUNT) * Math.PI * 2;
  const radius = 4 + (index % 4) * 1.5;
  renderRoot.placeLantern({
    butterflyPosition: { x: Math.cos(angle) * radius, y: 1.5 + (index % 3) * 0.6, z: Math.sin(angle) * radius },
    sunflowerX: Math.cos(angle) * radius,
    sunflowerZ: Math.sin(angle) * radius,
    headingX: -Math.sin(angle),
    headingZ: Math.cos(angle),
    sizeStrength: 0.4 + (index % 5) * 0.12,
    brightnessStrength: 0.5 + (index % 4) * 0.12,
    nearFade: false,
  });
}

// 結果画面の撮影の既定に近い構図（湖の中心を斜め上から見下ろす）にカメラを据える。
renderRoot.setCameraPose({ x: 0, y: 7, z: 18 }, { x: 0, y: 2, z: 0 });

// 数フレーム描いて灯しと夜空を確定させる（成果物キャプチャは専用合成器を使うが、場面の状態はここで進める）。
function renderFrames(count: number): void {
  for (let i = 0; i < count; i += 1) {
    renderRoot.update(0.016);
    renderRoot.render();
  }
}
renderFrames(3);

const SAMPLE_LINES = {
  workTitle: "あなたが奏でた湖",
  songLine: "TAKEOVER / Twinfield",
  scoreText: "スコア 12345",
  rankText: "ランク S",
  percentileText: "上位 12%",
  creditText:
    "初音ミク © Crypton Future Media, INC. www.piapro.net　ピアプロ・キャラクター・ライセンス",
};

/** 復号した画像の指定矩形の平均輝度（0から255）を求める。輝度は人の感度に近い加重平均で求める。 */
function regionMeanLuma(
  data: Uint8ClampedArray,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): number {
  let sum = 0;
  let count = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * width + x) * 4;
      // 加重平均（赤0.299・緑0.587・青0.114）を採る理由を先に述べる。人の目は緑に最も敏感で青に鈍いため、
      // 単純平均より見た目の明るさに近い指標になる。
      sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      count += 1;
    }
  }
  return count > 0 ? sum / count : 0;
}

/** 指定矩形の輝度の分散を求める（文字を載せた領域が一様でないことの確認に使う）。 */
function regionLumaVariance(
  data: Uint8ClampedArray,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): number {
  const mean = regionMeanLuma(data, width, x0, y0, x1, y1);
  let sumSq = 0;
  let count = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * width + x) * 4;
      const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      sumSq += (luma - mean) * (luma - mean);
      count += 1;
    }
  }
  return count > 0 ? sumSq / count : 0;
}

window.__artifactCapture = async (): Promise<unknown> => {
  const blob = await renderRoot.captureArtifact({ lines: SAMPLE_LINES });
  if (blob === null) {
    return { ok: false, reason: "画像を作れませんでした（描画不可）" };
  }
  const bitmap = await createImageBitmap(blob);
  const probe = document.createElement("canvas");
  probe.width = bitmap.width;
  probe.height = bitmap.height;
  const probeCtx = probe.getContext("2d");
  if (probeCtx === null) {
    return { ok: false, reason: "復号用の2次元コンテキストを作れませんでした" };
  }
  probeCtx.drawImage(bitmap, 0, 0);
  const { width, height } = bitmap;
  const data = probeCtx.getImageData(0, 0, width, height).data;

  const meanLuma = regionMeanLuma(data, width, 0, 0, width, height);
  // 中ほどの帯（高さ40%〜55%）と最下部の出典の帯（高さ92%〜99%）の平均輝度。出典の帯は暗く落としているため中ほどより暗いはず。
  const middleLuma = regionMeanLuma(
    data,
    width,
    0,
    Math.floor(height * 0.4),
    width,
    Math.floor(height * 0.55)
  );
  const creditStripLuma = regionMeanLuma(
    data,
    width,
    0,
    Math.floor(height * 0.92),
    width,
    Math.floor(height * 0.99)
  );
  // 見出し（高さ8%〜18%）の輝度の分散。文字を載せた領域は背景と文字で輝度差が出るため、分散が正になる。
  const titleVariance = regionLumaVariance(
    data,
    width,
    0,
    Math.floor(height * 0.08),
    width,
    Math.floor(height * 0.18)
  );

  return {
    ok: true,
    width,
    height,
    longEdge: Math.max(width, height),
    aspect: width / height,
    type: blob.type,
    sizeBytes: blob.size,
    meanLuma,
    middleLuma,
    creditStripLuma,
    titleVariance,
  };
};

// 作者目視の補助。成果物画像をデータURLで返す（文字配置・可読性を画像として確認するため）。
(
  window as unknown as { __artifactDataUrl?: () => Promise<string | null> }
).__artifactDataUrl = async (): Promise<string | null> => {
  const blob = await renderRoot.captureArtifact({ lines: SAMPLE_LINES });
  if (blob === null) {
    return null;
  }
  return new Promise<string | null>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
};

// 灯し立ち上げ演出（Issue #63）の検証補助。立ち上げ前と立ち上げの山（中ほど）の画像の平均輝度を比べ、
// 点灯の盛り上がりで明るくなること（山＞基準）を確かめる。renderRoot.update を手動で進めて山の時刻に合わせる。
async function captureMeanLuma(): Promise<number> {
  const blob = await renderRoot.captureArtifact({ lines: SAMPLE_LINES });
  if (blob === null) {
    return -1;
  }
  const bitmap = await createImageBitmap(blob);
  const probe = document.createElement("canvas");
  probe.width = bitmap.width;
  probe.height = bitmap.height;
  const probeCtx = probe.getContext("2d");
  if (probeCtx === null) {
    return -1;
  }
  probeCtx.drawImage(bitmap, 0, 0);
  const data = probeCtx.getImageData(0, 0, bitmap.width, bitmap.height).data;
  // 灯しが多く写る中下部（高さ55%〜85%）の平均輝度を見る（見出し・出典の文字の影響を避ける）。
  return regionMeanLuma(
    data,
    bitmap.width,
    0,
    Math.floor(bitmap.height * 0.55),
    bitmap.width,
    Math.floor(bitmap.height * 0.85)
  );
}

(
  window as unknown as { __finaleBrightnessCheck?: () => Promise<unknown> }
).__finaleBrightnessCheck = async (): Promise<unknown> => {
  const baseLuma = await captureMeanLuma();
  renderRoot.beginLanternFinale(false);
  // 立ち上げの山へ進める。index 0 の個体は経過0.6秒（継続1.2秒の半分）で山になる。0.05秒刻みで0.6秒進める。
  for (let t = 0; t < 0.6; t += 0.05) {
    renderRoot.update(0.05);
  }
  const peakLuma = await captureMeanLuma();
  // 完了まで十分進めて基準へ戻す（合計2.2秒＝時間差1.0＋継続1.2を超える）。
  for (let t = 0; t < 2.0; t += 0.05) {
    renderRoot.update(0.05);
  }
  const settledLuma = await captureMeanLuma();
  return { baseLuma, peakLuma, settledLuma };
};

hud.textContent = "成果物キャプチャ診断: __artifactCapture() を呼ぶと画像を作って分析します。";
