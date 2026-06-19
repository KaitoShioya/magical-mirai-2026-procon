// キネティック文字エンジンの補助スモーク。Playwright で typography.html を読み、起動の成否・
// エラーの有無・粗い数値を継続監視する。ヘッドレスのGPUは実機性能を表さないため
// （docs/research/08-quality-assurance.md §1）、達成基準の正式な合否には使わない。
// 正式な合否はGPUを使う通常起動のブラウザまたは実機で typography.html を開いて記録する。
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://localhost:5173";
const errors = [];

async function measure(page, label, seconds) {
  await page.waitForTimeout(2000); // 暖めと初回表示の確定を待つ。
  await page.evaluate(() => window.__resetFps && window.__resetFps());
  await page.waitForTimeout(seconds * 1000);
  const result = await page.evaluate(() => ({
    avg: window.__avgFps ? window.__avgFps() : -1,
    p5: window.__p5Fps ? window.__p5Fps() : -1,
    drops: window.__frameDrops ? window.__frameDrops() : -1,
    init: window.__initLatencyMs ? window.__initLatencyMs() : -1,
  }));
  console.log(
    `[${label}] avgFps=${result.avg} p5Fps=${result.p5} drops>33ms=${result.drops} initLatencyMs=${result.init}`
  );
  return result;
}

const browser = await chromium.launch();

async function run(query, label, viewport, seconds) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(`${label}: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`${label} console: ${message.text()}`);
  });
  await page.goto(`${BASE}/typography.html?${query}`, { waitUntil: "load" });
  await measure(page, label, seconds);
  await page.screenshot({ path: `scripts/typography-${label.replace(/[^a-z0-9]+/gi, "_")}.png` });
  await context.close();
}

// 実測再現（合否の対象だがヘッドレスのため粗い参考値）とデスクトップ・モバイル相当。
await run("profile=real", "desktop_real", { width: 1280, height: 720 }, 6);
await run("profile=real", "mobile_real", { width: 390, height: 844 }, 6);
// 最大負荷（余力確認の参考値）。
await run("profile=maxload", "desktop_maxload", { width: 1280, height: 720 }, 4);

await browser.close();

if (errors.length) {
  // ページ/コンソールのエラーは失敗として終了させる（継続監視で見逃さないため）。
  console.log("CONSOLE/PAGE ERRORS:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("no page errors");
