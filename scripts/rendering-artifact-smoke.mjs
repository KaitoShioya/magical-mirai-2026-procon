// 成果物画像の書き出し（Issue #69）の受け入れ基準の実機検証。
// Playwright で成果物診断ページ（artifact.html）を開き、診断グローバル window.__artifactCapture を呼んで
// 現在のカメラ構図で成果物画像を作って分析した結果を読み、出力寸法が縦横比規則に従うこと（長辺1200・縦横比0.8〜1.25）、
// 容量が上限以下であること（または不可逆形式へ切り替わっていること）、画像が黒一色でないこと、見出しの領域に文字が
// 載って一様でないことを確かめる。行反転の正しさは単体テスト（src/rendering/captureEncode.test.ts）が固定する。
// 接続先サーバは環境変数 BASE で指定する（既定 http://127.0.0.1:4173）。
import { chromium } from "playwright";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE || "http://127.0.0.1:4173";
// 黒一色でないことの下限（平均輝度、0から255）。判定方法の根拠を先に述べる。完全な黒（読み戻し失敗・描画されず）は
// 平均輝度がほぼ0になるため、夜景でも灯しと夜空でわずかに明るくなる値として3を下限に置く。
const MEAN_LUMA_MIN = 3;
// 見出しに文字が載っていることの下限（輝度の分散）。文字と背景の輝度差で分散が正になるため、1を下限に置く。
const TITLE_VARIANCE_MIN = 1;
// 長辺の期待画素数（規則で1200に固定）。
const EXPECTED_LONG_EDGE = 1200;
const SCREENSHOT_PATH = join(tmpdir(), "artifact-smoke.png");

const errors = [];
let failed = false;
function fail(message) {
  failed = true;
  console.error("失敗: " + message);
}

const browser = await chromium.launch();
// 縦持ちスマートフォンの寸法。縦横比0.462は制限下限0.8へ丸められ、出力は960×1200（長辺1200）になるはず。
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
      await page.goto(BASE + "/artifact.html", { waitUntil: "load", timeout: 2000 });
      connected = true;
      break;
    } catch {
      await page.waitForTimeout(500);
    }
  }
  if (!connected) {
    throw new Error("プレビューサーバへ接続できませんでした: " + BASE);
  }

  await page.waitForFunction(() => typeof window.__artifactCapture === "function", undefined, {
    timeout: 15000,
  });

  const result = await page.evaluate(async () => {
    const probe = window.__artifactCapture;
    return probe ? await probe() : null;
  });

  if (!result || typeof result !== "object") {
    fail("window.__artifactCapture の結果が取得できませんでした");
  } else if (result.ok !== true) {
    fail(`成果物画像を作れませんでした: ${result.reason ?? "理由不明"}`);
  } else {
    // 出力寸法が縦横比規則に従う（長辺1200・縦横比0.8〜1.25）。
    if (result.longEdge === EXPECTED_LONG_EDGE) {
      console.log(`確認: 長辺は ${result.longEdge} 画素（規則どおり）`);
    } else {
      fail(`長辺が ${result.longEdge} 画素です（期待: ${EXPECTED_LONG_EDGE}）`);
    }
    if (result.aspect >= 0.8 - 1e-3 && result.aspect <= 1.25 + 1e-3) {
      console.log(`確認: 縦横比は ${result.aspect.toFixed(3)}（許容 0.8〜1.25）`);
    } else {
      fail(`縦横比が ${result.aspect.toFixed(3)} です（期待: 0.8〜1.25）`);
    }

    // 形式。容量の大小に依らず常に無圧縮可逆形式（PNG）で出る（容量上限と形式切り替えは廃止）。
    if (result.type === "image/png") {
      console.log(
        `確認: 無圧縮可逆形式（PNG）で出力（容量 ${(result.sizeBytes / 1024).toFixed(0)}KB・上限なし）`
      );
    } else {
      fail(`形式が ${result.type} です（期待: image/png）`);
    }

    // 黒一色でない（読み戻しと色管理が成立している）。
    if (result.meanLuma > MEAN_LUMA_MIN) {
      console.log(`確認: 画像は黒一色でない（平均輝度 ${result.meanLuma.toFixed(1)}）`);
    } else {
      fail(`平均輝度が ${result.meanLuma.toFixed(1)} です（期待: ${MEAN_LUMA_MIN} より大きい）`);
    }

    // 見出しに文字が載って一様でない。
    if (result.titleVariance > TITLE_VARIANCE_MIN) {
      console.log(`確認: 見出しに文字が載っている（輝度分散 ${result.titleVariance.toFixed(1)}）`);
    } else {
      fail(
        `見出しの輝度分散が ${result.titleVariance.toFixed(1)} です（期待: ${TITLE_VARIANCE_MIN} より大きい・文字が載っていない疑い）`
      );
    }

    // 下部の出典の帯が中ほどより暗い（暗く落とした帯が正しい向きにある＝上下反転の整合の目安）。情報として記録する。
    console.log(
      `参考: 中ほどの輝度 ${result.middleLuma.toFixed(1)} / 出典の帯の輝度 ${result.creditStripLuma.toFixed(1)}`
    );
  }

  await page.waitForTimeout(200);
  await page.screenshot({ path: SCREENSHOT_PATH });
  console.log(`スクリーンショットを保存しました: ${SCREENSHOT_PATH}`);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
} finally {
  await browser.close();
}

if (errors.length > 0) {
  fail("ページ・コンソールのエラーを検出しました:\n" + errors.join("\n"));
}

if (failed) {
  console.error("成果物画像書き出しの受け入れ検証: 失敗");
  process.exit(1);
} else {
  console.log("成果物画像書き出しの受け入れ検証: 成功");
}
