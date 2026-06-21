// 表示同期ゲート（Issue #99）の本体（手元のローカル実行）。Playwright で表示同期診断ページ（display-sync.html）を
// 開き、表示粒度の切替が楽曲構造の境界に同期し、動きの発火がビートと声量の山に乗ることを、拍に対する相対許容で検査する。
// 判定ロジックは純粋関数 src/typography/kineticText/diagnostics/displaySyncGate.ts に分離し、診断ページが実行する。
// 本体はブラウザ操作と結果表示に徹する。描画を要しないため GPU 起動引数は不要。
//
// 失敗時の扱いは仕様で「警告（格下げ可）」のため、--warn-only を与えると不成立でも終了コード0で返す（提出が逼迫した
// 場合に進行を止めない退避手段）。既定は厳格に終了コード1。
//
// 接続先サーバは環境変数 BASE で指定する（既定 http://127.0.0.1:4173）。別端末で開発サーバまたはプレビュー
// サーバを起動してから実行する。
//   PowerShell:  $env:BASE='http://localhost:5173'; node scripts/display-sync-quality.mjs
//   Unix系シェル: BASE=http://localhost:5173 node scripts/display-sync-quality.mjs
import { chromium } from "playwright";
import { openPage } from "./harness/page.mjs";

const args = process.argv.slice(2);
const BASE = process.env.BASE || "http://127.0.0.1:4173";
const warnOnly = args.includes("--warn-only");
// 検証用の閾値上書きを診断ページへ渡す起動時パラメータ（例 --query=coverageMinFraction=2）。
// 閾値を変えた場合の合否を手元で確かめるための診断用。指定が無ければ既定閾値で動く。
const queryArg = args.find((a) => a.startsWith("--query="));
const query = queryArg ? queryArg.slice("--query=".length) : "";
const pageUrl = query ? `${BASE}/display-sync.html?${query}` : `${BASE}/display-sync.html`;

const VIEWPORT = { width: 1280, height: 720 };

function formatStat(stat) {
  const fmt = (v) => (v === null || v === undefined ? "なし" : v.toFixed(2));
  return `中央値=${fmt(stat.medianBeats)}拍 95パーセンタイル=${fmt(stat.p95Beats)}拍 最大=${fmt(stat.maxBeats)}拍`;
}

const browser = await chromium.launch();
let verdict = null;
let runError = null;

try {
  const opened = await openPage(browser, {
    url: pageUrl,
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    isMobile: false,
    cpuThrottle: 1,
  });
  await opened.page.waitForFunction(
    () => typeof window.__displaySyncReady === "function" && window.__displaySyncReady(),
    undefined,
    { timeout: 30000 }
  );
  verdict = await opened.page.evaluate(() => window.__displaySyncVerdict());
  await opened.context.close();
} catch (error) {
  runError = error instanceof Error ? error.message : String(error);
} finally {
  await browser.close();
}

if (runError) {
  console.error("実行に失敗しました: " + runError);
  process.exit(1);
}

const r = verdict.ratios;
const d = verdict.distances;
console.log(`件数: 粒度切替=${verdict.counts.switchCount} 発火=${verdict.counts.fireCount}`);
console.log("接地率（合否対象、寛容）:");
console.log(`  粒度切替=${r.switchGroundedRatio.toFixed(3)}  発火=${r.fireGroundedRatio.toFixed(3)}`);
console.log("名前付き同期率（情報）:");
console.log(
  `  粒度切替→構造境界=${r.granularityStructureSync.toFixed(3)}  発火→ビート=${r.fireBeatSync.toFixed(3)}  発火→声量の山=${r.fireLoudnessPeakSync.toFixed(3)}`
);
console.log("最近傍距離（情報、拍単位）:");
console.log(`  粒度切替→構造境界∪ビート: ${formatStat(d.switchToStructureOrBeat)}`);
console.log(`  発火→ビート∪声量の山: ${formatStat(d.fireToBeatOrPeak)}`);
console.log(`  発火→文字開始: ${formatStat(d.fireToVocalOnset)}`);

for (const [cue, ok] of Object.entries(verdict.cues)) {
  console.log(`${ok ? "成立" : "不成立"}: ${cue}`);
}

for (const warning of verdict.warnings) {
  console.log("警告: " + warning);
}
for (const issue of verdict.sourceIssues) {
  console.error("既定記録源の不整合: " + issue);
}

if (verdict.acceptable) {
  console.log("表示同期ゲート: 成功");
  process.exit(0);
}

for (const reason of verdict.reasons) {
  console.error((warnOnly ? "警告: " : "不成立: ") + reason);
}
if (warnOnly) {
  console.log("表示同期ゲート: 警告のみ（--warn-only のため進行を止めません）");
  process.exit(0);
}
console.error("表示同期ゲート: 失敗");
process.exit(1);
