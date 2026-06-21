// 描画性能の予算表を出す計測ツール（Issue #19）。
// prototype.html を実GPUで駆動し、デスクトップとモバイル相当の各描画設定で毎秒フレーム数・描画命令数・
// 実効画素密度倍率を測り、どの設定なら毎秒60フレームの予算に収まるかを一覧（予算表）にする。
//
// 本スクリプトは「計測の道具」であり「品質ゲート」ではない。フレーム数の不足やソフトウェア描画では
// 終了コードを失敗にしない（参照注記として表示するだけにする）。計測そのものが成立しなかった行
// （未捕捉のページ例外、または標本が1件も採れない）があるときだけ非ゼロで終了する。正式な性能の合否判定は
// Issue #97（描画性能ゲート）と Issue #85（実機テストマトリクス）が担うため、本ツールをゲートへ転用しない。
//
// 実機性能を測るには実GPUが要る。既定のヘッドレスはソフトウェア描画へ落ち計測値が実機を表さないため、
// 品質検査ハーネスと同じく新しいヘッドレスモードと ANGLE(DirectX11) で起動し、描画系統名を実測して表示する。
//
// 起動・ページ操作・指標算出・レポート書き出しの共通部品は品質検査ハーネス（scripts/harness）と共有する。
// 接続先の既定はハーネスの設定（scripts/harness/config.mjs の BASE、5173番）に一本化する。
// 実行: BASE=http://localhost:5173 node scripts/prototype-fps.mjs  （別端末で npm run dev を起動しておく）
import { launchGpuBrowser, closeBrowser } from "./harness/browser.mjs";
import {
  openPage,
  waitForReady,
  warmup,
  sampleFps,
  captureScreenshot,
} from "./harness/page.mjs";
import { summarizeFps, isSoftwareRenderer, readRendererInfo } from "./harness/metrics.mjs";
import { writeReport } from "./harness/report.mjs";
import {
  BASE,
  OUT_DIR,
  PROFILES,
  PROTOTYPE_PATH,
  DEFAULT_SAMPLE_DURATION_MS,
  DEFAULT_WARMUP_MS,
} from "./harness/config.mjs";

// 予算の参照閾値。理由を先に述べる。平均だけでは瞬間的なカクつきを見逃すため、研究文書
// docs/research/08 の3節は平均と下位5パーセンタイルの両方で毎秒60フレームの下限を求める。描画命令数は
// docs/research/03 の3節と Issue #18 が「おおむね100回までで多くの端末が60フレームを保つ」として100未満を
// 目安にする。本ツールはこれらを終了コードを変えない参照注記として表示する。
const BUDGET_FPS = 60;
const DRAW_CALL_BUDGET = 100;

// 端末プロファイルを名前で引く。表示領域・端末画素倍率・処理速度絞りは config.mjs の PROFILES を唯一の
// 出所とし、同じ数値を本ファイルへ書き写さない。
function deviceByName(name) {
  const profile = PROFILES.find((p) => p.name === name);
  if (!profile) {
    throw new Error(`端末プロファイル ${name} が scripts/harness/config.mjs に見つからない`);
  }
  return profile;
}
const desktop = deviceByName("desktop");
const mobile = deviceByName("mobile");

// 計測する描画設定の行列。各行はラベルとクエリだけを持つ。端末寸法は device から引く。
// デスクトップは満載と反射無効の2行（反射費用の切り分け）。モバイル相当は満載から、画素密度→後処理→反射の
// 順に1段ずつ累積で負荷を落とす劣化はしご（下げた負荷は後の行で戻さない）。発光点は全行300で固定する。
const ROWS = [
  { profile: "desktop", device: desktop, label: "D0 満載", query: "refl=512&bloomScale=0.5&points=300" },
  { profile: "desktop", device: desktop, label: "D1 反射無効", query: "refl=0&bloomScale=0.5&points=300" },
  { profile: "mobile", device: mobile, label: "M0 満載", query: "refl=512&bloomScale=0.5&points=300&dpr=2" },
  { profile: "mobile", device: mobile, label: "M1 画素密度↓", query: "refl=512&bloomScale=0.5&points=300&dpr=1" },
  { profile: "mobile", device: mobile, label: "M2 ブルーム解像度↓", query: "refl=512&bloomScale=0.4&points=300&dpr=1" },
  { profile: "mobile", device: mobile, label: "M3 ブルーム無効", query: "refl=512&bloom=0&points=300&dpr=1" },
  { profile: "mobile", device: mobile, label: "M4 反射解像度↓", query: "refl=256&bloom=0&points=300&dpr=1" },
  { profile: "mobile", device: mobile, label: "M5 反射無効", query: "refl=0&bloom=0&points=300&dpr=1" },
];

// クエリ文字列から反射・ブルームの設定値を読む（表示用）。計測ページの既定と同じ既定値を用いる。
function readKnobs(query) {
  const params = new URLSearchParams(query);
  return {
    reflectionResolution: params.has("refl") ? Number(params.get("refl")) : 512,
    bloomEnabled: params.has("bloom") ? Number(params.get("bloom")) !== 0 : true,
    bloomResolutionScale: params.has("bloomScale") ? Number(params.get("bloomScale")) : 0.5,
  };
}

// 1行を計測する。本編の品質検査ハーネス run-local.mjs と同じく try-catch-finally で囲み、例外を行へ残す。
async function measureRow(browser, row) {
  const knobs = readKnobs(row.query);
  const record = {
    profile: row.profile,
    label: row.label,
    query: row.query,
    reflectionResolution: knobs.reflectionResolution,
    bloomEnabled: knobs.bloomEnabled,
    bloomResolutionScale: knobs.bloomResolutionScale,
    renderer: "",
    vendor: "",
    rendererInfoAvailable: false,
    trusted: false,
    pixelRatio: null,
    fps: summarizeFps([]),
    drawCalls: null,
    withinBudget60: null,
    drawCallsWithinBudget: null,
    artifacts: [],
    errors: [],
    failed: false,
  };

  const url = BASE + PROTOTYPE_PATH + "?" + row.query;
  let context;
  let pageErrors = [];
  let caught = false;
  try {
    const opened = await openPage(browser, {
      url,
      viewport: row.device.viewport,
      deviceScaleFactor: row.device.deviceScaleFactor,
      isMobile: row.device.isMobile,
      cpuThrottle: row.device.cpuThrottle,
    });
    context = opened.context;
    pageErrors = opened.pageErrors;
    record.errors = [...opened.errors];
    const page = opened.page;

    await waitForReady(page, {});

    const info = await readRendererInfo(page);
    record.renderer = info.renderer;
    record.vendor = info.vendor;
    record.rendererInfoAvailable = info.available;
    record.trusted = info.available && !isSoftwareRenderer(info.renderer);

    await warmup(page, { ms: DEFAULT_WARMUP_MS });
    const measured = await sampleFps(page, { durationMs: DEFAULT_SAMPLE_DURATION_MS });
    record.fps = summarizeFps(measured.samples);

    // 描画命令数と画素密度倍率を実測フックから読む。数値でないとき（フック未公開・最初の描画前の空値）は空値。
    const probe = await page.evaluate(() => {
      const drawCalls = typeof window.__drawCalls === "function" ? window.__drawCalls() : null;
      const pixelRatio = typeof window.__pixelRatio === "function" ? window.__pixelRatio() : null;
      return {
        drawCalls: typeof drawCalls === "number" ? drawCalls : null,
        pixelRatio: typeof pixelRatio === "number" ? pixelRatio : null,
      };
    });
    record.drawCalls = probe.drawCalls;
    record.pixelRatio = probe.pixelRatio;

    const shot = await captureScreenshot(page, {
      outDir: OUT_DIR,
      name: "perf-budget-" + row.profile + "-" + row.label,
    });
    record.artifacts.push({ type: "screenshot", path: shot.path });
  } catch (error) {
    caught = true;
    record.errors.push(error instanceof Error ? error.message : String(error));
  } finally {
    if (context) {
      await context.close();
    }
  }

  // 未捕捉のページ例外を記録へ残す（良性のコンソールエラーは errors に既に入っている）。
  for (const message of pageErrors) {
    if (!record.errors.includes(message)) {
      record.errors.push(message);
    }
  }

  // 予算の参照注記。標本が無い・描画命令数が取得不能のときは空値にし、未達や実測0と混同しない。
  record.withinBudget60 =
    record.fps.count > 0 ? record.fps.avg >= BUDGET_FPS && record.fps.p5 >= BUDGET_FPS : null;
  record.drawCallsWithinBudget =
    typeof record.drawCalls === "number" ? record.drawCalls < DRAW_CALL_BUDGET : null;

  // 計測の成否。未捕捉例外、または標本が1件も採れなかった行を計測不成立とする。
  record.failed = caught || pageErrors.length > 0 || record.fps.count === 0;

  return record;
}

// ---- 表示の補助 ----
const showNum = (value, digits = 0) => (typeof value === "number" ? value.toFixed(digits) : "取得不可");
const showDrawCalls = (value) => (typeof value === "number" ? String(value) : "取得不可");
const showBloom = (enabled, scale) => (enabled ? "有効@" + scale : "無効");
const showRendererKind = (record) =>
  record.trusted ? "GPU" : record.rendererInfoAvailable ? "ソフトウェア" : "不明";
const showBudget60 = (value) => (value === null ? "判定不可" : value ? "収まる" : "外れる");
const showDrawBudget = (value) => (value === null ? "取得不可" : value ? "満たす" : "超過");

function printRow(record) {
  let line =
    `[${record.label}] 画素密度=${showNum(record.pixelRatio, 1)} ` +
    `反射=${record.reflectionResolution} ブルーム=${showBloom(record.bloomEnabled, record.bloomResolutionScale)} ` +
    `平均=${showNum(record.fps.avg, 1)} 下位5%=${showNum(record.fps.p5)} 生最低=${showNum(record.fps.min)} 標本=${record.fps.count} ` +
    `描画命令=${showDrawCalls(record.drawCalls)} ` +
    `描画系統=${showRendererKind(record)}(${record.renderer || "取得不可"}) ` +
    `信頼=${record.trusted ? "可" : "不可"} 60予算=${showBudget60(record.withinBudget60)} 命令100未満=${showDrawBudget(record.drawCallsWithinBudget)}`;
  if (record.errors.length > 0) {
    line += ` 例外=${record.errors.join(" / ")}`;
  }
  console.log(line);
}

// ---- 計測 ----
const { browser, meta } = await launchGpuBrowser({});
console.log(`起動: 経路=${meta.channel} ANGLE=${meta.angle} ブラウザ=${meta.browserVersion}`);

const rows = [];
try {
  for (const row of ROWS) {
    rows.push(await measureRow(browser, row));
  }
} finally {
  await closeBrowser(browser);
}

// ---- 予算表の印字（profile ごと） ----
const PROFILE_TITLES = { desktop: "デスクトップ profile", mobile: "モバイル相当 profile" };
const LEGEND =
  "凡例: 下位5%は標本数に依存する。生最低値を併記する。標本=0 の行の平均0は計測できなかったことを表し、実測の0フレームではない。";
for (const profileName of ["desktop", "mobile"]) {
  const groupRows = rows.filter((r) => r.profile === profileName);
  if (groupRows.length === 0) {
    continue;
  }
  console.log("== " + PROFILE_TITLES[profileName] + " ==");
  console.log(LEGEND);
  for (const record of groupRows) {
    printRow(record);
  }
}

// 実機性能を表さない行があるときの警告（信頼可否が偽＝ソフトウェア描画または描画系統名不取得）。
if (rows.some((r) => !r.trusted)) {
  console.log(
    "警告: 実機性能を表さない計測値が含まれる（ソフトウェア描画、または描画系統名が取得できない行がある）。実GPU環境で実行すること。"
  );
}

// 成功行数と失敗行数。
const failedCount = rows.filter((r) => r.failed).length;
const successCount = rows.length - failedCount;
console.log(`計測: 成功${successCount}行 失敗${failedCount}行`);

// ---- 記録JSON ----
// writeReport はファイル名をそのまま使い拡張子を付けないため、拡張子込みで渡す。独自の表構造のため buildReport は使わない。
const report = {
  generatedAt: new Date().toISOString(),
  base: BASE,
  browser: { channel: meta.channel, angle: meta.angle, browserVersion: meta.browserVersion, args: meta.args },
  budget: { fps: BUDGET_FPS, drawCalls: DRAW_CALL_BUDGET },
  rows,
};
const { path } = await writeReport(report, { outDir: OUT_DIR, name: "perf-budget.json" });
console.log("記録: " + path);

// 終了コード。計測が成立しなかった行が1行でもあれば非ゼロ。フレーム数やソフトウェア描画では失敗にしない。
process.exit(failedCount > 0 ? 1 : 0);
