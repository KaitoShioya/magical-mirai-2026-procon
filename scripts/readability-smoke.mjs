// 文字可読性ゲート（Issue #98）の構造スモーク。Playwright で可読性診断ページ（readability.html）を開き、
// 診断グローバル window.__readability が整形された構造（5背景の配列と最小表示画素のオブジェクトが揃い、
// 数値が数であること）を返すことだけを確認する。これは可読性そのものの保証ではなく、診断ページの健全性確認である。
// 文字可読性ゲート本体（コントラスト比と最小表示画素の判定）は手元の実機環境で scripts/readability-quality.mjs
// として動かす。見た目の閾値判定はしない（描画系統の無い継続的インテグレーション環境では最終画素が実機の
// 見えを表さないため。docs/research/08-quality-assurance.md 6節）。
//
// 接続方式は本体と分ける。構造スモークはブラウザを直接起動して接続を繰り返し試みる（既存の構造スモークと同じ方式）。
// 接続先サーバは環境変数 BASE で指定する（既定 http://127.0.0.1:4173）。
//   PowerShell:  $env:BASE='http://127.0.0.1:4173'; node scripts/readability-smoke.mjs
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:4173";

const errors = [];
let failed = false;
function fail(message) {
  failed = true;
  console.error("失敗: " + message);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
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
    // 5背景の配列が揃い、各コントラスト比が数であること。
    if (!Array.isArray(result.backgrounds) || result.backgrounds.length !== 5) {
      fail(
        `背景の配列が5要素ではありません（${
          Array.isArray(result.backgrounds) ? result.backgrounds.length : "配列でない"
        }）`
      );
    } else {
      for (const background of result.backgrounds) {
        if (!isFiniteNumber(background.fillBorderContrast)) {
          fail(`背景[${background.kind}] のコントラスト比が数ではありません`);
        }
      }
      console.log("確認: 5背景のコントラスト比が数で揃っています");
    }

    // 最小表示画素のオブジェクトが揃い、各数値が数であること。
    const mp = result.minPixel;
    const numericKeys = [
      "measuredInkHeightPx",
      "inkWorldHeight",
      "emWorldHeight",
      "emPixelHeightEquivalent",
      "emProjectedPixelHeight",
      "projectedInkPixelHeight",
      "viewportPixelHeight",
      "flooredFontSize",
      "distance",
      "fovYDegrees",
    ];
    if (!mp || typeof mp !== "object") {
      fail("最小表示画素のオブジェクト（minPixel）がありません");
    } else {
      for (const key of numericKeys) {
        if (!isFiniteNumber(mp[key])) {
          fail(`最小表示画素の ${key} が数ではありません`);
        }
      }
      if (typeof mp.visibleBoundsValid !== "boolean") {
        fail("最小表示画素の visibleBoundsValid が真偽値ではありません");
      }
      console.log("確認: 最小表示画素の測定値が整形された構造で揃っています");
    }
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
  console.error("文字可読性の構造スモーク: 失敗");
  process.exit(1);
} else {
  console.log("文字可読性の構造スモーク: 成功");
}
