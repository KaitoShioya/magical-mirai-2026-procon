// 品質検査ハーネスのページ操作。ページを開く・準備完了を待つ・ウォームアップ・標本採取・撮影を担う。
// ブラウザ起動部品（Playwright）を読み込むため、ローカル経路（run-local.mjs）からのみ用いる。
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * ページを開く。pageerror と console error を errors 配列へ収集する。
 * 起動待ちは「最大30回・各500ミリ秒間隔」で再試行する（既存スモークと同じ方式）。
 * @param {import("playwright").Browser} browser
 * @param {{ url: string, viewport: { width: number, height: number }, deviceScaleFactor?: number, isMobile?: boolean, cpuThrottle?: number }} options
 * 返り値の errors は表示・記録用に「ページ例外」と「コンソールエラー」をまとめた一覧、
 * pageErrors は未捕捉例外（ページ例外）だけの一覧で、合否判定に用いる。両者を分けるのは、
 * 背景の404のような良性のコンソールエラーを失敗にせず、未捕捉例外だけを失敗にするためである。
 * @returns {Promise<{ page: import("playwright").Page, context: import("playwright").BrowserContext, errors: string[], pageErrors: string[] }>}
 */
export async function openPage(browser, options) {
  const errors = [];
  const pageErrors = [];
  const context = await browser.newContext({
    viewport: options.viewport,
    deviceScaleFactor: options.deviceScaleFactor ?? 1,
    isMobile: options.isMobile ?? false,
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => {
    errors.push("ページ例外: " + error.message);
    pageErrors.push(error.message);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push("コンソールエラー: " + message.text());
    }
  });

  // 処理速度を絞る指定があるときだけ、CDP で絞る。
  const throttle = options.cpuThrottle ?? 1;
  if (throttle > 1) {
    const client = await context.newCDPSession(page);
    await client.send("Emulation.setCPUThrottlingRate", { rate: throttle });
  }

  let connected = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await page.goto(options.url, { waitUntil: "load", timeout: 2000 });
      connected = true;
      break;
    } catch {
      await page.waitForTimeout(500);
    }
  }
  if (!connected) {
    throw new Error("プレビューサーバへ接続できませんでした: " + options.url);
  }

  return { page, context, errors, pageErrors };
}

/**
 * 描画ループの準備完了（計測フック window.__fps が関数として存在）を待つ。
 * @param {import("playwright").Page} page
 * @param {{ timeoutMs?: number }} options
 */
export async function waitForReady(page, options = {}) {
  await page.waitForFunction(() => typeof window.__fps === "function", undefined, {
    timeout: options.timeoutMs ?? 15000,
  });
}

/**
 * ウォームアップ。指定時間待ってから標本をリセットする。
 * @param {import("playwright").Page} page
 * @param {{ ms?: number }} options
 */
export async function warmup(page, options = {}) {
  await page.waitForTimeout(options.ms ?? 1500);
  await page.evaluate(() => {
    if (typeof window.__resetFps === "function") {
      window.__resetFps();
    }
  });
}

/**
 * 毎秒フレーム数の標本を採取する。指定時間待ってから生標本・平均・直近値を読む。
 * @param {import("playwright").Page} page
 * @param {{ durationMs: number }} options
 * @returns {Promise<{ samples: number[], avgFps: number, lastFps: number }>}
 */
export async function sampleFps(page, options) {
  await page.waitForTimeout(options.durationMs);
  return page.evaluate(() => ({
    samples: typeof window.__fpsSamples === "function" ? window.__fpsSamples() : [],
    avgFps: typeof window.__avgFps === "function" ? window.__avgFps() : -1,
    lastFps: typeof window.__fps === "function" ? window.__fps() : -1,
  }));
}

/**
 * スクリーンショットを撮る。出力先を作成し、ファイル名を正規化して保存する。
 * @param {import("playwright").Page} page
 * @param {{ outDir: string, name: string }} options
 * @returns {Promise<{ path: string }>}
 */
export async function captureScreenshot(page, options) {
  await mkdir(options.outDir, { recursive: true });
  const safeName = options.name.replace(/[^a-z0-9]+/gi, "_");
  const path = join(options.outDir, safeName + ".png");
  await page.screenshot({ path });
  return { path };
}
