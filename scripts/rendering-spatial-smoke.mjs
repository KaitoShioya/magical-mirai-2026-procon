// 空間品質ゲート（Issue #100）の構造スモーク。Playwright で空間品質診断ページ（spatial.html）を既定の起動
// （反射有効・ブルーム有効）で開き、診断グローバル window.__spatialReady / __spatialState を読み、
// 診断ページが例外なく起動し、構造的事実（描画文脈が得られる・地形読み込み完了・水面供給元が地形メッシュ・
// 反射有効・ブルーム有効）が成立することだけを確認する。これは空間品質そのものの保証ではなく、診断ページの
// 健全性確認である。空間品質ゲート本体（奥行きの手がかり・反射の整合・ブルームの存在の画素判定）は手元の
// 実機GPU環境で scripts/spatial-quality.mjs として動かす。
// 反射無効（refl=0）では起動しない（反射無効では構造的事実の反射有効が成り立たないため）。
// 接続先サーバは環境変数 BASE で指定する（既定 http://127.0.0.1:4173）。
//   PowerShell:  $env:BASE='http://127.0.0.1:4173'; node scripts/rendering-spatial-smoke.mjs
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
      // 既定の起動（refl・bloom を与えない）。既定は反射有効・ブルーム有効。
      await page.goto(BASE + "/spatial.html", { waitUntil: "load", timeout: 2000 });
      connected = true;
      break;
    } catch {
      await page.waitForTimeout(500);
    }
  }
  if (!connected) {
    throw new Error("プレビューサーバへ接続できませんでした: " + BASE);
  }

  // 地形読み込みの確定後に真を返す準備完了フックを待つ（関数として存在し、かつ呼び出した戻り値が真）。
  await page.waitForFunction(
    () => typeof window.__spatialReady === "function" && window.__spatialReady(),
    undefined,
    { timeout: 30000 }
  );

  // __spatialState は run() 内で __spatialReady より先に取り付けるため、準備完了後は必ず存在する。
  const state = await page.evaluate(() =>
    typeof window.__spatialState === "function" ? window.__spatialState() : null
  );

  if (!state) {
    fail("window.__spatialState が取得できませんでした");
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
    if (state.reflectionEnabled && state.reflectionResolution > 0) {
      console.log(
        `確認: 平面反射が有効です（reflectionEnabled=true, 解像度=${state.reflectionResolution}）`
      );
    } else {
      fail("平面反射が有効ではありません（reflectionEnabled が偽、または反射解像度が0）");
    }
    if (state.bloomEnabled && state.bloomStrength > 0 && state.bloomOutputPassEnabled) {
      console.log("確認: ブルームが有効です（有効・強さ・最終出力パスが成立）");
    } else {
      fail("ブルームが有効ではありません（有効・強さ・最終出力パスのいずれかが偽）");
    }
    if (
      state.poses &&
      Array.isArray(state.poses.far.projected) &&
      state.poses.far.projected.length === 8
    ) {
      console.log("確認: 3姿勢の射影画面座標が公開されています（固定発光点8点）");
    } else {
      fail("3姿勢の射影画面座標が取得できません");
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
  console.error("空間品質の構造スモーク: 失敗");
  process.exit(1);
} else {
  console.log("空間品質の構造スモーク: 成功");
}
