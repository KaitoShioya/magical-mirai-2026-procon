// 画面拡大・減衰揺れ（Issue #76）の受け入れ基準のうち、ブラウザ統合に関わる挙動の実機検証。
// Playwright で診断ページ（screen-shake.html）を開き、次を確かめる。
//   1. 決定的評価 window.__screenShakeProbe で、拡大が時定数で1/eへ下がること、揺れの移動量が画面外余白の
//      内側に収まること、十分時間が経つと恒等へ吸着することを、時間非依存に判定する。
//   2. 実時間で当てている canvas の表示変換を getComputedStyle と DOMMatrix で読み、拍ごとに倍率が1を超え
//      （演出が起きている）、変換が回転・剪断を含まない一様拡大＋平行移動であり、移動量が画面外余白の内側に
//      収まること（隙間なし）を、ブラウザの実挙動で裏取りする。
//   3. 「動きを減らす」設定では恒等のまま動かないこと。
//   4. 本編アプリ（?smoke=1）では、拍時刻配列が無いため変換が恒等のまま無作用で、未捕捉例外が無いこと。
// 接続先サーバは環境変数 BASE で指定する（既定 http://127.0.0.1:4173）。
//   PowerShell:  $env:BASE='http://127.0.0.1:4173'; node scripts/screen-shake-smoke.mjs
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:4173";
const VIEWPORT = { width: 390, height: 844 };

let failed = false;
function fail(message) {
  failed = true;
  console.error("失敗: " + message);
}
function ok(message) {
  console.log("確認: " + message);
}

// 数値の近さの許容。拡大量は4桁・移動量は1桁へ丸めるため、比較は緩めの許容で行う。
function approx(actual, expected, tolerance) {
  return Math.abs(actual - expected) <= tolerance;
}

async function gotoWithRetry(page, url) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: "load", timeout: 2000 });
      return true;
    } catch {
      await page.waitForTimeout(500);
    }
  }
  return false;
}

const browser = await chromium.launch();

// ---- 1・2・3: 診断ページ（screen-shake.html） ----
async function runDiagnosticChecks() {
  const errors = [];
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push("ページ例外: " + error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push("コンソールエラー: " + message.text());
    }
  });

  if (!(await gotoWithRetry(page, BASE + "/screen-shake.html"))) {
    fail("プレビューサーバへ接続できませんでした: " + BASE + "/screen-shake.html");
    await context.close();
    return;
  }
  await page.waitForFunction(() => typeof window.__screenShakeProbe === "function", undefined, {
    timeout: 15000,
  });

  // 1. 決定的評価。既定の画面寸法は1000×1000（診断ページの固定値）。
  const probeWidth = 1000;
  const probeHeight = 1000;
  const probe = async (elapsedMs) => page.evaluate((e) => window.__screenShakeProbe(e), elapsedMs);

  const at0 = await probe(0);
  const at250 = await probe(250);
  const at2000 = await probe(2000);

  // 拡大量0.12（倍率1.12）で立ち上がる。
  if (approx(at0.scale, 1.12, 0.001)) {
    ok(`拡大の立ち上がりが倍率1.12（実測 ${at0.scale}）`);
  } else {
    fail(`拡大の立ち上がりが倍率1.12でない（実測 ${at0.scale}）`);
  }
  // 時定数250ミリ秒で 1/e へ下がる。
  const decayRatio = (at250.scale - 1) / (at0.scale - 1);
  if (approx(decayRatio, Math.exp(-1), 0.01)) {
    ok(`時定数で拡大が1/eへ下がる（実測比 ${decayRatio.toFixed(4)}、期待 ${Math.exp(-1).toFixed(4)}）`);
  } else {
    fail(`時定数で拡大が1/eへ下がらない（実測比 ${decayRatio.toFixed(4)}）`);
  }
  // 十分時間が経つと恒等へ吸着する。
  if (at2000.scale === 1 && at2000.offsetX === 0 && at2000.offsetY === 0) {
    ok("拡大がほぼ消えた時刻で恒等へ吸着する");
  } else {
    fail(`恒等へ吸着しない（実測 ${JSON.stringify(at2000)}）`);
  }
  // 余白内拘束（決定的評価）。
  let probeBoundViolations = 0;
  for (let e = 0; e <= 240; e += 20) {
    const t = await probe(e);
    const marginX = ((t.scale - 1) / 2) * probeWidth;
    const marginY = ((t.scale - 1) / 2) * probeHeight;
    if (Math.abs(t.offsetX) > marginX + 1e-9 || Math.abs(t.offsetY) > marginY + 1e-9) {
      probeBoundViolations += 1;
    }
  }
  if (probeBoundViolations === 0) {
    ok("決定的評価で揺れの移動量が常に画面外余白の内側に収まる");
  } else {
    fail(`決定的評価で余白内拘束を破る標本が ${probeBoundViolations} 個ある`);
  }

  // 2. 実時間で当てている canvas の表示変換を読む。
  const readMatrix = async () =>
    page.evaluate(() => {
      const canvas = document.querySelector("#app canvas");
      if (!canvas) {
        return null;
      }
      const value = getComputedStyle(canvas).transform;
      const m = value && value !== "none" ? new DOMMatrix(value) : new DOMMatrix();
      return {
        a: m.a,
        b: m.b,
        c: m.c,
        d: m.d,
        e: m.e,
        f: m.f,
        width: canvas.clientWidth,
        height: canvas.clientHeight,
      };
    });

  let pulseCount = 0;
  let semanticViolations = 0;
  let boundViolations = 0;
  for (let i = 0; i < 40; i += 1) {
    const m = await readMatrix();
    if (m && m.a > 1.0001) {
      pulseCount += 1;
      // 回転・剪断が無く一様拡大であること。
      if (Math.abs(m.b) > 1e-6 || Math.abs(m.c) > 1e-6 || Math.abs(m.a - m.d) > 1e-6) {
        semanticViolations += 1;
      }
      // 移動量が画面外余白の内側に収まること（隙間なし）。移動量の丸めぶん（0.1画素）の余裕を見る。
      const marginX = ((m.a - 1) / 2) * m.width;
      const marginY = ((m.d - 1) / 2) * m.height;
      if (Math.abs(m.e) > marginX + 0.2 || Math.abs(m.f) > marginY + 0.2) {
        boundViolations += 1;
      }
    }
    await page.waitForTimeout(40);
  }
  if (pulseCount > 0) {
    ok(`実時間で拍ごとに画面が拡大した（拡大を観測した標本 ${pulseCount} 個）`);
  } else {
    fail("実時間で一度も画面が拡大しなかった（拍に反応していない）");
  }
  if (semanticViolations === 0) {
    ok("適用変換が回転・剪断を含まない一様拡大＋平行移動である（DOMMatrix で確認）");
  } else {
    fail(`適用変換が一様拡大＋平行移動でない標本が ${semanticViolations} 個ある`);
  }
  if (boundViolations === 0) {
    ok("実時間でも揺れの移動量が画面外余白の内側に収まる（隙間なし）");
  } else {
    fail(`実時間で余白内拘束を破る標本が ${boundViolations} 個ある`);
  }

  if (errors.length > 0) {
    fail("診断ページでエラーを検出しました:\n" + errors.join("\n"));
  }
  await context.close();
}

// ---- 3: 動きを減らす設定では恒等 ----
async function runReducedMotionCheck() {
  const context = await browser.newContext({ viewport: VIEWPORT, reducedMotion: "reduce" });
  const page = await context.newPage();
  if (!(await gotoWithRetry(page, BASE + "/screen-shake.html"))) {
    fail("動きを減らす設定の確認でページへ接続できませんでした");
    await context.close();
    return;
  }
  await page.waitForFunction(() => typeof window.__screenShakeState === "function", undefined, {
    timeout: 15000,
  });
  let nonIdentity = 0;
  for (let i = 0; i < 20; i += 1) {
    const state = await page.evaluate(() => window.__screenShakeState());
    if (!state.reducedMotion) {
      fail("動きを減らす設定が反映されていない（reducedMotion が偽）");
      break;
    }
    const t = state.transform;
    if (t.scale !== 1 || t.offsetX !== 0 || t.offsetY !== 0) {
      nonIdentity += 1;
    }
    await page.waitForTimeout(50);
  }
  if (nonIdentity === 0) {
    ok("動きを減らす設定では変換が恒等のまま動かない");
  } else {
    fail(`動きを減らす設定でも恒等でない標本が ${nonIdentity} 個ある`);
  }
  await context.close();
}

// ---- 4: 本編アプリ（?smoke=1）の無作用確認 ----
async function runMainAppInertCheck() {
  const errors = [];
  const pageErrors = [];
  const context = await browser.newContext({ viewport: VIEWPORT });
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
  if (!(await gotoWithRetry(page, BASE + "/?smoke=1"))) {
    fail("本編アプリ（?smoke=1）へ接続できませんでした");
    await context.close();
    return;
  }
  await page.waitForFunction(() => typeof window.__renderState === "function", undefined, {
    timeout: 15000,
  });
  let nonIdentity = 0;
  for (let i = 0; i < 30; i += 1) {
    const t = await page.evaluate(() => window.__renderState().screenTransform);
    if (t.scale !== 1 || t.offsetX !== 0 || t.offsetY !== 0) {
      nonIdentity += 1;
    }
    await page.waitForTimeout(50);
  }
  if (nonIdentity === 0) {
    ok("本編アプリは拍時刻配列が無いため変換が恒等のまま無作用である");
  } else {
    fail(`本編アプリで変換が恒等でない標本が ${nonIdentity} 個ある（防御結線が無作用でない）`);
  }
  if (pageErrors.length > 0) {
    fail("本編アプリで未捕捉例外を検出しました:\n" + pageErrors.join("\n"));
  }
  await context.close();
}

try {
  await runDiagnosticChecks();
  await runReducedMotionCheck();
  await runMainAppInertCheck();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
} finally {
  await browser.close();
}

if (failed) {
  console.error("画面拡大・減衰揺れの受け入れ検証: 失敗");
  process.exit(1);
} else {
  console.log("画面拡大・減衰揺れの受け入れ検証: 成功");
}
