// インスタンス分割文字制御（Issue #21）の性能検証（ローカルGPU計測）。
// Issue #20 の typography-fps.mjs と同じ方式で、Chromium を新しいヘッドレスモード＋ANGLE(D3D11)で起動して
// 実GPUで描画し、typography.html をアニメーション付き（anim=1）で駆動して受け入れ基準を判定する。
// ヘッドレスでもソフトウェア描画にフォールバックしていないことを描画系統名で確認する
// （ソフトウェア描画は実機性能を表さないため。docs/research/08-quality-assurance.md §1）。
// GPUのある環境でのみ合格しうる。GPU無し環境ではソフトウェア描画判定で失敗する。
//
// 実行: BASE=http://localhost:5173 node scripts/typography-instances-fps.mjs （別端末で npm run dev を起動しておく）
import { launchGpuBrowser, closeBrowser } from "./harness/browser.mjs";
import { openPage, waitForReady, warmup, captureScreenshot } from "./harness/page.mjs";
import { readRendererInfo, isSoftwareRenderer } from "./harness/metrics.mjs";
import { BASE, OUT_DIR, DEFAULT_SAMPLE_DURATION_MS, DEFAULT_WARMUP_MS } from "./harness/config.mjs";

// 実測再現の再生開始時刻（ミリ秒）。採用理由を先に述べる。TAKEOVERの開始時刻の集中は約62秒から64秒に
// あり、計測時間の窓にこの最悪集中を確実に含めるため、その手前の58秒から再生を始める
// （typography-fps.mjs と同じ値に揃え、Issue #20 と同一の文字密度で比較する）。
const PEAK_START_MS = 58000;

// 受け入れ基準（☆実装目標値）。平均は55フレーム毎秒以上、単発フレーム落ち（33ミリ秒超）は5回未満。
// この床を採る理由を先に述べる。毎秒60フレームは表示装置の垂直同期による上限であり、実機計測は分散が
// あるため上限ちょうどを合格条件にできない。Issue #20 が確立した堅牢な合格床（平均55・単発落ち5回未満）に
// 揃え、同一の文字密度に4系統のアニメーションを上乗せした条件で同じ床を満たすことを基準にする。
const AVG_FPS_MIN = 55;
const SINGLE_FRAME_DROP_MAX_EXCLUSIVE = 5;
// 無操作の発生回数の上限（この値未満を合格とする）。1を指定して「0回」を合格条件にする。
// 0回を課す理由は、計測した負荷が意図した同時数を代表することを保証するためである。
const ANIM_NOOP_MAX_EXCLUSIVE = 1;

const failures = [];

async function run(browser, options) {
  const { label, query, viewport, deviceScaleFactor, bindFrameRate } = options;
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
    noop: typeof window.__animNoopCount === "function" ? window.__animNoopCount() : -1,
  }));
  await captureScreenshot(page, { outDir: OUT_DIR, name: "typography-instances-" + label });
  const scope = bindFrameRate ? "[判定: 平均と単発落ちと無操作]" : "[参考]";
  console.log(
    `[${label}] ${scope} 描画=${software ? "ソフトウェア" : "GPU"}(${rendererInfo.renderer}) ` +
      `平均=${metrics.avg} 下位5%=${metrics.p5} 単発落ち=${metrics.drops} 無操作=${metrics.noop} ` +
      `ページ例外=${pageErrors.length}`
  );
  if (bindFrameRate && software) {
    failures.push(`${label}: ソフトウェア描画のため実機性能を表さない（GPUのある環境で実行する）`);
  }
  if (bindFrameRate) {
    if (metrics.avg < AVG_FPS_MIN) {
      failures.push(`${label}: 平均${metrics.avg}が${AVG_FPS_MIN}未満`);
    }
    if (metrics.drops >= SINGLE_FRAME_DROP_MAX_EXCLUSIVE) {
      failures.push(`${label}: 単発落ち${metrics.drops}が${SINGLE_FRAME_DROP_MAX_EXCLUSIVE}回未満でない`);
    }
    if (metrics.noop < 0 || metrics.noop >= ANIM_NOOP_MAX_EXCLUSIVE) {
      failures.push(`${label}: 無操作${metrics.noop}が0でない（計測した負荷が意図した同時数を代表しない）`);
    }
  }
  if (pageErrors.length > 0) {
    failures.push(`${label}: ページ例外 ${pageErrors.join(" / ")}`);
  }
  await page.context().close();
}

const { browser, meta } = await launchGpuBrowser({});
console.log(`起動: channel=${meta.channel} angle=${meta.angle} browser=${meta.browserVersion}`);

// 平均フレーム毎秒・単発フレーム落ち・無操作の合否対象（実測再現・デスクトップ・最悪集中区間・アニメーション付き）。
await run(browser, {
  label: "desktop_real_anim",
  query: `profile=real&start=${PEAK_START_MS}&anim=1`,
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
  bindFrameRate: true,
});
// 参考（最大負荷・アニメーション付き。余力確認のみで合否に使わない）。
await run(browser, {
  label: "desktop_maxload_anim",
  query: "profile=maxload&anim=1",
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
  bindFrameRate: false,
});

await closeBrowser(browser);

if (failures.length > 0) {
  console.log("不合格:\n" + failures.join("\n"));
  process.exit(1);
}
console.log(
  "合格: 実GPU描画で、実測再現・最悪集中区間・アニメーション付き（4系統）の同時数において、" +
    "平均55以上・単発落ち5回未満・無操作0を満たす"
);
