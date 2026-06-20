// 可読性処理（Issue #31）の受け入れ基準の実機検証。
// Playwright で可読性診断ページ（readability.html）を開き、診断グローバル window.__readability を読み、
// 発光・ブルーム後処理を通した最終描画画素で、不利な背景の代表集合（暗い背景・明るい背景・暗から明への
// 階調背景・ブルームで強くにじむ明るい発光塊・高周波の模様の背景）に対し、文字内部と縁取りのコントラスト比が
// 4.5:1 以上であることを確かめる。
//
// 判定方法の根拠を先に述べる。読ませる役の可読性は、塗りを全周で囲む暗い縁取りに対する塗りのコントラストで
// 背景非依存に決まる。縁取りがブルームのにじみで明るくなる分は最終描画画素から読むため計測に含まれる。よって
// 合否は「文字領域内の明るい塗り（高位百分位）と暗い縁取り（低位百分位）のコントラスト比」で判定し、閾値は通常文字の適合水準 4.5:1 とする。
//
// 接続先サーバは環境変数 BASE で指定する（既定 http://127.0.0.1:4173）。
//   PowerShell:  $env:BASE='http://127.0.0.1:4173'; node scripts/readability-contrast.mjs
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:4173";
const PASS_RATIO = 4.5;

const errors = [];
let failed = false;
function fail(message) {
  failed = true;
  console.error("失敗: " + message);
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
const page = await context.newPage();
page.on("pageerror", (error) => errors.push("ページ例外: " + error.message));
page.on("console", (message) => {
  if (message.type() === "error") {
    errors.push("コンソールエラー: " + message.text());
  }
});

try {
  let connected = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await page.goto(BASE + "/readability.html", { waitUntil: "load", timeout: 2000 });
      connected = true;
      break;
    } catch {
      await page.waitForTimeout(500);
    }
  }
  if (!connected) {
    throw new Error("プレビューサーバへ接続できませんでした: " + BASE);
  }

  // 計測が終わるまで待つ（フォントの取得と配置確定、5背景分の描画と画素読み取りを含む）。
  await page.waitForFunction(
    () => typeof window.__readabilityReady === "function" && window.__readabilityReady(),
    undefined,
    { timeout: 30000 }
  );

  const result = await page.evaluate(() =>
    typeof window.__readability === "function" ? window.__readability() : null
  );

  if (!result) {
    fail("window.__readability が取得できませんでした");
  } else {
    console.log(
      `mode=${result.mode} backing=${result.backing} 文字被覆画素数=${result.fillPixelCount} ` +
        `cap(stroke=${result.capability.stroke} offset=${result.capability.outlineOffset} blur=${result.capability.outlineBlur})`
    );
    for (const background of result.backgrounds) {
      console.log(
        `[${background.kind}] 内部対縁取り=${background.fillBorderContrast.toFixed(2)} ` +
          `控えめ分位=${background.conservativeFillBorder.toFixed(2)} ` +
          `参考: 内部対背景=${background.fillVsBackground.toFixed(2)} ` +
          `縁取り対背景=${background.borderVsBackground.toFixed(2)}`
      );
      if (!(background.fillBorderContrast >= PASS_RATIO)) {
        fail(
          `背景[${background.kind}] の文字内部対縁取りのコントラスト比が ` +
            `${background.fillBorderContrast.toFixed(2)} です（期待: ${PASS_RATIO} 以上）`
        );
      }
    }
    console.log(
      `全背景の文字内部対縁取りコントラスト比の最小=${result.fillBorderContrastOverall.toFixed(2)}（合格閾値 ${PASS_RATIO}）`
    );
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
} finally {
  await browser.close();
}

if (errors.length > 0) {
  fail("ページ・コンソールのエラーを検出しました:\n" + errors.join("\n"));
}

if (failed) {
  console.error("可読性コントラストの受け入れ検証: 失敗");
  process.exit(1);
} else {
  console.log("可読性コントラストの受け入れ検証: 成功");
}
