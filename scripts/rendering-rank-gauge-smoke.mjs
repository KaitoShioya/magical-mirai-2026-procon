// ランク専用ゲージ（Issue #65）の受け入れ基準のブラウザ統合検証。
// Playwright で診断ページ（rank-gauge.html）を開き、横長（机上）と縦長（携帯相当）の2画面で次を確かめる。
//   (a) ゲージが2次元層へ載っている（横位置が確定して画面右側にある）。
//   (b) 満ち量が百分位に対し単調に増える。
//   (c) 各帯中心の百分位（12.5・37.5・62.5・87.5）で、満ちバー中心の描画画素が算出アンカー色に一致する
//       （各チャンネル絶対0.02の許容誤差）。算出色だけでなく描画画素まで見ることで色空間適用の取り違えを検出する。
//   (d) 同じ百分位でランク添字が rankFromPercentile 由来の期待値（0=C, 1=B, 2=A, 3=S）に一致する。
//   (e) ゲージの矩形が視錐台内に収まり、ランク文字中央が引き下げ後の位置（0.6以下）にある（画面右上のクレジットボタンと重ならない高さ）。
//   (f) ページ例外・コンソールエラーが無い。
// 採用理由を先に述べる。携帯主軸（CLAUDE.md）のため縦長でも画面外切れ・干渉が無いことを実機相当の縦横比で追認する。
// 色の判定基準は診断ページが公開する算出 sRGB（材質へ設定する値）と読み戻し画素の両方で、許容誤差0.02は
// 8ビット量子化（約0.004）と合成誤差を吸収しつつ別色との取り違えを検出できる大きさである。
// 接続先サーバは環境変数 BASE で指定する（既定 http://127.0.0.1:4173）。
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:4173";

// 横長（机上）と縦長（携帯相当、既存スモークの標準寸法）。
const VIEWPORTS = [
  { name: "横長", width: 1280, height: 720 },
  { name: "縦長", width: 390, height: 844 },
];

// 帯中心の百分位と、そこで期待するランク添字（0=C, 1=B, 2=A, 3=S）。
const BAND_CENTERS = [
  { percentile: 12.5, expectedRankIndex: 0 },
  { percentile: 37.5, expectedRankIndex: 1 },
  { percentile: 62.5, expectedRankIndex: 2 },
  { percentile: 87.5, expectedRankIndex: 3 },
];

// 色の許容誤差（各チャンネル、0..1）。8ビット量子化と合成誤差を吸収する。
const COLOR_TOLERANCE = 0.02;
// ランク文字中央の許容上限（2次元層）。採用理由を先に述べる。ランク表示は画面右上のクレジットボタンと重ならないよう
// 引き下げ、文字中央を 0.54 に置く。最小級の縦640画素端末でのクレジットボタンの下端（約 +0.84）より十分下にあることを
// 確認できる値として、0.54 に小さな余裕を持たせた 0.6 を上限とする。
const LETTER_CENTER_MAX = 0.6;

let failed = false;
function fail(message) {
  failed = true;
  console.error("失敗: " + message);
}
function ok(message) {
  console.log("確認: " + message);
}

async function gotoWithRetry(page, url) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: "load", timeout: 2000 });
      return true;
    } catch {
      await page.waitForTimeout(500);
    }
  }
  return false;
}

async function runViewport(viewport, browser) {
  const label = viewport.name;
  const errors = [];
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push("ページ例外: " + error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push("コンソールエラー: " + message.text());
    }
  });

  if (!(await gotoWithRetry(page, BASE + "/rank-gauge.html"))) {
    fail(`[${label}] プレビューサーバへ接続できませんでした: ` + BASE + "/rank-gauge.html");
    await context.close();
    return;
  }
  await page.waitForFunction(() => typeof window.__rankGaugeSampleAt === "function", undefined, {
    timeout: 15000,
  });
  // 横位置は描画反復の更新で確定するため、最初のフレームが回るのを待つ。
  await page.waitForFunction(() => window.__rankGaugeState().groupX > 0, undefined, { timeout: 15000 });

  const sampleAt = async (percentile) =>
    page.evaluate((p) => window.__rankGaugeSampleAt(p), percentile);

  // (a) ゲージが載って横位置が画面右側にある。
  const stateA = await page.evaluate(() => window.__rankGaugeState());
  if (stateA.groupX > 0 && stateA.groupX < stateA.aspect) {
    ok(`[${label}] 横位置が画面右側で画面外へはみ出さない（groupX=${stateA.groupX.toFixed(3)} aspect=${stateA.aspect.toFixed(3)}）`);
  } else {
    fail(`[${label}] 横位置が画面右側に収まらない（groupX=${stateA.groupX} aspect=${stateA.aspect}）`);
  }

  // (b) 満ち量が百分位に対し単調に増える。
  const fillSamples = [];
  for (const p of [0, 20, 40, 60, 80, 100]) {
    const s = await sampleAt(p);
    fillSamples.push({ p, fill: s.fillFraction });
  }
  let monotonic = true;
  for (let i = 1; i < fillSamples.length; i += 1) {
    if (fillSamples[i].fill < fillSamples[i - 1].fill - 1e-9) {
      monotonic = false;
    }
  }
  if (monotonic && fillSamples[0].fill === 0 && fillSamples[fillSamples.length - 1].fill === 1) {
    ok(`[${label}] 満ち量が百分位に対し単調増加（0→1）`);
  } else {
    fail(`[${label}] 満ち量が単調増加でない（${JSON.stringify(fillSamples)}）`);
  }

  // (c)(d)(e) 各帯中心で色・ランク添字・矩形を確かめる。
  for (const band of BAND_CENTERS) {
    const sample = await sampleAt(band.percentile);

    // (c) 満ちバー中心の描画画素が算出色に一致する。
    if (sample.pixel === null) {
      fail(`[${label}] 百分位${band.percentile}で画素を読み戻せない（WebGL 不可）`);
    } else {
      const maxDiff = Math.max(
        Math.abs(sample.pixel[0] - sample.color[0]),
        Math.abs(sample.pixel[1] - sample.color[1]),
        Math.abs(sample.pixel[2] - sample.color[2])
      );
      if (maxDiff <= COLOR_TOLERANCE) {
        ok(`[${label}] 百分位${band.percentile}の描画画素が算出色に一致（最大差 ${maxDiff.toFixed(4)}）`);
      } else {
        fail(
          `[${label}] 百分位${band.percentile}の描画画素が算出色と乖離（最大差 ${maxDiff.toFixed(4)} ` +
            `画素=${sample.pixel.map((c) => c.toFixed(3)).join(",")} 算出=${sample.color.map((c) => c.toFixed(3)).join(",")}）`
        );
      }
    }

    // (d) ランク添字が rankFromPercentile 由来の期待値に一致する。
    if (sample.rankIndex === band.expectedRankIndex) {
      ok(`[${label}] 百分位${band.percentile}のランク添字が期待値 ${band.expectedRankIndex} に一致`);
    } else {
      fail(`[${label}] 百分位${band.percentile}のランク添字が不一致（実 ${sample.rankIndex} 期待 ${band.expectedRankIndex}）`);
    }

    // (e) 矩形が視錐台内、かつランク文字中央が引き下げ後の位置（0.6以下）にある。
    const left = sample.groupX - sample.width / 2;
    const right = sample.groupX + sample.width / 2;
    const withinHorizontal = left >= -sample.aspect - 1e-6 && right <= sample.aspect + 1e-6;
    const withinVertical = sample.trackBottomY >= -1 - 1e-6 && sample.letterCenterY <= 1 - 1e-6;
    const loweredClear = sample.letterCenterY <= LETTER_CENTER_MAX;
    if (withinHorizontal && withinVertical && loweredClear) {
      ok(`[${label}] 百分位${band.percentile}で矩形が視錐台内かつ文字中央が引き下げ後の高さ（文字中心=${sample.letterCenterY.toFixed(2)}）`);
    } else {
      fail(
        `[${label}] 百分位${band.percentile}で矩形が画面内・引き下げ後の高さに収まらない（` +
          `left=${left.toFixed(3)} right=${right.toFixed(3)} aspect=${sample.aspect.toFixed(3)} ` +
          `下端=${sample.trackBottomY} 文字中心=${sample.letterCenterY}）`
      );
    }
  }

  // (f) ページ例外・コンソールエラーが無い。
  if (errors.length > 0) {
    fail(`[${label}] 診断ページでエラーを検出しました:\n` + errors.join("\n"));
  }
  await context.close();
}

// 画面ごとに独立したブラウザを起動して順に検証する。採用理由を先に述べる。ヘッドレスのソフトウェア描画では、
// 1つのブラウザの中で WebGL 描画文脈を複数同時に持つと先発の文脈が失われ描画バッファが 0 になることがある。
// 既存の画素読み戻しスモーク（層合成・ポストエフェクト）はいずれも1ブラウザ1文脈で動くため、それに揃える。
// ブラウザは finally で必ず閉じ、例外時もぶら下がりを残さない。
for (const viewport of VIEWPORTS) {
  const browser = await chromium.launch();
  try {
    await runViewport(viewport, browser);
  } catch (error) {
    fail(`[${viewport.name}] ` + (error instanceof Error ? error.message : String(error)));
  } finally {
    await browser.close();
  }
}

if (failed) {
  console.error("ランク専用ゲージの受け入れ検証: 失敗");
  process.exit(1);
} else {
  console.log("ランク専用ゲージの受け入れ検証: 成功");
}
