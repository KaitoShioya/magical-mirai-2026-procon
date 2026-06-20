// 平面反射の性能ゲート（Issue #9・ローカルGPU計測）。
// Issue #95 の品質検査ハーネスと同じ方式で、Chromium を新しいヘッドレスモードと ANGLE(DirectX11) で
// 起動して実GPUで描画し、試作 prototype.html を駆動して受け入れ基準を判定する。
//
// 判定対象が prototype.html である理由を先に述べる。本編アプリはブルーム（#11）・発光点本実装（#10）・
// 雨・カメラ軌跡（#13）を統合しておらず反射対象がほぼ無い空シーンで代表性を欠くこと、本編アプリは
// フレーム計測フックを持たないこと、試作の反射の構成が本編 src/rendering/water.ts へ移植する構成と
// 同一であること、による。本編統合状態の反射性能の再計測は Issue #97 へ委譲する。
//
// 受け入れ基準（Issue #9）: 解像度1920x1080・画素密度上限2・反射解像度256と512の双方で、
// 平均55フレーム毎秒以上かつ最低（下位5パーセンタイル）45フレーム毎秒以上。
// 「最低」を下位5パーセンタイルで判定する理由を先に述べる。生の最小値は単発の谷（ごみ集めや基本ソフトの
// 割り込み）に過敏で再現性が低い。計測時間12秒・500ミリ秒区間で標本21以上を確保し、下位5パーセンタイルが
// 最小値と一致しない設計（scripts/harness/config.mjs）であり、研究文書 §6 も平均と下位5パーセンタイルの
// 両方で下限を満たすと規定するため、これを採る。生の最小値は参考として表示する。
//
// ソフトウェア描画（SwiftShader 等）は実機性能を表さないため合格させない。GPU の無い環境では失敗する。
// 実行: BASE=http://localhost:5173 node scripts/reflection-fps.mjs  （別端末で npm run dev を起動しておく）
import { launchGpuBrowser, closeBrowser } from "./harness/browser.mjs";
import { openPage, waitForReady, warmup, sampleFps, captureScreenshot } from "./harness/page.mjs";
import { readRendererInfo, isSoftwareRenderer, percentileNearestRank, summarizeFps } from "./harness/metrics.mjs";
import { BASE, OUT_DIR, DEFAULT_SAMPLE_DURATION_MS, DEFAULT_WARMUP_MS } from "./harness/config.mjs";

// 受け入れ基準の閾値。
const AVG_FPS_MIN = 55;
const P5_FPS_MIN = 45;
// 受け入れ基準の解像度1920x1080・画素密度上限2。
// deviceScaleFactor を1にする理由を先に述べる。受け入れ基準の「DPR上限2」はアプリの画素密度の上限
// （試作の dpr ノブの既定2＝上限）を指し、試作は Math.min(window.devicePixelRatio, 2) で実際の画素密度を
// 決める。標準的な1920x1080のデスクトップ表示は端末の画素密度が1で、実効解像度は1920x1080（上限2は
// 拘束しない）になる。これが受け入れ基準の表す環境であり、既存の scripts/prototype-fps.mjs のデスクトップ
// 計測も deviceScaleFactor を1としている。dpr ノブは既定の2（上限）をそのまま使うため query で指定しない。
const VIEWPORT = { width: 1920, height: 1080 };
const DEVICE_SCALE_FACTOR = 1;

const failures = [];

/**
 * 試作 prototype.html の1ケースを計測する。
 * @param {import("playwright").Browser} browser
 * @param {{ label: string, query: string, gate: boolean }} options gate が真のとき合否対象。
 */
async function measure(browser, options) {
  const { label, query, gate } = options;
  const { page, pageErrors } = await openPage(browser, {
    url: `${BASE}/prototype.html?${query}`,
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    isMobile: false,
    cpuThrottle: 1,
  });
  const rendererInfo = await readRendererInfo(page);
  const software = isSoftwareRenderer(rendererInfo.renderer);
  await waitForReady(page, {});
  await warmup(page, { ms: DEFAULT_WARMUP_MS });
  const { samples, avgFps } = await sampleFps(page, { durationMs: DEFAULT_SAMPLE_DURATION_MS });
  const summary = summarizeFps(samples);
  const p5 = percentileNearestRank(samples, 5);
  await captureScreenshot(page, { outDir: OUT_DIR, name: "reflection-proto-" + label });
  const scope = gate ? "[判定: 平均と下位5パーセンタイル]" : "[参考]";
  console.log(
    `[${label}] ${scope} 描画=${software ? "ソフトウェア" : "GPU"}(${rendererInfo.renderer}) ` +
      `平均=${avgFps.toFixed(1)} 下位5%=${p5} 生最小=${summary.min} 標本数=${summary.count} ` +
      `ページ例外=${pageErrors.length}`
  );
  if (gate) {
    if (software) {
      failures.push(`${label}: ソフトウェア描画のため実機性能を表さない（GPUのある環境で実行する）`);
    }
    if (avgFps < AVG_FPS_MIN) {
      failures.push(`${label}: 平均${avgFps.toFixed(1)}が${AVG_FPS_MIN}未満`);
    }
    if (p5 < P5_FPS_MIN) {
      failures.push(`${label}: 下位5パーセンタイル${p5}が${P5_FPS_MIN}未満`);
    }
  }
  if (pageErrors.length > 0) {
    failures.push(`${label}: ページ例外 ${pageErrors.join(" / ")}`);
  }
  await page.context().close();
}

/**
 * 本編アプリの診断モードを実GPUで開き、反射の有無の視覚証跡（スクリーンショット）を保存する。
 * 診断モードを使う理由を先に述べる。診断モードはトークン非依存の擬似再生を用いるため、楽曲トークン
 * なしで湖面と暫定発光点を描画でき、撮影できる。これは反射が本編の描画に配線されていることの視覚証跡
 * であり、楽曲読込後の最終的な統合の見えは Issue #97 で確認する。
 * @param {import("playwright").Browser} browser
 * @param {{ label: string, refl: string }} options
 */
async function captureApp(browser, options) {
  const { label, refl } = options;
  const { page, pageErrors } = await openPage(browser, {
    url: `${BASE}/?smoke=1&refl=${refl}`,
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    isMobile: false,
    cpuThrottle: 1,
  });
  // 本編の描画ループが数フレーム回るのを待ってから撮影する。
  await page.waitForTimeout(2000);
  await captureScreenshot(page, { outDir: OUT_DIR, name: "reflection-app-" + label });
  console.log(`[app-${label}] 本編診断モードのスクリーンショットを保存 ページ例外=${pageErrors.length}`);
  if (pageErrors.length > 0) {
    failures.push(`app-${label}: ページ例外 ${pageErrors.join(" / ")}`);
  }
  await page.context().close();
}

const { browser, meta } = await launchGpuBrowser({});
console.log(`起動: channel=${meta.channel} angle=${meta.angle} browser=${meta.browserVersion}`);

// 合否対象（反射解像度256と512）。
await measure(browser, { label: "refl512", query: "refl=512&bloomScale=0.5&points=300", gate: true });
await measure(browser, { label: "refl256", query: "refl=256&bloomScale=0.5&points=300", gate: true });
// 参考（反射無効時の上限の目安。反射の費用の切り分けに使う）。
await measure(browser, { label: "refl0", query: "refl=0&bloomScale=0.5&points=300", gate: false });

// 本編アプリの反射の有無の視覚証跡。
await captureApp(browser, { label: "refl512", refl: "512" });
await captureApp(browser, { label: "refl0", refl: "0" });

await closeBrowser(browser);

if (failures.length > 0) {
  console.log("不合格:\n" + failures.join("\n"));
  process.exit(1);
}
console.log(
  "合格: 実GPU描画で、反射解像度256と512の双方が、解像度1920x1080・画素密度上限2で" +
    "平均55フレーム毎秒以上かつ下位5パーセンタイル45フレーム毎秒以上を満たす"
);
