// 舞台土台モデル（Issue #105）の受け入れ検証。Playwright で舞台土台診断ページ（stage.html）を開き、
// 診断グローバル window.__stageState を読み、本番と同じ経路で舞台土台が読み込めることを確かめる。
// 地形が読み込めたこと（stageTerrainStatus=loaded）、水面が土台モデルの水面領域から作られたこと
// （waterSource=stage-mesh）、平面反射が有効なこと（reflectionEnabled）、2次元層が存在すること
// （層合成が地形追加後も保たれる）を判定する。
// 接続先サーバは環境変数 BASE で指定する（既定 http://127.0.0.1:4173）。
//   PowerShell:  $env:BASE='http://127.0.0.1:4173'; node scripts/rendering-stage-smoke.mjs
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

try {
  let connected = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await page.goto(BASE + "/stage.html", { waitUntil: "load", timeout: 2000 });
      connected = true;
      break;
    } catch {
      await page.waitForTimeout(500);
    }
  }
  if (!connected) {
    throw new Error("プレビューサーバへ接続できませんでした: " + BASE);
  }

  await page.waitForFunction(() => typeof window.__stageState === "function", undefined, {
    timeout: 20000,
  });

  const state = await page.evaluate(() =>
    typeof window.__stageState === "function" ? window.__stageState() : null
  );

  if (!state) {
    fail("window.__stageState が取得できませんでした");
  } else if (!state.webglAvailable) {
    fail("WebGL を利用できませんでした（webglAvailable が偽）");
  } else {
    if (state.stageTerrainStatus === "loaded") {
      console.log("確認: 舞台土台を読み込めました（stageTerrainStatus=loaded）");
    } else {
      fail(
        `舞台土台を読み込めませんでした（stageTerrainStatus=${state.stageTerrainStatus}` +
          (state.stageTerrainError ? `, error=${state.stageTerrainError}` : "") +
          "）"
      );
    }
    if (state.waterSource === "stage-mesh") {
      console.log("確認: 水面が土台モデルの水面領域から作られました（waterSource=stage-mesh）");
    } else {
      fail(`水面が土台モデルから作られていません（waterSource=${state.waterSource}）`);
    }
    if (state.reflectionEnabled) {
      console.log("確認: 平面反射が有効です（reflectionEnabled=true）");
    } else {
      fail("平面反射が有効ではありません（reflectionEnabled=false）");
    }
    if (typeof state.overlayObjectCount === "number") {
      console.log(`確認: 2次元層が存在します（overlayObjectCount=${state.overlayObjectCount}）`);
    } else {
      fail("2次元層が存在しません（overlayObjectCount が null）");
    }
    if (
      state.waterRegion &&
      state.waterRegion.width > 0 &&
      state.waterRegion.depth > 0
    ) {
      console.log(
        `確認: 水面領域の寸法が正です（幅 ${state.waterRegion.width.toFixed(1)} × 奥行き ${state.waterRegion.depth.toFixed(1)}）`
      );
    } else {
      fail("水面領域の寸法が取得できないか0以下です");
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
  console.error("舞台土台の受け入れ検証: 失敗");
  process.exit(1);
} else {
  console.log("舞台土台の受け入れ検証: 成功");
}
