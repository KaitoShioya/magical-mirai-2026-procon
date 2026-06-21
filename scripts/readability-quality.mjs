// 文字可読性ゲート（Issue #98）の本体（手元のローカル実行）。Playwright で可読性診断ページ（readability.html）を
// 開き、診断グローバル window.__readability を読み、(1)発光・ブルーム後の最終描画画素のコントラスト比、
// (2)最小表示画素（絶対下限の明示確認と忠実度）を判定する。判定ロジックは純粋関数
// scripts/harness/readability-metrics.mjs に分離し、本体はブラウザ操作と結果表示に徹する。
// 失敗時の扱いは仕様で「警告（格下げ不可）」のため、提出までに必ず合格させる。退避の格下げは設けない。
//
// ブラウザは通常のヘッドレス起動（描画系統の固定起動引数なし）でよい。本ゲートの計測はコントラスト比と
// 幾何的な画素高で、Issue #31 はこれをソフトウェア描画で計測して合格を確認済みであり、描画系統に依存しない。
//
// 接続先サーバは環境変数 BASE で指定する（既定 http://127.0.0.1:4173）。別端末で開発サーバまたはプレビュー
// サーバを起動してから実行する。
//   PowerShell:  $env:BASE='http://localhost:5173'; node scripts/readability-quality.mjs
//   Unix系シェル: BASE=http://localhost:5173 node scripts/readability-quality.mjs
import { chromium } from "playwright";
import { openPage } from "./harness/page.mjs";
import { DEFAULT_THRESHOLDS, evaluateReadabilityAcceptance } from "./harness/readability-metrics.mjs";

const BASE = process.env.BASE || "http://127.0.0.1:4173";
const VIEWPORT = { width: 800, height: 600 };

const browser = await chromium.launch();
let result = null;
let measurement = null;
let runError = null;
let opened = null;

try {
  opened = await openPage(browser, {
    url: `${BASE}/readability.html`,
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    isMobile: false,
    cpuThrottle: 1,
  });
  // 計測が終わるまで待つ（フォントの取得と配置確定、5背景の描画と画素読み取り、最小表示画素の計測を含む）。
  await opened.page.waitForFunction(
    () => typeof window.__readabilityReady === "function" && window.__readabilityReady(),
    undefined,
    { timeout: 30000 }
  );
  measurement = await opened.page.evaluate(() =>
    typeof window.__readability === "function" ? window.__readability() : null
  );
  if (!measurement) {
    throw new Error("window.__readability が取得できませんでした");
  }
  result = evaluateReadabilityAcceptance(measurement, DEFAULT_THRESHOLDS);
} catch (error) {
  runError = error instanceof Error ? error.message : String(error);
} finally {
  await browser.close();
}

if (runError) {
  console.error("実行に失敗しました: " + runError);
  process.exit(1);
}

// 実測値の併報（目視と記録のため）。
console.log(`mode=${measurement.mode} backing=${measurement.backing}`);
for (const background of measurement.backgrounds) {
  console.log(
    `[${background.kind}] 内部対縁取り=${Number(background.fillBorderContrast).toFixed(2)}`
  );
}
const mp = measurement.minPixel;
const relDiff =
  mp.projectedInkPixelHeight > 0
    ? Math.abs(mp.measuredInkHeightPx - mp.projectedInkPixelHeight) / mp.projectedInkPixelHeight
    : Number.NaN;
console.log(
  `最小表示画素: 絶対下限の射影 emProjected=${Number(mp.emProjectedPixelHeight).toFixed(2)}` +
    `（下限 ${DEFAULT_THRESHOLDS.minPixelHeight}）`
);
console.log(
  `忠実度: インク実測=${Number(mp.measuredInkHeightPx).toFixed(1)} 幾何射影=${Number(
    mp.projectedInkPixelHeight
  ).toFixed(1)} 相対差=${Number.isNaN(relDiff) ? "判定不能" : relDiff.toFixed(3)}` +
    `（許容 ${DEFAULT_THRESHOLDS.projectionTolerance}） 参考 em相当=${Number(
      mp.emPixelHeightEquivalent
    ).toFixed(2)} 可視範囲確定=${mp.visibleBoundsValid}`
);

for (const [cue, ok] of Object.entries(result.cues)) {
  console.log(`${ok ? "成立" : "不成立"}: ${cue}`);
}

// ページ・コンソールの未捕捉例外を検出したら失敗にする。
if (opened && opened.pageErrors.length > 0) {
  for (const message of opened.pageErrors) {
    console.error("ページ例外: " + message);
  }
  console.error("文字可読性ゲート: 失敗（ページ例外を検出しました）");
  process.exit(1);
}

if (result.acceptable) {
  console.log("文字可読性ゲート: 成功");
  process.exit(0);
}

for (const reason of result.reasons) {
  console.error("不適合: " + reason);
}
console.error("文字可読性ゲート: 失敗");
process.exit(1);
