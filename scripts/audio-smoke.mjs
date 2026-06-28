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

// 5. 水滴音の客観測定（クリップしないこと・直流の偏りが小さいこと・単音の大きさの記録）。
//    共有出力グラフ（残響・圧縮・ソフトクリップ込み）を通してオフライン描画した測定値を読む。
// 最大振幅の上限。0.95を採る理由を先に述べる。最終段の柔らかい飽和制限の天井0.99により出力は構造的に1.0未満に収まるが、
// 合否はそれより低い0.95に置く。これにより、現在の最悪値が余裕をもって合格しつつ、将来の音量や残響などの調整で頂点が
// 0.95へ近づいた時点で（実際にクリップする前に）検査が捕捉できる。
const CLIP_PEAK_MAX = 0.95;
// 直流の偏りの上限（最大振幅に対する比）。0.1を採る理由を先に述べる。短い水滴音の波形は非対称な過渡で平均が
// わずかに偏るのは正常であり、その正常な偏りが合格する余裕として0.1を採る。配線の誤りなどによる持続的な直流の偏りは
// これを大きく超えるため、正常を許しつつ誤りを捕捉できる。
const DC_RATIO_MAX = 0.1;
try {
  const stats = await page.evaluate(() => window.__audioPercussionStats());
  if (!stats || stats.manyPeak === null) {
    fail("水滴音測定に失敗: " + (stats && stats.error ? stats.error : "結果なし"));
  } else {
    // 多数同時（同時発音上限ぶん）の重なりの最悪条件でクリップしない（合否条件）。
    if (!(stats.manyPeak <= CLIP_PEAK_MAX)) {
      fail(`多数同時の最大振幅が上限を超える: 最大振幅${stats.manyPeak.toFixed(3)}（${CLIP_PEAK_MAX}以下が必要）`);
    } else {
      ok(`多数同時でクリップしない: 最大振幅${stats.manyPeak.toFixed(3)}`);
    }
    // 直流の偏りが小さい（合否条件）。
    if (!(stats.manyDcRatio <= DC_RATIO_MAX)) {
      fail(`直流の偏りが大きい: 比${stats.manyDcRatio.toFixed(3)}（${DC_RATIO_MAX}以下が必要）`);
    } else {
      ok(`直流の偏りが小さい: 比${stats.manyDcRatio.toFixed(3)}`);
    }
    // 単音の最大振幅・二乗平均平方根は記録（参考）に留め、合否条件にはしない（聞き取りやすさの音量調整の材料）。
    console.log(`記録（参考）単音: 振幅${stats.singlePeak.toFixed(3)}/大きさ${stats.singleRms.toFixed(4)}`);
  }
} catch (error) {
  fail("水滴音測定の呼び出しで例外: " + error.message);
}

// 6. 較正音が鳴る（同時発音管理に1音が加わる）。較正音は操作音の有効・無効に関わらず鳴ることを確認する。
try {
  await waitActiveZero();
  // 操作音を無効にしてから較正音を鳴らし、直後の発音中の数が増えることを同期に確認する（鳴り終わりとの競合を避ける）。
  await page.getByText("操作音 OFF/ON").click();
  const sounding = await page.evaluate(() => window.__audioPlayCalibrationCue());
  if (!(sounding >= 1)) {
    fail(`較正音を鳴らしても発音中が増えない（操作音が無効）: 発音中${sounding}`);
  } else {
    ok("較正音が鳴る（操作音が無効でも発音中に加わる）");
  }
} catch (error) {
  fail("較正音の確認で例外: " + error.message);
}

await browser.close();

if (failed) {
  console.error("操作音スモーク: 失敗");
  process.exit(1);
}
console.log("操作音スモーク: 全確認");
