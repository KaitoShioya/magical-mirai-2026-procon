// 品質検査ハーネスのGPUブラウザ起動。新しいヘッドレスモードでChromiumを起動し、
// 起動引数・ブラウザ版・Playwright版を記録して返す。
// ブラウザ起動部品（Playwright）を読み込むため、ローカル経路（run-local.mjs）からのみ用いる。
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { buildGpuArgs, DEFAULT_ANGLE, DEFAULT_CHANNEL } from "./config.mjs";

const require = createRequire(import.meta.url);

/**
 * 導入済みPlaywrightの版を読む。パッケージの読み込みでは版が取れないため、package.json から読む。
 * @returns {string}
 */
function readPlaywrightVersion() {
  try {
    const pkgPath = require.resolve("playwright/package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    return typeof pkg.version === "string" ? pkg.version : "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * 新しいヘッドレスモード（GPU適性あり）でChromiumを起動する。
 * @param {{ channel?: string, angle?: string }} options
 * @returns {Promise<{ browser: import("playwright").Browser, meta: { channel: string, angle: string, args: string[], browserVersion: string, playwrightVersion: string } }>}
 */
export async function launchGpuBrowser(options = {}) {
  const channel = options.channel || DEFAULT_CHANNEL;
  const angle = options.angle || DEFAULT_ANGLE;
  const args = buildGpuArgs(angle);
  const browser = await chromium.launch({ channel, args });
  const meta = {
    channel,
    angle,
    args,
    browserVersion: browser.version(),
    playwrightVersion: readPlaywrightVersion(),
  };
  return { browser, meta };
}

/**
 * ブラウザを閉じる。
 * @param {import("playwright").Browser} browser
 */
export async function closeBrowser(browser) {
  await browser.close();
}
