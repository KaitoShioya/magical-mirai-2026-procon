// 操作音エンジン（Issue #52）の受け入れ基準のうち、ブラウザ統合に関わる挙動の実機検証。
// Playwright で診断ページ（audio.html）を開き、次を確かめる。
//   1. 起動前は無音: AudioContext を生成しておらず（contextState が "uninitialized"）、発音中も接続中も0。
//   2. 初回の信頼された入力で起動: 画面への page.click（信頼されたジェスチャ）の延長で unlock が走り、
//      contextState が "running" へ到達する。
//   3. 16音同時で非破綻: 16音を一度に鳴らすと発音中の数が16で、最古音の消音が起きず、例外も出ない。
//   4. 上限の維持と収束: 30音を一度に鳴らしても発音中の数が上限24以下に保たれ、減衰後に接続中が0へ戻る。
// 接続先サーバは環境変数 BASE で指定する（既定 http://127.0.0.1:4173＝ビルド成果物の確認サーバ）。
//   PowerShell:  $env:BASE='http://127.0.0.1:4173'; node scripts/audio-smoke.mjs
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:4173";
const VIEWPORT = { width: 390, height: 844 };

// 起動の待ち上限（ミリ秒）。信頼入力の後の resume は速いが、ページ読み込みと約束の解決の余裕として5秒とる。
const RUNNING_TIMEOUT_MS = 5000;
// 減衰で接続中が0へ戻る待ち上限（ミリ秒）。減衰200ミリ秒＋末尾20ミリ秒に余裕を足して2秒とる。
const DECAY_TIMEOUT_MS = 2000;

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
const page = await browser.newPage({ viewport: VIEWPORT });

// 未捕捉のページ例外とコンソールのエラーをすべて失敗扱いにする。
page.on("pageerror", (error) => fail("ページ例外: " + error.message));
page.on("console", (message) => {
  if (message.type() === "error") {
    fail("コンソールエラー: " + message.text());
  }
});

const opened = await gotoWithRetry(page, `${BASE}/audio.html`);
if (!opened) {
  fail(`診断ページを開けない: ${BASE}/audio.html`);
}

// 検証用アクセサが用意されるまで待つ。
await page.waitForFunction(() => typeof window.__audioState === "function", null, {
  timeout: RUNNING_TIMEOUT_MS,
});

// 1. 起動前は無音。
{
  const state = await page.evaluate(() => window.__audioState());
  if (state.contextState !== "uninitialized") {
    fail(`起動前の状態が uninitialized でない: ${state.contextState}`);
  } else if (state.sounding !== 0 || state.active !== 0) {
    fail(`起動前に音が数えられている: 発音中${state.sounding} 接続中${state.active}`);
  } else {
    ok("起動前は AudioContext 未生成で無音");
  }
}

// 2. 信頼された入力で起動。画面中央をクリックして pointerdown を発火させ、running への到達を待つ。
await page.click("#audio-surface", { position: { x: VIEWPORT.width / 2, y: VIEWPORT.height / 2 } });
try {
  await page.waitForFunction(() => window.__audioState().contextState === "running", null, {
    timeout: RUNNING_TIMEOUT_MS,
  });
  ok("初回の信頼された入力で contextState が running へ到達");
} catch {
  const state = await page.evaluate(() => window.__audioState());
  fail(`起動後に running へ到達しない: 最終状態 ${state.contextState}`);
}

// 接続中が0へ戻るのを待つ補助（次の検査を独立させるため）。
async function waitActiveZero() {
  await page.waitForFunction(() => window.__audioState().active === 0, null, {
    timeout: DECAY_TIMEOUT_MS,
  });
}

// 3. 16音同時で非破綻（発音中が16、最古音の消音が起きない）。
try {
  await waitActiveZero();
  const sounding = await page.evaluate(() => window.__audioPlayMany(16));
  if (sounding !== 16) {
    fail(`16音同時で発音中が16でない: ${sounding}`);
  } else {
    ok("16音同時で発音中が16（最古音の消音が起きない）");
  }
} catch {
  fail("16音同時の検査で接続中が0へ戻らない、または例外");
}

// 4. 30音同時で上限24以下に保たれ、減衰後に接続中が0へ戻る。
try {
  await waitActiveZero();
  const sounding = await page.evaluate(() => window.__audioPlayMany(30));
  if (sounding > 24) {
    fail(`30音同時で発音中が上限24を超える: ${sounding}`);
  } else {
    ok(`30音同時で発音中が上限以下に保たれる: ${sounding}`);
  }
  await waitActiveZero();
  ok("減衰後に接続中が0へ戻る");
} catch {
  fail("30音同時の検査で上限維持または収束が確認できない");
}

// 5. 投下時に明るく聞こえる（投下時の周波数重心が通常時より高い）。倍音を1層重ねることで重心が上がることを、
//    共有出力グラフを通したオフライン描画で測って確認する。基準1.05は、見積もり上昇率約9パーセントより十分低く、
//    測定・数値計算の誤差より十分高い余裕として採る。
try {
  const brightness = await page.evaluate(() => window.__audioBrightness());
  if (
    !brightness ||
    brightness.normalCentroid === null ||
    brightness.deployCentroid === null
  ) {
    fail("明るさ測定に失敗: " + (brightness && brightness.error ? brightness.error : "結果なし"));
  } else if (!(brightness.deployCentroid > brightness.normalCentroid * 1.05)) {
    fail(
      `投下時の周波数重心が通常時の1.05倍を超えない: 通常${brightness.normalCentroid.toFixed(1)}Hz ` +
        `投下${brightness.deployCentroid.toFixed(1)}Hz`
    );
  } else {
    ok(
      `投下時の周波数重心が通常時より高い: 通常${brightness.normalCentroid.toFixed(1)}Hz ` +
        `投下${brightness.deployCentroid.toFixed(1)}Hz`
    );
  }
} catch (error) {
  fail("明るさ測定の呼び出しで例外: " + error.message);
}

// 6. 遅延に頑健な音作りの確認（立ち上がりの緩やかさ・余韻の収束・クリップしないこと）。実機と同じ音量包絡・
//    出力グラフでオフライン描画した測定値を読む。
// 立ち上がりが緩やかと判定する最小の立ち上がり時間（ミリ秒）。10を採る理由を先に述べる。鋭い打撃（数ミリ秒未満）の
// 立ち上がりは知覚される打点が鋭く定まり遅延が目立つ一方、立ち上がりが長いほど打点が曖昧になり遅延に寛容になる。
// 鋭い打撃と明確に区別できる下限として10ミリ秒以上を緩やかとみなす。
const MIN_RISE_MS = 10;
// 余韻が収束するべき上限（ミリ秒）。900を採る理由を先に述べる。直接音の停止（立ち上がり20＋減衰250＋末尾20＝約290
// ミリ秒）に残響の長さ（350ミリ秒）を足した約640ミリ秒に余裕を見た値であり、これを超える余韻は長すぎるとみなす。
const MAX_CONVERGENCE_MS = 900;
// 最悪同時発音の最大振幅の上限。0.95を採る理由を先に述べる。最終段の柔らかい飽和制限の天井0.99により出力は構造的に
// 1.0未満に収まるが、合否はそれより低い0.95に置く。これにより、現在の最悪値（約0.91）が余裕（約0.04）をもって合格しつつ、
// 将来の音量や残響などの調整で頂点が0.95へ近づいた時点で（実際にクリップする前に）検査が捕捉できる。
const CLIP_PEAK_MAX = 0.95;
try {
  const stats = await page.evaluate(() => window.__audioWaveformStats());
  if (!stats || stats.peak24 === null) {
    fail("波形測定に失敗: " + (stats && stats.error ? stats.error : "結果なし"));
  } else {
    // クリップしない（合否条件）。最終段の柔らかい飽和制限の天井0.99より低い CLIP_PEAK_MAX を上限にする。
    if (!(stats.peak24 <= CLIP_PEAK_MAX)) {
      fail(`最悪同時発音の最大振幅が上限を超える: 最大振幅${stats.peak24.toFixed(3)}（${CLIP_PEAK_MAX}以下が必要）`);
    } else {
      ok(`最悪同時発音でクリップしない: 最大振幅${stats.peak24.toFixed(3)}`);
    }
    // 立ち上がりが緩やか（合否条件）。
    if (!(stats.riseTimeMs >= MIN_RISE_MS)) {
      fail(
        `立ち上がりが緩やかでない: 立ち上がり時間${stats.riseTimeMs.toFixed(1)}ミリ秒（${MIN_RISE_MS}ミリ秒以上が必要）`
      );
    } else {
      ok(`立ち上がりが緩やか: 立ち上がり時間${stats.riseTimeMs.toFixed(1)}ミリ秒`);
    }
    // 余韻が想定時間内に収束（合否条件）。
    if (!(stats.tailConvergenceMs <= MAX_CONVERGENCE_MS)) {
      fail(
        `余韻が長すぎる: 収束時刻${stats.tailConvergenceMs.toFixed(0)}ミリ秒（${MAX_CONVERGENCE_MS}ミリ秒以内が必要）`
      );
    } else {
      ok(`余韻が想定時間内に収束: 収束時刻${stats.tailConvergenceMs.toFixed(0)}ミリ秒`);
    }
    // 24音時の大きさと171ミリ秒残留は記録（参考）に留め、合否条件にはしない（調整を詰まらせないため）。過圧縮の最終確認は実機試聴。
    console.log(
      `記録（参考）: 24音時の二乗平均平方根${(stats.rms24 ?? 0).toFixed(3)} ` +
        `171ミリ秒残留割合${(stats.residualAt171Ratio ?? 0).toFixed(3)}`
    );
  }
} catch (error) {
  fail("波形測定の呼び出しで例外: " + error.message);
}

await browser.close();

if (failed) {
  console.error("操作音スモーク: 失敗");
  process.exit(1);
}
console.log("操作音スモーク: 全確認");
