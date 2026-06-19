// 画面遷移のスモークテスト: Playwright で 5状態の有限状態機械の遷移と単一画面表示を検証する。
// 接続先サーバは環境変数 BASE で指定する（既定 http://127.0.0.1:4173）。診断モードのため /?smoke=1 を開く。
// 起動例:
//   Unix系シェル:   BASE=http://127.0.0.1:4173 npm run smoke
//   PowerShell:     $env:BASE='http://127.0.0.1:4173'; npm run smoke
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:4173";

// 進入順の期待値。再挑戦状態を含む5状態の走破を機械的に確認する。
const EXPECTED_HISTORY = ["title", "warmup", "play", "result", "retry", "title"];

// ウォームアップ完了待ちの上限（ミリ秒）。
// 完了判定は上限100ミリ秒でクランプした時間差の累積で行うため、実フレーム率が毎秒10フレームを下回ると
// 累積が実時間より遅れる。公称ウォームアップは5000ミリ秒。最悪条件の毎秒5フレームでは累積5000ミリ秒へ
// 到達するのに実時間10000ミリ秒を要するため、その1.5倍の15000ミリ秒を上限とする。
const SCREEN_WAIT_TIMEOUT_MS = 15000;

const errors = [];
let failed = false;

function fail(message) {
  failed = true;
  console.error("失敗: " + message);
}

async function readScreen(page) {
  return page.evaluate(() => {
    const elements = document.querySelectorAll("[data-screen]");
    return {
      count: elements.length,
      key: elements.length === 1 ? elements[0].getAttribute("data-screen") : null,
    };
  });
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

async function assertScreen(page, expectedKey) {
  const screen = await readScreen(page);
  if (screen.count !== 1) {
    fail(`画面が ${screen.count} 個表示されています（期待: 1個、状態: ${expectedKey}）`);
    return;
  }
  if (screen.key !== expectedKey) {
    fail(`表示中の画面が "${screen.key}" です（期待: "${expectedKey}"）`);
    return;
  }
  console.log(`確認: ${expectedKey} が1個だけ表示されている`);
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
  // 起動待ち: 最大30回・各500ミリ秒間隔（合計上限15秒）でプレビューサーバの起動完了を待つ。
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

  // 1. 題名画面が表示される。
  await waitForScreen(page, "title");
  await assertScreen(page, "title");

  // 1.5 曲選択UIの確認（Issue #5）。実装済み曲だけが開始でき、未実装曲は無効化されている。
  //     実装済みは TAKEOVER の1曲のみのため、開始ボタンはちょうど1個（data-song-key="takeover"）、
  //     準備中の無効ボタンが5個あることを機械的に確認する。
  const songSelection = await page.evaluate(() => {
    const root = document.querySelector('[data-screen="title"]');
    const startButtons = Array.from(root.querySelectorAll('[data-action="start"]'));
    const comingSoon = Array.from(root.querySelectorAll('[data-coming-soon="true"]'));
    return {
      startCount: startButtons.length,
      startSongKey: startButtons.length === 1 ? startButtons[0].getAttribute("data-song-key") : null,
      comingSoonCount: comingSoon.length,
      comingSoonAllDisabled: comingSoon.every((element) => element.disabled === true),
    };
  });
  if (songSelection.startCount !== 1) {
    fail(`開始できる曲が ${songSelection.startCount} 個です（期待: 1個）`);
  } else if (songSelection.startSongKey !== "takeover") {
    fail(`開始できる曲が "${songSelection.startSongKey}" です（期待: "takeover"）`);
  } else {
    console.log("確認: 開始できる曲は TAKEOVER の1曲だけ");
  }
  if (songSelection.comingSoonCount !== 5) {
    fail(`準備中の曲が ${songSelection.comingSoonCount} 個です（期待: 5個）`);
  } else if (!songSelection.comingSoonAllDisabled) {
    fail("準備中の曲に無効化されていないものがあります");
  } else {
    console.log("確認: 準備中の曲は5個ですべて無効");
  }

  // 2. 「はじめる」でウォームアップへ。
  await page.click('[data-action="start"]');
  await waitForScreen(page, "warmup");
  await assertScreen(page, "warmup");

  // 3. ウォームアップの固定尺経過でプレイへ自動遷移する。
  await waitForScreen(page, "play");
  await assertScreen(page, "play");

  // 4. 楽曲終了の自動検知で結果へ遷移する。
  //    診断モードの擬似再生は短い楽曲長で速やかに終了するため、待つだけで結果へ進む（Issue #4）。
  await waitForScreen(page, "result");
  await assertScreen(page, "result");

  // 5. 「タイトルに戻る」で再挑戦を経て題名へ戻る。
  await page.click('[data-action="return-title"]');
  await waitForScreen(page, "title");
  await assertScreen(page, "title");

  // 6. 状態履歴が5状態の走破を示す。
  const history = await page.evaluate(() =>
    typeof window.__screenHistory === "function" ? window.__screenHistory() : null
  );
  if (!history) {
    fail("window.__screenHistory が取得できませんでした");
  } else if (JSON.stringify(history) !== JSON.stringify(EXPECTED_HISTORY)) {
    fail(`状態履歴が期待と一致しません: ${JSON.stringify(history)}`);
  } else {
    console.log("確認: 状態履歴が5状態を走破している");
  }

  // 7. 診断モードでない通常構成では診断アクセサが公開されていない。
  await page.goto(BASE + "/", { waitUntil: "load" });
  const diagnosticAbsent = await page.evaluate(() => typeof window.__screenHistory === "undefined");
  if (!diagnosticAbsent) {
    fail("通常構成（?smoke=1 なし）で window.__screenHistory が公開されています");
  } else {
    console.log("確認: 通常構成では診断アクセサが未公開");
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
  console.error("スモークテスト: 失敗");
  process.exit(1);
} else {
  console.log("スモークテスト: 成功");
}
