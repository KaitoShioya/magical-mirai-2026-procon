// 中心キャラクター常在配置・反射対象制御（Issue #92）の受け入れ検証。Playwright で受け入れ診断ページ
// （center-figure.html）を開き、診断グローバル window.__centerFigureState を読み、本番と同じ経路で
// 中心キャラクターのVRMが湖の中心へ配置され、湖面反射への含有を切り替えられることを確かめる。
//
// 確認項目:
//   既定（クエリなし）: VRM が湖の中心へ配置（centerFigureStatus=loaded）、反射が有効（reflectionEnabled）、
//     反射にミクを含める（centerFigureReflected が真。concept-final §10 の既定）。
//   ?reflectMiku=0: 反射からミクを外す（centerFigureReflected が偽）。反射そのものは有効のまま。
//   全体: WebGL が利用でき、ページ例外・コンソールエラーが無い。
//
// VRM の読み込み完了（centerFigureStatus=loaded）を待つ上限を20000ミリ秒とする。採用理由を先に述べる。
// VRM ファイル（約16メガバイト）の読み込みと解析に数秒を要し、舞台土台スモークが同じ上限で安定している。
// VRM の読み込みと解析は中央処理装置の処理であり画像処理装置を必要としないため、画像処理装置の無い
// 継続的インテグレーション環境（ソフトウェア描画）でも loaded へ達する。VRM 資産はリポジトリに登録済みで、
// public 配下のため検証用ビルドで dist へ複製され配信される。
//
// 接続先サーバは環境変数 BASE で指定する（既定 http://127.0.0.1:4173）。
//   PowerShell:  $env:BASE='http://127.0.0.1:4173'; node scripts/rendering-center-figure-smoke.mjs
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:4173";
// VRM の読み込み完了を待つ上限（ミリ秒）。理由はファイル冒頭に記す。
const LOAD_TIMEOUT_MS = 20000;

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

// 指定のクエリで診断ページを開き、診断グローバルが返す状態を読む。
async function readState(queryString) {
  let connected = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await page.goto(BASE + "/center-figure.html" + queryString, {
        waitUntil: "load",
        timeout: 2000,
      });
      connected = true;
      break;
    } catch {
      await page.waitForTimeout(500);
    }
  }
  if (!connected) {
    throw new Error("プレビューサーバへ接続できませんでした: " + BASE);
  }
  // 診断アクセサは読み込み完了後に公開されるため、その出現を待つ（VRM 読み込みの完了待ちを兼ねる）。
  await page.waitForFunction(() => typeof window.__centerFigureState === "function", undefined, {
    timeout: LOAD_TIMEOUT_MS,
  });
  return page.evaluate(() =>
    typeof window.__centerFigureState === "function" ? window.__centerFigureState() : null
  );
}

try {
  // 1. 既定（反射にミクを含める）。
  const base = await readState("");
  if (!base) {
    fail("window.__centerFigureState が取得できませんでした（既定）");
  } else if (!base.webglAvailable) {
    fail("WebGL を利用できませんでした（webglAvailable が偽）");
  } else {
    if (base.centerFigureStatus === "loaded") {
      console.log("確認: VRM が湖の中心へ配置されました（centerFigureStatus=loaded）");
    } else {
      fail(
        `VRM が配置されませんでした（centerFigureStatus=${base.centerFigureStatus}` +
          (base.centerFigureError ? `, error=${base.centerFigureError}` : "") +
          "）"
      );
    }
    if (base.reflectionEnabled) {
      console.log("確認: 平面反射が有効です（reflectionEnabled）");
    } else {
      fail("平面反射が有効ではありません（reflectionEnabled が偽）");
    }
    if (base.centerFigureReflected === true) {
      console.log("確認: 既定で中心オブジェクトを反射に含めます（centerFigureReflected が真）");
    } else {
      fail(`既定で中心オブジェクトが反射に含まれません（centerFigureReflected=${base.centerFigureReflected}）`);
    }
  }

  // 2. ?reflectMiku=0（反射からミクを外す）。
  const excluded = await readState("?reflectMiku=0");
  if (!excluded) {
    fail("window.__centerFigureState が取得できませんでした（reflectMiku=0）");
  } else {
    if (excluded.centerFigureReflected === false) {
      console.log("確認: ?reflectMiku=0 で中心オブジェクトを反射から除外（centerFigureReflected が偽）");
    } else {
      fail(
        `?reflectMiku=0 で反射から外れません（centerFigureReflected=${excluded.centerFigureReflected}）`
      );
    }
    // 反射そのものは有効のまま（外したのはミクだけ）。
    if (!excluded.reflectionEnabled) {
      fail("?reflectMiku=0 で平面反射そのものが無効になりました（reflectionEnabled が偽）");
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
  console.error("中心キャラクター常在配置・反射対象制御の受け入れ検証: 失敗");
  process.exit(1);
} else {
  console.log("中心キャラクター常在配置・反射対象制御の受け入れ検証: 成功");
}
