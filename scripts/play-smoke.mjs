// 通しプレイのスモークテスト（Issue #59）: Playwright で診断モード（?smoke=1・擬似再生）を起動し、
// プレイ進行中に合成タップを注入して、入力→判定→協和音→一過性の蝶→採点→カメラ駆動の結線が
// 実ブラウザで例外なく成立することを検証する。
// 接続先サーバは環境変数 BASE で指定する（既定 http://127.0.0.1:4173）。
// 起動例:
//   Unix系シェル:  BASE=http://127.0.0.1:4173 npm run smoke:play
//   PowerShell:    $env:BASE='http://127.0.0.1:4173'; npm run smoke:play
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:4173";

// ウォームアップ完了待ちの上限（ミリ秒）。screens-smoke と同じ根拠（公称5000ミリ秒・最悪フレーム率の余裕）。
const SCREEN_WAIT_TIMEOUT_MS = 15000;
// プレイ進行中に注入を試みるタップ数の上限と間隔（ミリ秒）。擬似再生のプレイ窓は再生開始からおよそ680ミリ秒
// （FAKE_DURATION_MS 800 − 終了余白 120）。蝶の寿命約1.2秒より十分短い間隔で詰めず、容量上限64に達しない範囲で
// 単調に増えることを確かめるため、最大5回・各90ミリ秒間隔とする。実際に算入されるタップ数はプレイ窓に収まる分だけで、
// 注入ループが各タップの算入を確認し算入された分だけを数える（プレイ窓の長さに依存せず境界の取りこぼしを排除するため）。
const TAP_COUNT = 5;
const TAP_INTERVAL_MS = 90;

const errors = [];
let failed = false;

function fail(message) {
  failed = true;
  console.error("失敗: " + message);
}

function check(condition, okMessage, ngMessage) {
  if (condition) {
    console.log("確認: " + okMessage);
  } else {
    fail(ngMessage);
  }
}

async function waitForScreen(page, expectedKey) {
  await page.waitForFunction(
    (key) => {
      const elements = document.querySelectorAll("[data-screen]");
      return elements.length === 1 && elements[0].getAttribute("data-screen") === key;
    },
    expectedKey,
    { timeout: SCREEN_WAIT_TIMEOUT_MS }
  );
}

async function currentScreen(page) {
  return page.evaluate(() => {
    const elements = document.querySelectorAll("[data-screen]");
    return elements.length === 1 ? elements[0].getAttribute("data-screen") : null;
  });
}

// 入力面（.screen-root）へ pointerdown を送出する。clientX/Y は入力面の矩形に対する正規化位置から求める。
async function dispatchTap(page, normalizedX, normalizedY) {
  await page.evaluate(
    ({ x, y }) => {
      const root = document.querySelector(".screen-root");
      if (!root) {
        return;
      }
      const rect = root.getBoundingClientRect();
      const clientX = rect.left + rect.width * x;
      const clientY = rect.top + rect.height * y;
      const event = new PointerEvent("pointerdown", {
        clientX,
        clientY,
        pointerId: 1,
        pointerType: "touch",
        bubbles: true,
        cancelable: true,
      });
      root.dispatchEvent(event);
    },
    { x: normalizedX, y: normalizedY }
  );
}

async function readPlaySession(page) {
  return page.evaluate(() =>
    typeof window.__playSession === "function" ? window.__playSession() : null
  );
}

async function readRenderState(page) {
  return page.evaluate(() =>
    typeof window.__renderState === "function" ? window.__renderState() : null
  );
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

  // 題名→ウォームアップ→プレイへ進む。
  await waitForScreen(page, "title");
  // プレイ開始前のカメラ位置（暫定固定視点）を控える。プレイ中の軌跡駆動で変わることを確かめる基準にする。
  const prePlayCamera = (await readRenderState(page))?.cameraPosition ?? null;
  // 起動既定曲 TAKEOVER のボタンを明示して押す。実装済みが2曲（横展開 Issue #88）になり開始ボタンが複数あるため、
  // 起動曲のボタンを指定する。起動曲のボタンは再読み込みせずウォームアップへ進む。
  await page.click('[data-song-key="takeover"][data-action="start"]');
  await waitForScreen(page, "warmup");
  await waitForScreen(page, "play");

  // WebGL の可否を読む。蝶・カメラは描画基盤を要するため、利用不可の端末では該当検査を飛ばす。
  const renderAtPlay = await readRenderState(page);
  const webglAvailable = renderAtPlay?.webglAvailable === true;

  // プレイ進行中に合成タップを注入する。各タップで音程帯（Y位置）を変えて多様性を持たせる。
  // 算入確認方式を採る理由を先に述べる。プレイ→結果へ自動遷移する際、プレイ離脱の手続きが入力を無効化（input.setActive(false)）
  // するのは画面DOMが result へ変わる直前である。よって「画面がplay」を確認してからタップを送出するまでの間（別々の評価呼び出しの
  // 往復）にプレイが終了すると、送出したタップは入力無効で算入されないのに注入回数だけが増え、発音回数と1ずれる。これを避けるため、
  // タップ送出の直後にセッションの算入数（tapCount）が1増えたことを確認し、算入されたタップだけを injected に数える。算入されなければ
  // プレイ窓の終端に達したとみなして注入を止める。これにより injected は「実際にプレイ中へ届いて算入されたタップ数」を表し、
  // 擬似再生のプレイ窓の長さに依存せず決定論的になる。TAP_COUNT は注入を試みる上限である。
  let injected = 0;
  let lastTapCount = (await readPlaySession(page))?.tapCount ?? 0;
  for (let i = 0; i < TAP_COUNT; i += 1) {
    if ((await currentScreen(page)) !== "play") {
      break;
    }
    const normalizedX = 0.2 + 0.15 * i;
    const normalizedY = 0.15 + 0.13 * i;
    await dispatchTap(page, normalizedX, normalizedY);
    const session = await readPlaySession(page);
    if (session === null || session.tapCount !== lastTapCount + 1) {
      // 送出したタップが算入されなかった（プレイ窓の終端で入力が無効化された）。境界の取りこぼしを数えないため注入を止める。
      break;
    }
    injected += 1;
    lastTapCount = session.tapCount;
    await page.waitForTimeout(TAP_INTERVAL_MS);
  }

  // 注入直後（まだプレイ中か、抜けた直後）のセッション・描画状態を読む。
  const sessionAfter = await readPlaySession(page);
  const renderAfter = await readRenderState(page);

  // 注入が1回も成立しなかった場合は検査の前提が崩れるため失敗とする。
  check(
    injected >= 1,
    `プレイ中に合成タップを ${injected} 回注入できた`,
    "プレイ中にタップを1回も注入できませんでした（プレイ窓が短すぎる可能性）"
  );

  if (sessionAfter === null) {
    fail("window.__playSession が取得できませんでした");
  } else {
    // 音: タップが操作音の発音へ届く（注入回数ぶん発音される）。
    check(
      sessionAfter.playSlotCallCount === injected,
      `発音回数が注入回数と一致する（${sessionAfter.playSlotCallCount} 回）`,
      `発音回数 ${sessionAfter.playSlotCallCount} が注入回数 ${injected} と一致しません`
    );
    // 採点: どのタップも算入される（床タップを含め tapCount が注入回数と一致）。
    check(
      sessionAfter.tapCount === injected,
      `算入タップ数が注入回数と一致する（${sessionAfter.tapCount} 回）`,
      `算入タップ数 ${sessionAfter.tapCount} が注入回数 ${injected} と一致しません`
    );
    // ランク: 百分位とランク添字が有限で、減少していない（0からの単調非減少を許容する）。
    check(
      Number.isFinite(sessionAfter.percentile) && Number.isFinite(sessionAfter.rankIndex),
      `百分位 ${sessionAfter.percentile.toFixed(1)}・ランク添字 ${sessionAfter.rankIndex} が有限値`,
      `百分位またはランク添字が有限値ではありません（${JSON.stringify(sessionAfter)}）`
    );
  }

  if (webglAvailable) {
    if (renderAfter === null) {
      fail("window.__renderState が取得できませんでした");
    } else {
      // 描画側の灯しの検査について。タップの手応えは画面全体の水面の波紋（得点が出たタップのみ）で、持続配置の灯し
      // （placedLanternCount）も得点が出たタップのみ積み上がる。擬似再生では合成タップが得点に至るかが保証されないため、
      // 描画側の灯し数は通しスモークの主検査に用いない（配置の呼び分けの厳密検査は単体テスト playSession.test.ts が担う）。
      // ここでは描画状態が取得でき例外が無いことと、下記カメラ駆動の成立のみを確かめる。
      check(
        Number.isFinite(renderAfter.placedLanternCount) && renderAfter.placedLanternCount >= 0,
        `持続配置の灯し数が有限・非負（${renderAfter.placedLanternCount}）`,
        `持続配置の灯し数が不正です（${renderAfter.placedLanternCount}）`
      );
      // カメラ: 軌跡駆動の適用拒否が無い。
      check(
        renderAfter.cameraPoseRejectedCount === 0,
        "カメラ姿勢の適用拒否が0回",
        `カメラ姿勢の適用拒否が ${renderAfter.cameraPoseRejectedCount} 回あります`
      );
      // カメラ: プレイ開始前の暫定固定視点から、軌跡上の視点へ変わっている。
      const moved =
        prePlayCamera !== null &&
        (Math.abs(renderAfter.cameraPosition.x - prePlayCamera.x) > 0.001 ||
          Math.abs(renderAfter.cameraPosition.y - prePlayCamera.y) > 0.001 ||
          Math.abs(renderAfter.cameraPosition.z - prePlayCamera.z) > 0.001);
      check(
        moved,
        "カメラが軌跡駆動で固定視点から移動している",
        `カメラが移動していません（前: ${JSON.stringify(prePlayCamera)}, 後: ${JSON.stringify(renderAfter.cameraPosition)}）`
      );
    }
  } else {
    console.log("注記: WebGL を利用できないため、蝶・カメラの検査は飛ばした");
  }

  // 曲終了で結果へ遷移する（通しが最後まで成立する）。
  await waitForScreen(page, "result");
  console.log("確認: 楽曲終了で結果画面へ遷移した");
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
} finally {
  await browser.close();
}

if (errors.length > 0) {
  fail("ページ・コンソールのエラーを検出しました:\n" + errors.join("\n"));
}

if (failed) {
  console.error("通しプレイスモーク: 失敗");
  process.exit(1);
} else {
  console.log("通しプレイスモーク: 成功");
}
