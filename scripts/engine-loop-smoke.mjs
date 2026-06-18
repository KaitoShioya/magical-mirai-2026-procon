// エンジンループの実ブラウザ補助確認: Playwright で診断グローバル window.__engineState を読み、
// 起動・画面遷移を通じてゲーム時刻が後退せず、超過回数が増えないことを確かめる。
// タブ非表示・表示の決定的検証は単体テスト（src/engine/loop.test.ts）が担い、本スクリプトは全体の健全性のみを見る。
// 接続先サーバは環境変数 BASE で指定する（既定 http://127.0.0.1:4173）。診断モードのため /?smoke=1 を開く。
//   PowerShell:  $env:BASE='http://127.0.0.1:4173'; node scripts/engine-loop-smoke.mjs
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:4173";

const errors = [];
let failed = false;

function fail(message) {
  failed = true;
  console.error("失敗: " + message);
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
page.on("pageerror", (error) => errors.push("ページ例外: " + error.message));
page.on("console", (message) => {
  if (message.type() === "error") {
    errors.push("コンソールエラー: " + message.text());
  }
});

async function readEngineState() {
  return page.evaluate(() =>
    typeof window.__engineState === "function" ? window.__engineState() : null
  );
}

try {
  let connected = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await page.goto(BASE + "/?smoke=1", { waitUntil: "load", timeout: 2000 });
      connected = true;
      break;
    } catch {
      await page.waitForTimeout(500);
    }
  }
  if (!connected) {
    throw new Error("プレビューサーバへ接続できませんでした: " + BASE);
  }

  // 題名画面の表示を待つ。
  await page.waitForFunction(
    () => document.querySelectorAll('[data-screen="title"]').length === 1,
    undefined,
    { timeout: 15000 }
  );

  // 診断モードでエンジン状態アクセサが公開されている。
  const first = await readEngineState();
  if (!first) {
    fail("window.__engineState が取得できませんでした");
  } else {
    console.log("確認: __engineState を取得できた");
    // 一定時間サンプリングし、ゲーム時刻が後退せず超過が増えないことを確かめる。
    let previousGameTimeMs = first.gameTimeMs;
    let maxOverflow = first.overflowCount;
    for (let i = 0; i < 10; i += 1) {
      await page.waitForTimeout(100);
      const state = await readEngineState();
      if (!state) {
        fail("サンプリング中に __engineState が取得できませんでした");
        break;
      }
      if (state.gameTimeMs < previousGameTimeMs) {
        fail(`ゲーム時刻が後退しました: ${previousGameTimeMs} → ${state.gameTimeMs}`);
      }
      previousGameTimeMs = state.gameTimeMs;
      if (state.overflowCount > maxOverflow) {
        maxOverflow = state.overflowCount;
      }
    }
    if (maxOverflow > 0) {
      fail(`超過回数が増えました（通常は0であるべき）: ${maxOverflow}`);
    } else {
      console.log("確認: ゲーム時刻は後退せず、超過回数は0のまま");
    }
  }

  // 通常構成（?smoke=1 なし）では診断アクセサが公開されていない。
  await page.goto(BASE + "/", { waitUntil: "load" });
  const absent = await page.evaluate(() => typeof window.__engineState === "undefined");
  if (!absent) {
    fail("通常構成（?smoke=1 なし）で window.__engineState が公開されています");
  } else {
    console.log("確認: 通常構成では診断アクセサが未公開");
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
  console.error("エンジンループ補助確認: 失敗");
  process.exit(1);
} else {
  console.log("エンジンループ補助確認: 成功");
}
