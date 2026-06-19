// グラフィック負荷検証: Playwright で prototype.html の毎秒フレーム数を計測する。
// デスクトップと、モバイル相当（小ビューポート＋CPUスロットリング）で測る。
//
// 起動・ページ操作の共通部品は品質検査ハーネス（scripts/harness）と共有する。本スクリプトは
// 計測の道具であり品質ゲートではないため、ソフトウェア描画で失敗させる厳格判定は持ち込まない
// （厳格判定は `npm run quality` 側だけにある）。接続先既定・クエリノブ・2系統計測・
// スクリーンショット名・標準出力の体裁は従来どおり保つ。
import { chromium } from "playwright";
import { openPage, warmup } from "./harness/page.mjs";

const BASE = process.env.BASE || "http://localhost:5174";
const errors = [];

// 1ケースを計測する。共通部品 openPage（コンテキスト生成・処理速度の絞り・接続再試行・エラー収集）と
// warmup（1500ミリ秒待機後に標本リセット）を再利用し、計測値の読み取りと撮影は従来どおり行う。
async function measure(browser, options) {
  const url = BASE + "/prototype.html?" + options.query;
  const { page, context, errors: pageErrors } = await openPage(browser, {
    url,
    viewport: options.viewport,
    deviceScaleFactor: options.deviceScaleFactor,
    isMobile: options.isMobile,
    cpuThrottle: options.cpuThrottle,
  });
  await warmup(page, { ms: 1500 });
  await page.waitForTimeout(options.seconds * 1000);
  const avg = await page.evaluate(() => (window.__avgFps ? window.__avgFps() : -1));
  const last = await page.evaluate(() => (window.__fps ? window.__fps() : -1));
  console.log(`[${options.label}] avgFps=${avg.toFixed(1)} lastFps=${last}`);
  await page.screenshot({ path: options.shotPath });
  errors.push(...pageErrors);
  await context.close();
  return avg;
}

const browser = await chromium.launch();

// --- デスクトップ ---
await measure(browser, {
  label: "desktop default(refl512 bloom0.5 pts300)",
  query: "refl=512&bloomScale=0.5&points=300",
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
  isMobile: false,
  cpuThrottle: 1,
  seconds: 5,
  shotPath: "scripts/proto-desktop.png",
});

// --- モバイル相当 + CPU 6倍スロットリング ---
async function mobileRun(query, label, rate = 6) {
  return measure(browser, {
    label,
    query,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    cpuThrottle: rate,
    seconds: 6,
    shotPath: "scripts/proto-mobile-" + label.replace(/[^a-z0-9]+/gi, "_") + ".png",
  });
}

await mobileRun("refl=512&bloomScale=0.5&points=300", "mobile_x6_default", 6);
await mobileRun("refl=256&bloomScale=0.4&points=300&dpr=2", "mobile_x6_light", 6);
await mobileRun("refl=0&bloom=1&bloomScale=0.4&points=300&dpr=2", "mobile_x6_noreflect", 6);

if (errors.length) console.log("CONSOLE/PAGE ERRORS:\n" + errors.join("\n"));
else console.log("no page errors");

await browser.close();
