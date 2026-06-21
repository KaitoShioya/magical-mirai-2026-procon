// 空間品質ゲート（Issue #100）の本体（手元のローカル実行）。Playwright で空間品質診断ページ（spatial.html）を
// 固定の表示寸法かつ固定の画素密度倍率で開き、奥行きの手がかり（視差・スケール変化・反射）の存在、反射の整合、
// 発光のブルームの存在を判定する。判定ロジックは純粋関数 scripts/harness/spatial-metrics.mjs に分離し、本体は
// ブラウザ操作と結果表示に徹する。失敗時の扱いは仕様で「警告（格下げ可）」のため、--warn-only を与えると不成立が
// あっても終了コード0で返す（提出が逼迫した場合に進行を止めない退避手段）。既定は厳格に終了コード1。
//
// 判定はいずれも2描画の差または相対比であり描画系統に頑健だが、docs/research/08-quality-assurance.md 1節の
// 方針に沿い描画系統名を記録に残す。閾値の初期較正は実機GPUの環境で行う。
//
// 接続先サーバは環境変数 BASE で指定する（既定 http://127.0.0.1:4173）。別端末で開発サーバまたはプレビュー
// サーバを起動してから実行する。
//   PowerShell:  $env:BASE='http://localhost:5173'; node scripts/spatial-quality.mjs
//   Unix系シェル: BASE=http://localhost:5173 node scripts/spatial-quality.mjs
import { chromium } from "playwright";
import { openPage } from "./harness/page.mjs";
import { readRendererInfo } from "./harness/metrics.mjs";
import { DEFAULT_THRESHOLDS, evaluateSpatialAcceptance } from "./harness/spatial-metrics.mjs";

const BASE = process.env.BASE || "http://127.0.0.1:4173";
const warnOnly = process.argv.slice(2).includes("--warn-only");

// 固定の表示寸法と固定の画素密度倍率。2起動の描画バッファ寸法を一致させ、区画格子の画素を対応付ける。
const VIEWPORT = { width: 1280, height: 720 };
const DEVICE_SCALE_FACTOR = 1;

/** 指定の起動時パラメータで診断ページを開き、準備完了（地形読み込みの確定）まで待つ。 */
async function openAndReady(browser, query) {
  const opened = await openPage(browser, {
    url: `${BASE}/spatial.html?${query}`,
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    isMobile: false,
    cpuThrottle: 1,
  });
  await opened.page.waitForFunction(
    () => typeof window.__spatialReady === "function" && window.__spatialReady(),
    undefined,
    { timeout: 30000 }
  );
  return opened;
}

const browser = await chromium.launch();
let rendererInfo = { renderer: "(取得不可)", vendor: "", available: false };
let result = null;
let runError = null;

try {
  // 1回目: 反射有効・ブルーム有効。遠景と近景を描画し、構造状態と3姿勢の射影を読む。
  const first = await openAndReady(browser, "refl=512&bloom=1");
  rendererInfo = await readRendererInfo(first.page);
  const state = await first.page.evaluate(() => window.__spatialState());
  const gridFar512 = await first.page.evaluate(() => window.__spatialCapture("far"));
  const gridNear512 = await first.page.evaluate(() => window.__spatialCapture("near"));
  await first.context.close();

  // 2回目: 反射無効・ブルーム有効。遠景を描画し、反射整合の比較相手にする。
  const second = await openAndReady(browser, "refl=0&bloom=1");
  const gridFar0 = await second.page.evaluate(() => window.__spatialCapture("far"));
  await second.context.close();

  const measurements = {
    structural: {
      webglAvailable: state.webglAvailable,
      reflectionEnabled: state.reflectionEnabled,
      reflectionResolution: state.reflectionResolution,
      waterSource: state.waterSource,
      stageTerrainStatus: state.stageTerrainStatus,
      bloomEnabled: state.bloomEnabled,
      bloomStrength: state.bloomStrength,
      bloomOutputPassEnabled: state.bloomOutputPassEnabled,
    },
    poses: { far: state.poses.far, lateral: state.poses.lateral },
    grids: {
      reflectionOnFar: gridFar512,
      reflectionOffFar: gridFar0,
      near: gridNear512,
    },
  };
  result = evaluateSpatialAcceptance(measurements, DEFAULT_THRESHOLDS);
} catch (error) {
  runError = error instanceof Error ? error.message : String(error);
} finally {
  await browser.close();
}

const rendererLabel = rendererInfo.available ? rendererInfo.renderer : "(取得不可)";
const software = /swiftshader|llvmpipe|software rasterizer|microsoft basic render driver|warp/i.test(
  rendererLabel
);
console.log(`描画系統=${rendererLabel}${software ? "（ソフトウェア描画。初期較正は実機GPUで行う）" : ""}`);

if (runError) {
  console.error("実行に失敗しました: " + runError);
  process.exit(1);
}

for (const [cue, ok] of Object.entries(result.cues)) {
  console.log(`${ok ? "成立" : "不成立"}: ${cue}`);
}

if (result.acceptable) {
  console.log("空間品質ゲート: 成功（6項目すべて成立）");
  process.exit(0);
}

for (const reason of result.reasons) {
  console.error((warnOnly ? "警告: " : "不成立: ") + reason);
}
if (warnOnly) {
  console.log("空間品質ゲート: 警告のみ（--warn-only のため進行を止めません）");
  process.exit(0);
}
console.error("空間品質ゲート: 失敗");
process.exit(1);
