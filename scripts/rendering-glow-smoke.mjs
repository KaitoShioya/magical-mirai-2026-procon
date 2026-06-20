// 発光点（Issue #10）の受け入れ基準「300個で描画命令が5未満」の実機検証。
// Playwright で発光点診断ページ（rendering.html）を開き、診断グローバル window.__glowState を読み、
// 発光点のみのシーンを描いた直後の描画命令の回数（drawCalls）と三角形の数（triangles）を確かめる。
// 色の正確さの決定的検証は単体テスト（src/rendering/entities/glowPoints.test.ts）が担い、本スクリプトは
// 単一の InstancedMesh が実ブラウザで1回の描画命令にまとまることを確かめる。
// 接続先サーバは環境変数 BASE で指定する（既定 http://127.0.0.1:4173）。
//   PowerShell:  $env:BASE='http://127.0.0.1:4173'; node scripts/rendering-glow-smoke.mjs
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:4173";
// 受け入れ基準の上限。判定方法の根拠を先に述べる。single InstancedMesh は three.js が1回の
// インスタンス描画命令で描くため、発光点のみのシーンの描画命令は1回になる。基準が掲げる「5未満」は
// 余裕を持った上限であり、この値で合否を判定する。
const DRAW_CALL_LIMIT = 5;

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
      await page.goto(BASE + "/rendering.html", { waitUntil: "load", timeout: 2000 });
      connected = true;
      break;
    } catch {
      await page.waitForTimeout(500);
    }
  }
  if (!connected) {
    throw new Error("プレビューサーバへ接続できませんでした: " + BASE);
  }

  await page.waitForFunction(() => typeof window.__glowState === "function", undefined, {
    timeout: 15000,
  });

  const state = await page.evaluate(() =>
    typeof window.__glowState === "function" ? window.__glowState() : null
  );

  if (!state) {
    fail("window.__glowState が取得できませんでした");
  } else {
    if (state.drawCalls < DRAW_CALL_LIMIT) {
      console.log(`確認: 発光点300個の描画命令は ${state.drawCalls} 回（上限 ${DRAW_CALL_LIMIT} 未満）`);
    } else {
      fail(`描画命令が ${state.drawCalls} 回です（期待: ${DRAW_CALL_LIMIT} 未満）`);
    }
    // 三角形が描かれたことを確かめる。判定方法の根拠を先に述べる。描画命令が0回でも値は0未満には
    // ならないため、発光点が実際に描かれたことは三角形の数が0より大きいことで確かめる。
    if (state.triangles > 0) {
      console.log(`確認: 発光点が実際に描かれた（三角形 ${state.triangles} 個）`);
    } else {
      fail(`三角形が ${state.triangles} 個です（期待: 0より大きい）`);
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
  console.error("発光点描画の受け入れ検証: 失敗");
  process.exit(1);
} else {
  console.log("発光点描画の受け入れ検証: 成功");
}
