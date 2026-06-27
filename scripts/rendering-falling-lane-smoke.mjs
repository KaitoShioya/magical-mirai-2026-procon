// 判定UI 落下式レーン（Issue #57・Issue #199）の受け入れ基準のブラウザ統合検証。
// Playwright で診断ページ（falling-lane.html）を開き、副作用の無い問い合わせ window.__fallingLaneProbe の数値で
// 次を確かめる。最初の可視ノーツに依存せず、識別子で取り出す特定ノーツで判定する。
//   (a) ある時刻で対象ノーツが自分のスロットの線分（消滅高さ）より上に存在する。
//   (b) ゲーム時刻を進めると同一ノーツの縦位置が下がり、その低下量が経過時間に比例する（落下速度一定）。
//   (c) ゲーム時刻を対象ノーツの実時刻に合わせると、そのノーツの縦位置が自分のスロットの線分の値に一致する。
//   (d) 水滴は中心が自分の線分に一致した時点で消える（達する直前は可視で線分より上、達した直後は不可視で線分の下に残らない）。
//   (e) ノーツは7列に並び、番号1のノーツが最も左、番号7のノーツが最も右で、横位置が番号順に単調に増える。
//   (f) 表示物が2次元層へ載っており、可視ノーツの横位置が通路（番号の右端から通路の右端）に収まり、縦位置が線分から上端の範囲に収まる。
//   (g) ノーツが線分に到達すると消滅エフェクトが湧き、その位置が通路の横範囲に収まる。
//   (h) 消滅エフェクトのプール容量が十分で、同時上限超過による生成抑制が起きていない（抑制回数0）。
//   (i) ページ例外・コンソールエラーが無い。
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
  // 通路の横位置は描画反復の更新で確定するため、最初のフレームが回るのを待つ（通路の左端が右端より左になる）。
  await page.waitForFunction(
    () => {
      const p = window.__fallingLaneProbe(0);
      return p.channelLeftX < p.channelRightX;
    },
    undefined,
    { timeout: 15000 }
  );

  const probe = async (gameTimeMs) =>
    page.evaluate((g) => window.__fallingLaneProbe(g), gameTimeMs);

  // 対象ノーツ probe-a（実時刻1000ミリ秒・音程番号3）。
  const A_TIME = 1000;

  const state0 = await probe(0);

  // (a) ある時刻で対象ノーツが単一の判定線より上に存在する。
  const a0 = findNote(state0, "probe-a");
  if (a0 && a0.y > state0.judgmentLineY + Y_TOLERANCE && a0.y <= state0.topY + Y_TOLERANCE) {
    ok(`時刻0で対象ノーツが判定線より上に存在する（y=${a0.y.toFixed(4)} 判定線=${state0.judgmentLineY.toFixed(4)}）`);
  } else {
    fail(`時刻0で対象ノーツが判定線より上に存在しない（${JSON.stringify(a0)}）`);
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

  // (c) ゲーム時刻を対象ノーツの実時刻に合わせると縦位置が単一の判定線に一致する。
  const stateAtA = await probe(A_TIME);
  const aAtTarget = findNote(stateAtA, "probe-a");
  if (aAtTarget && Math.abs(aAtTarget.y - stateAtA.judgmentLineY) <= Y_TOLERANCE) {
    ok(`実時刻で対象ノーツが判定線に一致する（y=${aAtTarget.y.toFixed(6)} 判定線=${stateAtA.judgmentLineY.toFixed(6)}）`);
  } else {
    fail(`実時刻で対象ノーツが判定線に一致しない（${JSON.stringify(aAtTarget)}）`);
  }

  // (d) 水滴は中心が判定線に一致した時点で消える。直前は可視で判定線より上、達した直後は不可視。
  const beforeReach = await probe(A_TIME - 50);
  const aBefore = findNote(beforeReach, "probe-a");
  if (aBefore && aBefore.y > beforeReach.judgmentLineY + Y_TOLERANCE) {
    ok(`中心が線分へ達する直前は可視で線分より上にある（y=${aBefore.y.toFixed(4)}）`);
  } else {
    fail(`中心が線分へ達する直前に可視でないか線分より上にない（${JSON.stringify(aBefore)}）`);
  }
  const afterReach = await probe(A_TIME + 50);
  const aAfter = findNote(afterReach, "probe-a");
  if (!aAfter) {
    ok("中心が線分を越えた直後は対象ノーツが不可視になる（線分の下に残らない）");
  } else {
    fail(`中心が線分を越えても対象ノーツが線分の下に残る（${JSON.stringify(aAfter)}）`);
  }

  // (e) ノーツは7列に並び、番号1が最も左、番号7が最も右で、横位置が番号順に単調に増える。
  // 時刻1000で probe-a(番号3)・probe-b(番号7)・probe-c(番号1) が同時に可視。
  const cNote = findNote(stateAtA, "probe-c"); // 番号1
  const aNote = findNote(stateAtA, "probe-a"); // 番号3
  const bNote = findNote(stateAtA, "probe-b"); // 番号7
  if (cNote && aNote && bNote && cNote.x < aNote.x && aNote.x < bNote.x) {
    ok(`番号順に横位置が単調に増える（番号1 x=${cNote.x.toFixed(3)} < 番号3 x=${aNote.x.toFixed(3)} < 番号7 x=${bNote.x.toFixed(3)}）`);
  } else {
    fail(`番号順の横位置が単調に増えない（${JSON.stringify(cNote)} / ${JSON.stringify(aNote)} / ${JSON.stringify(bNote)}）`);
  }

  // (f) 表示物が2次元層へ載り、可視ノーツの横位置が通路に収まり、縦位置が線分から上端の範囲に収まる。
  if (stateAtA.overlayObjectCount >= 1) {
    ok(`落下式レーンが2次元層へ載っている（表示物数 ${stateAtA.overlayObjectCount}）`);
  } else {
    fail("落下式レーンが2次元層へ載っていない");
  }
  const left = stateAtA.channelLeftX;
  const right = stateAtA.channelRightX;
  if (left < right) {
    ok(`通路の左端が右端より左にある（左=${left.toFixed(3)} 右=${right.toFixed(3)}）`);
  } else {
    fail(`通路の左右が逆（左=${left} 右=${right}）`);
  }
  const outOfChannel = stateAtA.notes.filter(
    (note) => note.x < left - Y_TOLERANCE || note.x > right + Y_TOLERANCE
  );
  if (outOfChannel.length === 0) {
    ok("可視ノーツの横位置が通路に収まる");
  } else {
    fail(`通路から外れる可視ノーツがある（${JSON.stringify(outOfChannel)}）`);
  }
  const outOfVertical = stateAtA.notes.filter(
    (note) => note.y < stateAtA.judgmentLineY - Y_TOLERANCE || note.y > stateAtA.topY + Y_TOLERANCE
  );
  if (outOfVertical.length === 0) {
    ok("可視ノーツの縦位置が判定線から上端の範囲に収まる");
  } else {
    fail(`縦範囲から外れる可視ノーツがある（${JSON.stringify(outOfVertical)}）`);
  }

  // (g) ノーツが線分に到達すると消滅エフェクトが湧く。診断ページは壁時計でノーツ列を巡回駆動するため、
  // 数秒のあいだに少なくとも1回、活動中の消滅エフェクトが現れる。消滅エフェクトの寿命は短い（180ミリ秒）ため、
  // 活動の検出と標本の取得を1回の評価で原子的に行い、頻繁に繰り返して捉える。湧いた標本の横位置が通路に収まることも確かめる。
  let burstCaught = null;
  for (let attempt = 0; attempt < 400 && burstCaught === null; attempt += 1) {
    const captured = await page.evaluate(() => {
      const p = window.__fallingLaneProbe(0);
      if (p.burstActiveCount > 0 && p.burstSample) {
        return {
          sample: p.burstSample,
          channelLeftX: p.channelLeftX,
          channelRightX: p.channelRightX,
          rippleActiveCount: p.rippleActiveCount,
        };
      }
      return null;
    });
    if (captured !== null) {
      burstCaught = captured;
    } else {
      await page.waitForTimeout(20);
    }
  }
  if (burstCaught === null) {
    fail("数秒のあいだに消滅エフェクトが湧かなかった");
  } else {
    const { sample, channelLeftX, channelRightX } = burstCaught;
    if (sample.x >= channelLeftX - 0.05 && sample.x <= channelRightX + 0.05) {
      ok(`消滅エフェクトが湧き、その位置が通路の横範囲に収まる（x=${sample.x.toFixed(3)}）`);
    } else {
      fail(`消滅エフェクトの標本が通路の横範囲に収まらない（${JSON.stringify(sample)}）`);
    }
    // 診断ページは各ノーツの到達時刻で擬似タップ（得点するタップ）を与えるため、着水を捉えた瞬間には、そのタップで立てた
    // 画面全体の波紋が1つ以上活動している（波紋の寿命は消滅エフェクトより長い）。波紋はプレイヤーの得点タップでのみ立つ。
    if (burstCaught.rippleActiveCount >= 1) {
      ok(`得点タップ（擬似）で画面全体の波紋が立つ（活動中の波紋 ${burstCaught.rippleActiveCount}）`);
    } else {
      fail("得点タップ（擬似）の瞬間に画面全体の波紋が立っていない");
    }
  }

  // (h) 消滅エフェクトのプール容量が十分で、同時上限超過による生成抑制（silent truncation）が起きていない。
  // 検査用ノーツ列は最も密集する180ミリ秒窓の同時数に余裕を足した容量を確保するため、抑制回数は0であるべき。
  const suppressed = (await probe(0)).burstSuppressedCount;
  if (suppressed === 0) {
    ok("消滅エフェクトの生成抑制（同時上限超過）が起きていない（抑制回数0）");
  } else {
    fail(`消滅エフェクトの生成が抑制された（抑制回数 ${suppressed}。プール容量が不足）`);
  }

  // (i) ページ例外・コンソールエラーが無い。
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
