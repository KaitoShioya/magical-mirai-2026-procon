// 描画層合成（Issue #15）の受け入れ基準「2D層が確実に最前面・z-fightなし」の実機検証。
// Playwright で層合成診断ページ（layer-composite.html）を開き、診断グローバル window.__layerCompositeState を
// 読み、本番と同じ合成手順で描いた画面の画素を確かめる。
// 中央領域の標本が赤であることで「2次元層が最前面」かつ「覆う領域に3次元の色が混じらない（z-fightなし）」を、
// 外側の標本が緑であることで「3次元の色が保持される」を判定する。
// 座標規約と視錐台の決定的検証は単体テスト（src/rendering/viewport.test.ts）が担う。
// 接続先サーバは環境変数 BASE で指定する（既定 http://127.0.0.1:4173）。
//   PowerShell:  $env:BASE='http://127.0.0.1:4173'; node scripts/rendering-layer-smoke.mjs
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:4173";

// 赤と判定する閾値の根拠を先に述べる。不透明な純赤はsRGB変換を経ても赤成分が最大・緑と青が最小になるため、
// 赤成分が247以上（256段階で最大値255から8を引いた値）かつ緑成分が8以下かつ青成分が8以下を赤とみなす。
// 8という許容幅はsRGB変換とソフトウェア描画の丸めを吸収するために採る。
const RED_MIN = 247;
const RED_OTHER_MAX = 8;
// 緑と判定する閾値の根拠を先に述べる。緑の平面はブルームを受けても緑成分が高く赤と青が低いままであるため、
// 緑成分が128以上かつ赤成分が64以下かつ青成分が64以下を緑とみなす。128と64という値は、赤（赤成分が高い）や
// 暗い背景と明確に分離し、ブルームによる成分のにじみに耐える余裕を持たせるために採る。
const GREEN_MIN = 128;
const GREEN_OTHER_MAX = 64;

const errors = [];
let failed = false;
function fail(message) {
  failed = true;
  console.error("失敗: " + message);
}

function isRed([r, g, b]) {
  return r >= RED_MIN && g <= RED_OTHER_MAX && b <= RED_OTHER_MAX;
}
function isGreen([r, g, b]) {
  return g >= GREEN_MIN && r <= GREEN_OTHER_MAX && b <= GREEN_OTHER_MAX;
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
      await page.goto(BASE + "/layer-composite.html", { waitUntil: "load", timeout: 2000 });
      connected = true;
      break;
    } catch {
      await page.waitForTimeout(500);
    }
  }
  if (!connected) {
    throw new Error("プレビューサーバへ接続できませんでした: " + BASE);
  }

  await page.waitForFunction(() => typeof window.__layerCompositeState === "function", undefined, {
    timeout: 15000,
  });

  const state = await page.evaluate(() =>
    typeof window.__layerCompositeState === "function" ? window.__layerCompositeState() : null
  );

  if (!state) {
    fail("window.__layerCompositeState が取得できませんでした");
  } else if (!state.webglAvailable) {
    fail("WebGL を利用できませんでした（webglAvailable が偽）");
  } else {
    // 中央領域の全標本が赤であること（最前面・z-fightなし）。
    const notRed = state.insideSamples.filter((sample) => !isRed(sample));
    if (notRed.length === 0) {
      console.log(
        `確認: 中央領域の全 ${state.insideSamples.length} 標本が赤（2次元層が最前面・z-fightなし）`
      );
    } else {
      fail(
        `中央領域に赤でない標本が ${notRed.length} 個あります（例 ${notRed[0].join(",")}）。` +
          "2次元層が最前面でないか3次元の色が混じっています"
      );
    }
    // 外側の標本が緑であること（3次元の色の保持）。
    if (isGreen(state.outsideSample)) {
      console.log(`確認: 外側の標本が緑（3次元の色が保持されている、${state.outsideSample.join(",")}）`);
    } else {
      fail(
        `外側の標本が緑ではありません（${state.outsideSample.join(",")}）。` +
          "2次元層が3次元の色を消しているか3次元が描かれていません"
      );
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
  console.error("描画層合成の受け入れ検証: 失敗");
  process.exit(1);
} else {
  console.log("描画層合成の受け入れ検証: 成功");
}
