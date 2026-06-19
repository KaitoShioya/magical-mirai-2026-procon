// キネティック文字エンジンの性能検証（ローカルGPU計測）。
// Issue #95 の品質検査ハーネスと同じ方式で、Chromium を新しいヘッドレスモード＋ANGLE(D3D11)で起動して
// 実GPUで描画し、typography.html を駆動して受け入れ基準（☆実装目標値）を判定する。
// ヘッドレスでもソフトウェア描画にフォールバックしていないことを描画系統名で確認する
// （ソフトウェア描画は実機性能を表さないため。docs/research/08-quality-assurance.md §1）。
// GPUのある環境でのみ合格しうる。CIのようなGPU無し環境ではソフトウェア描画判定で失敗する。
//
// 実行: BASE=http://localhost:5173 node scripts/typography-fps.mjs  （別端末で npm run dev を起動しておく）
import { launchGpuBrowser, closeBrowser } from "./harness/browser.mjs";
import { openPage, waitForReady, warmup, captureScreenshot } from "./harness/page.mjs";
import { readRendererInfo, isSoftwareRenderer } from "./harness/metrics.mjs";
import { BASE, OUT_DIR, DEFAULT_SAMPLE_DURATION_MS, DEFAULT_WARMUP_MS } from "./harness/config.mjs";

// 実測再現の再生開始時刻（ミリ秒）。採用理由を先に述べる。TAKEOVERの開始時刻の集中は約62秒から64秒に
// あり（1秒窓20字・2秒窓31字・残存4拍で同時24）、計測時間12秒の窓にこの最悪集中を確実に含めるため、
// その手前の58秒から再生を始める。
const PEAK_START_MS = 58000;

// 受け入れ基準（☆実装目標値）。平均は55フレーム毎秒以上、単発フレーム落ち（33ミリ秒超）は5回未満、
// 初回表示遅延は100ミリ秒未満。初回表示遅延は出現が続きワーカーが稼働する区間（実プレイの歌詞区間に相当）
// で測る。理由は、時間的に孤立した単発の出現は troika が後続作業まで sync を遅らせるバッチ挙動の影響を受け、
// 実プレイを代表しないためである。
const AVG_FPS_MIN = 55;
const SINGLE_FRAME_DROP_MAX_EXCLUSIVE = 5;
const INIT_LATENCY_MAX_MS = 100;

const failures = [];

async function run(browser, options) {
  const { label, query, viewport, deviceScaleFactor, bindFrameRate, bindInitLatency } = options;
  const { page, pageErrors } = await openPage(browser, {
    url: `${BASE}/typography.html?${query}`,
    viewport,
    deviceScaleFactor,
    isMobile: deviceScaleFactor > 1,
    cpuThrottle: 1,
  });
  const rendererInfo = await readRendererInfo(page);
  const software = isSoftwareRenderer(rendererInfo.renderer);
  await waitForReady(page, {});
  await warmup(page, { ms: DEFAULT_WARMUP_MS });
  await page.waitForTimeout(DEFAULT_SAMPLE_DURATION_MS);
  const metrics = await page.evaluate(() => ({
    avg: typeof window.__avgFps === "function" ? window.__avgFps() : -1,
    p5: typeof window.__p5Fps === "function" ? window.__p5Fps() : -1,
    drops: typeof window.__frameDrops === "function" ? window.__frameDrops() : -1,
    init: typeof window.__initLatencyMs === "function" ? window.__initLatencyMs() : -1,
  }));
  await captureScreenshot(page, { outDir: OUT_DIR, name: "typography-" + label });
  const scope = bindFrameRate
    ? "[判定: 平均と単発落ち。初回遅延は参考]"
    : bindInitLatency
      ? "[判定: 初回遅延。平均と単発落ちは参考]"
      : "[参考]";
  console.log(
    `[${label}] ${scope} 描画=${software ? "ソフトウェア" : "GPU"}(${rendererInfo.renderer}) ` +
      `平均=${metrics.avg} 下位5%=${metrics.p5} 単発落ち=${metrics.drops} 初回遅延=${metrics.init}ms ` +
      `ページ例外=${pageErrors.length}`
  );
  if ((bindFrameRate || bindInitLatency) && software) {
    failures.push(`${label}: ソフトウェア描画のため実機性能を表さない（GPUのある環境で実行する）`);
  }
  if (bindFrameRate) {
    if (metrics.avg < AVG_FPS_MIN) {
      failures.push(`${label}: 平均${metrics.avg}が${AVG_FPS_MIN}未満`);
    }
    if (metrics.drops >= SINGLE_FRAME_DROP_MAX_EXCLUSIVE) {
      failures.push(`${label}: 単発落ち${metrics.drops}が${SINGLE_FRAME_DROP_MAX_EXCLUSIVE}回未満でない`);
    }
  }
  if (bindInitLatency) {
    if (metrics.init < 0 || metrics.init >= INIT_LATENCY_MAX_MS) {
      failures.push(`${label}: 初回遅延${metrics.init}msが${INIT_LATENCY_MAX_MS}ms未満でない`);
    }
  }
  if (pageErrors.length > 0) {
    failures.push(`${label}: ページ例外 ${pageErrors.join(" / ")}`);
  }
  await page.context().close();
}

const { browser, meta } = await launchGpuBrowser({});
console.log(`起動: channel=${meta.channel} angle=${meta.angle} browser=${meta.browserVersion}`);

// 平均フレーム毎秒と単発フレーム落ちの合否対象（実測再現・デスクトップ・最悪集中区間）。
await run(browser, {
  label: "desktop_real",
  query: `profile=real&start=${PEAK_START_MS}`,
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
  bindFrameRate: true,
  bindInitLatency: false,
});
// 参考（モバイル相当の解像度と画素密度上限2）。
await run(browser, {
  label: "mobile_real",
  query: `profile=real&start=${PEAK_START_MS}`,
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  bindFrameRate: false,
  bindInitLatency: false,
});
// 初回表示遅延の合否対象（最大負荷＝出現が連続しワーカーが稼働する、実プレイの密な歌詞区間に相当する条件）。
// 余力確認も兼ねる。理由は前述（孤立した単発出現は troika のバッチ挙動で代表性を欠くため）。
await run(browser, {
  label: "desktop_maxload",
  query: "profile=maxload",
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
  bindFrameRate: false,
  bindInitLatency: true,
});

await closeBrowser(browser);

if (failures.length > 0) {
  console.log("不合格:\n" + failures.join("\n"));
  process.exit(1);
}
console.log(
  "合格: 実GPU描画で、平均フレーム毎秒と単発フレーム落ちを desktop_real（実測再現・最悪集中区間）で、" +
    "初回表示遅延を desktop_maxload（連続出現）で判定し、いずれも☆目標" +
    "（平均55以上・単発落ち5回未満・初回遅延100ミリ秒未満）を満たす"
);
