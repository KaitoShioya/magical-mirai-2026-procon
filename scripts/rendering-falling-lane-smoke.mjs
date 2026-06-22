// 判定UI 落下式レーン（Issue #57）の受け入れ基準のブラウザ統合検証。
// Playwright で診断ページ（falling-lane.html）を開き、副作用の無い問い合わせ window.__fallingLaneProbe の数値で
// 次を確かめる。最初の可視ノーツに依存せず、識別子で取り出す特定ノーツで判定する。
//   (a) ある時刻で対象ノーツが目標線より上に存在する。
//   (b) ゲーム時刻を進めると同一ノーツの縦位置が下がり、その低下量が経過時間に比例する（落下速度一定）。
//   (c) ゲーム時刻を対象ノーツの実時刻に合わせると、そのノーツの縦位置が目標線の値に一致する。
//   (d) 円板は中心が目標線に一致した時点で消える（中心が線へ達する直前は可視で線より上、達した直後は不可視で線の下に残らない）。
//   (e) 対象ノーツに割り当てた数字が音程番号（slotIndex）と一致する。
//   (f) 表示物が2次元層へ載っており、横位置が画面右側で画面外へはみ出さず、可視ノーツがレーンの縦範囲に収まる。
//   (g) ページ例外・コンソールエラーが無い。
// 採用理由を先に述べる。ソフトウェア描画でも安定する構造的事実を、画素サンプルでなく問い合わせの数値で検査する。
// 接続先サーバは環境変数 BASE で指定する（既定 http://127.0.0.1:4173）。
//   PowerShell:  $env:BASE='http://127.0.0.1:4173'; node scripts/rendering-falling-lane-smoke.mjs
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:4173";
const VIEWPORT = { width: 1000, height: 800 };

let failed = false;
function fail(message) {
  failed = true;
  console.error("失敗: " + message);
}
function ok(message) {
  console.log("確認: " + message);
}

// 落下位置の許容誤差。落下位置は線形写像のため理論上は厳密だが、ブラウザと Node のあいだの数値の往復ぶんとして
// 微小な許容を置く。レーンの縦範囲（約2単位）に対し十分小さい 1e-6 とする。
const Y_TOLERANCE = 1e-6;

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

function findNote(state, id) {
  return state.notes.find((note) => note.id === id);
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

  if (!(await gotoWithRetry(page, BASE + "/falling-lane.html"))) {
    fail("プレビューサーバへ接続できませんでした: " + BASE + "/falling-lane.html");
    await context.close();
    return;
  }
  await page.waitForFunction(() => typeof window.__fallingLaneProbe === "function", undefined, {
    timeout: 15000,
  });
  // 横位置は描画反復の更新で確定するため、最初のフレームが回るのを待つ。
  await page.waitForFunction(() => window.__fallingLaneProbe(0).groupX > 0, undefined, {
    timeout: 15000,
  });

  const probe = async (gameTimeMs) =>
    page.evaluate((g) => window.__fallingLaneProbe(g), gameTimeMs);

  // 対象ノーツ probe-a（実時刻1000ミリ秒・音程番号3）。
  const A_TIME = 1000;
  const A_SLOT = 3;

  const state0 = await probe(0);

  // (a) ある時刻で対象ノーツが目標線より上に存在する。
  const a0 = findNote(state0, "probe-a");
  if (a0 && a0.y > state0.targetY + Y_TOLERANCE && a0.y <= state0.topY + Y_TOLERANCE) {
    ok(`時刻0で対象ノーツが目標線より上のレーン内に存在する（y=${a0.y.toFixed(4)}）`);
  } else {
    fail(`時刻0で対象ノーツが目標線より上に存在しない（${JSON.stringify(a0)}）`);
  }

  // (b) ゲーム時刻を進めると縦位置が下がり、低下量が経過時間に比例する（落下速度一定）。
  const yAt = async (g) => {
    const note = findNote(await probe(g), "probe-a");
    return note ? note.y : null;
  };
  const y0 = await yAt(0);
  const y300 = await yAt(300);
  const y600 = await yAt(600);
  if (y0 !== null && y300 !== null && y600 !== null && y0 > y300 && y300 > y600) {
    const drop1 = y0 - y300;
    const drop2 = y300 - y600;
    if (Math.abs(drop1 - drop2) <= Y_TOLERANCE) {
      ok(`落下が一定速度（300ミリ秒ぶんの低下が等しい: ${drop1.toFixed(6)} と ${drop2.toFixed(6)}）`);
    } else {
      fail(`落下速度が一定でない（低下量 ${drop1} と ${drop2}）`);
    }
  } else {
    fail(`ゲーム時刻を進めても縦位置が単調に下がらない（${y0}, ${y300}, ${y600}）`);
  }

  // (c) ゲーム時刻を対象ノーツの実時刻に合わせると縦位置が目標線に一致する。
  const stateAtA = await probe(A_TIME);
  const aAtTarget = findNote(stateAtA, "probe-a");
  if (aAtTarget && Math.abs(aAtTarget.y - stateAtA.targetY) <= Y_TOLERANCE) {
    ok(`実時刻で対象ノーツが目標線に一致する（y=${aAtTarget.y.toFixed(6)} 目標線=${stateAtA.targetY.toFixed(6)}）`);
  } else {
    fail(`実時刻で対象ノーツが目標線に一致しない（${JSON.stringify(aAtTarget)}）`);
  }

  // (d) 円板は中心が目標線に一致した時点で消える。中心が線へ達する直前は可視で線より上、達した直後は不可視。
  const beforeReach = await probe(A_TIME - 50);
  const aBefore = findNote(beforeReach, "probe-a");
  if (aBefore && aBefore.y > beforeReach.targetY + Y_TOLERANCE) {
    ok(`中心が目標線へ達する直前は可視で線より上にある（y=${aBefore.y.toFixed(4)}）`);
  } else {
    fail(`中心が目標線へ達する直前に可視でないか線より上にない（${JSON.stringify(aBefore)}）`);
  }
  const afterReach = await probe(A_TIME + 50);
  const aAfter = findNote(afterReach, "probe-a");
  if (!aAfter) {
    ok("中心が目標線を越えた直後は対象ノーツが不可視になる（線の下に残らない）");
  } else {
    fail(`中心が目標線を越えても対象ノーツが線の下に残る（${JSON.stringify(aAfter)}）`);
  }

  // (e) 割り当てた数字が音程番号と一致する。probe-a（番号3）と probe-b（番号7）で確かめる。
  const aDigit = findNote(stateAtA, "probe-a");
  const bDigit = findNote(stateAtA, "probe-b");
  if (aDigit && aDigit.digit === A_SLOT && bDigit && bDigit.digit === 7) {
    ok(`割り当てた数字が音程番号と一致する（probe-a=${aDigit.digit} probe-b=${bDigit.digit}）`);
  } else {
    fail(`割り当てた数字が音程番号と一致しない（${JSON.stringify(aDigit)} / ${JSON.stringify(bDigit)}）`);
  }

  // (f) 表示物が2次元層へ載り、横位置が画面右側で画面外へはみ出さず、可視ノーツがレーンの縦範囲に収まる。
  if (stateAtA.overlayObjectCount >= 1) {
    ok(`落下式レーンが2次元層へ載っている（表示物数 ${stateAtA.overlayObjectCount}）`);
  } else {
    fail("落下式レーンが2次元層へ載っていない");
  }
  if (stateAtA.groupX > 0 && stateAtA.groupX < stateAtA.aspect) {
    ok(`横位置が画面右側で画面外へはみ出さない（groupX=${stateAtA.groupX.toFixed(3)} aspect=${stateAtA.aspect.toFixed(3)}）`);
  } else {
    fail(`横位置が画面右側に収まらない（groupX=${stateAtA.groupX} aspect=${stateAtA.aspect}）`);
  }
  // 可視ノーツの縦位置が、目標線（最も下）から上端までのレーン縦範囲に収まる（円板は線の下に残らない）。
  const lowerLimit = stateAtA.targetY - Y_TOLERANCE;
  const upperLimit = stateAtA.topY + Y_TOLERANCE;
  const outOfRange = stateAtA.notes.filter((note) => note.y < lowerLimit || note.y > upperLimit);
  if (outOfRange.length === 0) {
    ok("可視ノーツがレーンの縦範囲に収まる");
  } else {
    fail(`レーンの縦範囲から外れる可視ノーツがある（${JSON.stringify(outOfRange)}）`);
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
  console.error("判定UI 落下式レーンの受け入れ検証: 失敗");
  process.exit(1);
} else {
  console.log("判定UI 落下式レーンの受け入れ検証: 成功");
}
