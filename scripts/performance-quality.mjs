// 描画性能ゲート（Issue #97）の本体（手元のローカル実行）。実GPUのブラウザで計測ページ（performance.html）を
// 開き、VRM常在を含む情景の定常区間で毎秒フレーム数を計測し、平均と下位5パーセンタイルの両方が60以上かを
// 判定する。最低フレーム下限（下位5パーセンタイル55）は格下げ不可で、--warn-only を与えても割れたら失敗にする。
// 仕様の正典は docs/research/08-quality-assurance.md の3節と6節、docs/research/03-rendering-ui.md の6節。
//
// 判定行と参考行を分ける。判定行（終了コードに効く）はデスクトップ実GPUのVRM常在満載の1行。モバイル相当の
// 正式判定は実機（Issue #85）が担うため、モバイル相当やVRM要因の各行は参考行とし終了コードに算入しない。
// 計測の信頼性（実GPU・標本・未捕捉例外）は evaluateRunAcceptance、閾値の合否は evaluateFpsAcceptance が担う。
//
// 接続先サーバは環境変数 BASE で指定する（既定 http://localhost:5173）。別端末で開発サーバを起動してから実行する。
//   PowerShell:  $env:BASE='http://localhost:5173'; node scripts/performance-quality.mjs
//   Unix系シェル: BASE=http://localhost:5173 node scripts/performance-quality.mjs
// 任意ノブ: --warn-only / --allow-unknown-renderer / --skip-reference / --duration=12000 / --channel=chromium / --angle=d3d11
import { launchGpuBrowser, closeBrowser } from "./harness/browser.mjs";
import { openPage, waitForReady, warmup, sampleFps, captureScreenshot } from "./harness/page.mjs";
import {
  summarizeFps,
  readRendererInfo,
  isSoftwareRenderer,
  evaluateRunAcceptance,
} from "./harness/metrics.mjs";
import { writeReport } from "./harness/report.mjs";
import { DEFAULT_FPS_THRESHOLDS, evaluateFpsAcceptance } from "./harness/fps-metrics.mjs";
import { BASE, OUT_DIR, PROFILES, DEFAULT_SAMPLE_DURATION_MS } from "./harness/config.mjs";

/** 起動引数を解釈する。`--key=value` と `--flag` の形を受け付ける。 */
function parseArgs(argv) {
  const result = {};
  for (const token of argv) {
    if (!token.startsWith("--")) {
      continue;
    }
    const body = token.slice(2);
    const eq = body.indexOf("=");
    if (eq === -1) {
      result[body] = true;
    } else {
      result[body.slice(0, eq)] = body.slice(eq + 1);
    }
  }
  return result;
}

const args = parseArgs(process.argv.slice(2));
const warnOnly = args["warn-only"] === true;
const allowUnknownRenderer = args["allow-unknown-renderer"] === true;
const skipReference = args["skip-reference"] === true;

// --duration（計測時間ミリ秒）を検証して採る。採用理由を先に述べる。計測時間は page.waitForTimeout へ渡る
// 正の数でなければならず、非数や0以下は計測時間として無意味で、非数（NaN）を渡すと待機が未定義になる。よって
// 有限かつ正の数のときだけ採り、そうでなければ既定値を使い、不正値が与えられたことを警告する（縮退段階 level の
// 検証と同水準に揃える）。
function resolveDurationMs(raw) {
  if (typeof raw !== "string") {
    return DEFAULT_SAMPLE_DURATION_MS;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.warn(
      `警告: --duration の値「${raw}」は有限の正の数ではありません。既定の ${DEFAULT_SAMPLE_DURATION_MS} ミリ秒を使います。`
    );
    return DEFAULT_SAMPLE_DURATION_MS;
  }
  return parsed;
}
const durationMs = resolveDurationMs(args.duration);

// 端末プロファイルを名前で引く（表示寸法・端末画素倍率・モバイル指定・処理速度絞りは config.mjs を唯一の出所とする）。
// config.mjs の PROFILES[].query（反射解像度や発光点数など）は計測ツール prototype.html 向けで、本ゲートは使わない。
// 計測ページ performance.html へ渡すクエリは下記 ROWS 側で指定する。
function profileByName(name) {
  const profile = PROFILES.find((p) => p.name === name);
  if (!profile) {
    throw new Error(`端末プロファイル ${name} が scripts/harness/config.mjs に見つかりません`);
  }
  return profile;
}

// 計測行。すべて同一の計測ページ performance.html を叩き、端末プロファイルとクエリだけを変える。
// 判定行は1行のみ（デスクトップ・VRM常在満載）。参考行は研究文書 docs/research/03 の6節の律速切り分けに対応する。
const ROWS = [
  {
    label: "判定 デスクトップVRM常在満載",
    profile: "desktop",
    query: "miku=1&reflectMiku=1&bloom=1&refl=512",
    binding: true,
  },
  {
    label: "参考 モバイル相当VRM常在満載",
    profile: "mobile",
    query: "miku=1&reflectMiku=1&bloom=1&refl=512",
    binding: false,
  },
  {
    label: "参考 デスクトップVRMなし基準",
    profile: "desktop",
    query: "miku=0&bloom=1&refl=512",
    binding: false,
  },
  {
    label: "参考 デスクトップVRM反射除外",
    profile: "desktop",
    query: "miku=1&reflectMiku=0&bloom=1&refl=512",
    binding: false,
  },
  {
    label: "参考 デスクトップブルーム除外",
    profile: "desktop",
    query: "miku=1&reflectMiku=1&bloom=0&refl=512",
    binding: false,
  },
];

const rowsToRun = skipReference ? ROWS.filter((row) => row.binding) : ROWS;

/** 1行を計測する。例外は行へ残す。 */
async function measureRow(browser, row) {
  const device = profileByName(row.profile);
  const url = `${BASE}/performance.html?${row.query}`;
  const record = {
    label: row.label,
    binding: row.binding,
    profile: row.profile,
    url,
    renderer: "",
    vendor: "",
    rendererInfoAvailable: false,
    trusted: false,
    fps: summarizeFps([]),
    avgFpsHook: -1,
    artifacts: [],
    errors: [],
    runAcceptance: null,
    fpsAcceptance: null,
  };

  let context;
  let pageErrors = [];
  let measuredAvgFps = 0;
  try {
    const opened = await openPage(browser, {
      url,
      viewport: device.viewport,
      deviceScaleFactor: device.deviceScaleFactor,
      isMobile: device.isMobile,
      cpuThrottle: device.cpuThrottle,
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

    await warmup(page, {});
    const measured = await sampleFps(page, { durationMs });
    record.fps = summarizeFps(measured.samples);
    record.avgFpsHook = measured.avgFps;
    measuredAvgFps = measured.avgFps;

    const shot = await captureScreenshot(page, { outDir: OUT_DIR, name: "perf-gate-" + row.label });
    record.artifacts.push({ type: "screenshot", path: shot.path });
  } catch (error) {
    record.errors.push(error instanceof Error ? error.message : String(error));
  } finally {
    if (context) {
      await context.close();
    }
  }

  for (const message of pageErrors) {
    if (!record.errors.includes(message)) {
      record.errors.push(message);
    }
  }

  // 計測の信頼性（実GPU・標本・未捕捉例外）を判定する。
  record.runAcceptance = evaluateRunAcceptance({
    trusted: record.trusted,
    rendererInfoAvailable: record.rendererInfoAvailable,
    avgFps: measuredAvgFps,
    sampleCount: record.fps.count,
    pageErrorCount: pageErrors.length,
    allowUnknownRenderer,
  });

  // 閾値の合否は判定行についてだけ評価する。参考行は計測成立性のみを残し終了コードに算入しない。
  if (row.binding && record.runAcceptance.acceptable) {
    record.fpsAcceptance = evaluateFpsAcceptance({ avgFps: record.fps.avg, p5Fps: record.fps.p5 });
  }

  return record;
}

// ---- 計測 ----
const { browser, meta } = await launchGpuBrowser({
  channel: typeof args.channel === "string" ? args.channel : undefined,
  angle: typeof args.angle === "string" ? args.angle : undefined,
});
console.log(`起動: 経路=${meta.channel} ANGLE=${meta.angle} ブラウザ=${meta.browserVersion}`);

const records = [];
try {
  for (const row of rowsToRun) {
    records.push(await measureRow(browser, row));
  }
} finally {
  await closeBrowser(browser);
}

// ---- 表示 ----
const showNum = (value, digits = 0) => (typeof value === "number" ? value.toFixed(digits) : "取得不可");
const showRendererKind = (record) =>
  record.trusted ? "GPU" : record.rendererInfoAvailable ? "ソフトウェア" : "不明";

for (const record of records) {
  const kind = record.binding ? "判定" : "参考";
  let line =
    `[${record.label}] 種別=${kind} ` +
    `平均=${showNum(record.fps.avg, 1)} 下位5%=${showNum(record.fps.p5)} 生最低=${showNum(record.fps.min)} 標本=${record.fps.count} ` +
    `描画系統=${showRendererKind(record)}(${record.renderer || "取得不可"})`;
  if (record.errors.length > 0) {
    line += ` 例外=${record.errors.join(" / ")}`;
  }
  console.log(line);
  if (!record.binding) {
    console.log("  参考（終了コードに影響しない）");
  }
}

// ---- 記録JSON ----
const report = {
  generatedAt: new Date().toISOString(),
  base: BASE,
  browser: { channel: meta.channel, angle: meta.angle, browserVersion: meta.browserVersion, args: meta.args },
  thresholds: DEFAULT_FPS_THRESHOLDS,
  durationMs,
  warnOnly,
  skipReference,
  rows: records,
};
const { path } = await writeReport(report, { outDir: OUT_DIR, name: "performance-gate.json" });
console.log("記録: " + path);

// ---- 判定行に基づく終了コード ----
const binding = records.find((record) => record.binding);
if (!binding) {
  console.error("描画性能ゲート: 判定行が実行されませんでした");
  process.exit(1);
}

// 計測が信頼できない場合は閾値判定以前に失敗（実機性能を表さない計測では合否を出せないため）。
if (!binding.runAcceptance.acceptable) {
  for (const reason of binding.runAcceptance.reasons) {
    console.error("計測不成立: " + reason);
  }
  if (isSoftwareRenderer(binding.renderer)) {
    console.error("実GPU環境で実行してください（初期較正は実機GPUで行う）。");
  }
  console.error("描画性能ゲート: 失敗（判定行の計測が信頼できません）");
  process.exit(1);
}

// 不成立の理由は格下げ不可の床割れを先頭に、続いて格下げ可の目標未達を列挙してから1回だけ終了する。
const fps = binding.fpsAcceptance;
const floorReasons = fps.reasons.floor;
const targetReasons = fps.reasons.target;

for (const reason of floorReasons) {
  console.error("最低フレーム下限の割れ（格下げ不可）: " + reason);
}
for (const reason of targetReasons) {
  console.error((warnOnly ? "警告（目標未達）: " : "目標未達: ") + reason);
}

if (fps.floorBreached) {
  // 床割れは --warn-only でも失敗にする（docs/research/08 §6 の格下げ不可）。
  console.error("描画性能ゲート: 失敗（最低フレーム下限を割りました。--warn-only でも格下げ不可）");
  process.exit(1);
}

if (!fps.targetMet) {
  if (warnOnly) {
    console.log("描画性能ゲート: 警告のみ（--warn-only のため目標未達でも進行を止めません）");
    process.exit(0);
  }
  console.error("描画性能ゲート: 失敗（目標未達）");
  process.exit(1);
}

console.log("描画性能ゲート: 成功（平均と下位5パーセンタイルが目標以上、最低フレーム下限を満たす）");
process.exit(0);
