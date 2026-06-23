// 自己ベスト履歴（Issue #67）の受け入れ基準のブラウザ統合検証。
// Playwright で診断ページ（score-history.html）を開き、操作フック window.__scoreHistoryControl で決定的な得点列を
// 投入し、副作用の無い問い合わせ window.__scoreHistoryProbe の数値で次を確かめる。
//   (a) 記録が無い初期状態で記録なし表示が出る。
//   (b) 複数回の記録後、自己ベスト見出しの総合得点が投入した最大値に一致する。
//   (c) より低い得点を後から記録しても自己ベストが下がらない。
//   (d) 棒の本数が「投入件数と上限の小さい方」に一致する。
//   (e) 上限を超える件数を投入しても自己ベストが残る。
//   (f) 自己ベストと総合得点かつ記録時刻が一致する棒がちょうど1本強調される。
//   (g) ページ例外・コンソールエラーが無い。
// 採用理由を先に述べる。ソフトウェア描画でも安定する構造的事実（文書要素の有無・本数・数値）を、画素サンプルでなく
// 問い合わせの数値で検査する。
// 接続先サーバは環境変数 BASE で指定する（既定 http://127.0.0.1:4173）。
//   PowerShell:  $env:BASE='http://127.0.0.1:4173'; node scripts/score-history-smoke.mjs
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:4173";
const VIEWPORT = { width: 1000, height: 800 };

// 直近履歴の上限。保存層の SCORE_HISTORY_RECENT_MAX と一致させる（上限超過の退避を検査するため）。
const RECENT_MAX = 50;

let failed = false;
function fail(message) {
  failed = true;
  console.error("失敗: " + message);
}
function ok(message) {
  console.log("確認: " + message);
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

async function run() {
  const errors = [];
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push("ページ例外: " + error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push("コンソールエラー: " + message.text());
    }
  });

  if (!(await gotoWithRetry(page, BASE + "/score-history.html"))) {
    fail("プレビューサーバへ接続できませんでした: " + BASE + "/score-history.html");
    await context.close();
    return;
  }
  await page.waitForFunction(
    () =>
      typeof window.__scoreHistoryProbe === "function" &&
      typeof window.__scoreHistoryControl === "object",
    undefined,
    { timeout: 15000 }
  );

  const reset = () => page.evaluate(() => window.__scoreHistoryControl.reset());
  const record = (totalScore, recordedAtMs) =>
    page.evaluate((args) => window.__scoreHistoryControl.record(args[0], args[1]), [
      totalScore,
      recordedAtMs,
    ]);
  const probe = () => page.evaluate(() => window.__scoreHistoryProbe());

  // (a) 記録が無い初期状態で記録なし表示が出る。
  await reset();
  const empty = await probe();
  if (empty.hasEmpty && empty.bestScore === null && empty.barCount === 0) {
    ok("記録が無い初期状態で記録なし表示が出る");
  } else {
    fail(`初期状態が記録なしでない（${JSON.stringify(empty)}）`);
  }

  // (b)(d)(f) 複数回の記録後、自己ベストが最大値・棒の本数が件数・自己ベスト棒が1本。
  await record(100, 1000);
  await record(300, 2000);
  await record(200, 3000);
  const afterThree = await probe();
  if (afterThree.bestScore === 300) {
    ok("複数回の記録後、自己ベストが投入した最大値に一致する");
  } else {
    fail(`自己ベストが最大値でない（${JSON.stringify(afterThree)}）`);
  }
  if (afterThree.barCount === 3) {
    ok("棒の本数が投入件数に一致する");
  } else {
    fail(`棒の本数が投入件数でない（${JSON.stringify(afterThree)}）`);
  }
  if (afterThree.bestBarCount === 1) {
    ok("自己ベストと一致する棒がちょうど1本強調される");
  } else {
    fail(`自己ベストの強調棒がちょうど1本でない（${JSON.stringify(afterThree)}）`);
  }

  // (c) より低い得点を後から記録しても自己ベストが下がらない。
  await record(50, 4000);
  const afterLower = await probe();
  if (afterLower.bestScore === 300) {
    ok("より低い得点を記録しても自己ベストが下がらない");
  } else {
    fail(`低得点の記録で自己ベストが変わった（${JSON.stringify(afterLower)}）`);
  }

  // (e)(d) 上限を超える件数を投入しても自己ベストが残り、棒は上限で頭打ちになる。
  await reset();
  await record(9999, 500); // 退避させる対象の自己ベスト。
  for (let i = 0; i < RECENT_MAX + 5; i += 1) {
    await record(10, 1000 + i);
  }
  const afterOverflow = await probe();
  if (afterOverflow.bestScore === 9999) {
    ok("上限を超える件数を投入しても自己ベストが残る");
  } else {
    fail(`上限超過で自己ベストが失われた（${JSON.stringify(afterOverflow)}）`);
  }
  if (afterOverflow.barCount === RECENT_MAX) {
    ok("棒の本数が上限で頭打ちになる");
  } else {
    fail(`棒の本数が上限に一致しない（${JSON.stringify(afterOverflow)}）`);
  }
  // 自己ベスト 9999 は直近履歴から退避しているため、強調棒は無い（best が recent に無い場合の表示）。
  if (afterOverflow.bestBarCount === 0) {
    ok("自己ベストが直近履歴から退避したときは強調棒が無い");
  } else {
    fail(`退避後も強調棒が残る（${JSON.stringify(afterOverflow)}）`);
  }

  // (g) ページ例外・コンソールエラーが無い。
  if (errors.length > 0) {
    fail("診断ページでエラーを検出しました:\n" + errors.join("\n"));
  }
  await context.close();
}

try {
  await run();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
} finally {
  await browser.close();
}

if (failed) {
  console.error("自己ベスト履歴の受け入れ検証: 失敗");
  process.exit(1);
} else {
  console.log("自己ベスト履歴の受け入れ検証: 成功");
}
