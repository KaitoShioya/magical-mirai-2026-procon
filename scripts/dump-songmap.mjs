/**
 * scripts/dump-songmap.mjs
 * Playwright を使って analysis.html から songMap JSON を取得し
 * docs/analysis/<key>.songmap.json に保存するスクリプト。
 *
 * 使い方:
 *   npm run dev &          # 事前に開発サーバを起動しておく
 *   npx playwright-cli run scripts/dump-songmap.mjs [songKey1] [songKey2] ...
 *   # または: node --experimental-vm-modules scripts/dump-songmap.mjs
 *   # 引数省略時は shutter-chance, takeover, sekai-saigo の3曲を処理
 *
 * 注意: playwright が node_modules にある場合は以下で実行:
 *   node scripts/dump-songmap.mjs
 */

import { chromium } from "playwright";
import { writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_URL = "http://localhost:5173";
const OUT_DIR = join(__dirname, "..", "docs", "analysis");

// デフォルト対象曲
const DEFAULT_SONGS = ["shutter-chance", "takeover", "sekai-saigo"];

const songKeys = process.argv.slice(2).length > 0
  ? process.argv.slice(2)
  : DEFAULT_SONGS;

async function dumpSong(page, key) {
  console.log(`[dump] ${key} をロード中...`);
  await page.goto(`${BASE_URL}/analysis.html?song=${key}`);

  // document.title === "DUMP_READY" になるまで最大120秒待機
  try {
    await page.waitForFunction(
      () => document.title === "DUMP_READY",
      { timeout: 120_000 }
    );
  } catch (err) {
    const title = await page.title();
    const status = await page.$eval("#status", el => el.textContent).catch(() => "(status not found)");
    throw new Error(`タイムアウト: ${key} (title="${title}", status="${status}")`);
  }

  const songMap = await page.evaluate(() => window.__songMap);
  if (!songMap) throw new Error(`__songMap が取得できませんでした: ${key}`);

  const outPath = join(OUT_DIR, `${key}.songmap.json`);
  await writeFile(outPath, JSON.stringify(songMap, null, 2), "utf8");

  const { beats, segments, phrases, song } = songMap;
  console.log(
    `[done] ${key}: beats=${beats.length}, chorus=${segments.length}, phrases=${phrases.length}, duration=${song.durationSec}s`
  );
  console.log(`       保存先: ${outPath}`);
  return songMap;
}

(async () => {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // コンソールログをターミナルに転送
  page.on("console", msg => {
    const type = msg.type();
    if (type === "error") console.error(`[browser:error] ${msg.text()}`);
    else if (type !== "log") console.log(`[browser:${type}] ${msg.text()}`);
  });

  // 未捕捉例外（console に出ないためここで捕捉する）
  page.on("pageerror", err => {
    console.error(`[browser:pageerror] ${err.message}\n${err.stack ?? ""}`);
  });

  const results = {};
  for (const key of songKeys) {
    try {
      results[key] = await dumpSong(page, key);
    } catch (err) {
      console.error(`[error] ${key}: ${err.message}`);
    }
  }

  await browser.close();

  console.log("\n=== サマリー ===");
  for (const [key, sm] of Object.entries(results)) {
    console.log(
      `${sm.song.name} (${key}): beats=${sm.beats.length}, chorus=${sm.segments.length}, phrases=${sm.phrases.length}, ${sm.song.durationSec}s`
    );
  }
})();
