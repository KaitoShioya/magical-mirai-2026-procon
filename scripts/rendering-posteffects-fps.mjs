// 拍同期ポストエフェクト（Issue #17）の性能ゲート（ローカルGPU計測）。Issue #95 の品質検査ハーネスと同じ方式で
// Chromium を新しいヘッドレスモードと ANGLE(DirectX11) で起動して実GPUで描画し、診断ページ posteffects.html を
// 連続描画モード（?perf=1）で駆動して毎秒フレーム数を判定する。
//
// 後処理を有効にした全画面の追加パスの負荷を、表示寸法1920x1080で画素密度1と2の両方について見る理由を先に
// 述べる。受け入れ基準が「画素密度上限2」であり、全画面の追加パスは画素密度2で描画画素が4倍になるため、上限の
// 負荷を見ないと保証にならない。閾値は平面反射の性能ゲート（scripts/reflection-fps.mjs）と同一（平均55フレーム
// 毎秒以上かつ下位5パーセンタイル45フレーム毎秒以上）を採り、判定基準をプロジェクトで統一する。
//
// 後処理を無効にした基準（?posteffect=0）も各画素密度で計測し、後処理有効との平均差を参考表示する。平均差を
// 合否にしない理由を先に述べる。高フレーム率での毎秒フレーム数の差は単発の谷に過敏で再現性が低く、絶対閾値の
// 判定の方が安定する。
//
// ソフトウェア描画（SwiftShader 等）は実機性能を表さないため合格させない。GPU の無い環境では失敗する。
// 実行: BASE=http://localhost:5173 node scripts/rendering-posteffects-fps.mjs  （別端末で npm run dev を起動しておく）
import { launchGpuBrowser, closeBrowser } from "./harness/browser.mjs";
import { openPage, waitForReady, warmup, sampleFps, captureScreenshot } from "./harness/page.mjs";
import { readRendererInfo, isSoftwareRenderer, percentileNearestRank, summarizeFps } from "./harness/metrics.mjs";
import { BASE, OUT_DIR, DEFAULT_SAMPLE_DURATION_MS, DEFAULT_WARMUP_MS } from "./harness/config.mjs";

// 受け入れ基準の閾値（reflection-fps.mjs と同一）。
const AVG_FPS_MIN = 55;
const P5_FPS_MIN = 45;
// 受け入れ基準の解像度1920x1080。画素密度1と2の両方を計測する（後処理は全画面のため画素密度の影響を直に受ける）。
const VIEWPORT = { width: 1920, height: 1080 };

const failures = [];

/**
 * 診断ページ posteffects.html の1ケースを計測する。
 * @param {import("playwright").Browser} browser
 * @param {{ label: string, deviceScaleFactor: number, postEffect: boolean, gate: boolean }} options
 *   gate が真のとき合否対象。postEffect が偽のときは ?posteffect=0 で後処理パスを無効にした基準を計測する。
 * @returns {Promise<number>} 平均の毎秒フレーム数。
 */
async function measure(browser, options) {
  const { label, deviceScaleFactor, postEffect, gate } = options;
  const query = postEffect ? "perf=1" : "perf=1&posteffect=0";
  const { page, pageErrors } = await openPage(browser, {
    url: `${BASE}/posteffects.html?${query}`,
    viewport: VIEWPORT,
    deviceScaleFactor,
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
  await captureScreenshot(page, { outDir: OUT_DIR, name: "posteffects-" + label });
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
  return avgFps;
}

const { browser, meta } = await launchGpuBrowser({});
console.log(`起動: channel=${meta.channel} angle=${meta.angle} browser=${meta.browserVersion}`);

// 計測本体を try で囲み、途中で例外が出てもブラウザを確実に閉じる（finally で closeBrowser を呼ぶ）。
// try/finally にする理由を先に述べる。実GPUのブラウザは起動コストが大きく、計測中の例外で閉じ損ねると
// プロセスが残留し得るため、成否に依らず確実に解放する。
try {
  // 合否対象（後処理有効・画素密度1と2）。
  const dpr1On = await measure(browser, { label: "dpr1-on", deviceScaleFactor: 1, postEffect: true, gate: true });
  const dpr2On = await measure(browser, { label: "dpr2-on", deviceScaleFactor: 2, postEffect: true, gate: true });
  // 参考（後処理無効の基準。後処理の費用の切り分けに使う）。
  const dpr1Off = await measure(browser, { label: "dpr1-off", deviceScaleFactor: 1, postEffect: false, gate: false });
  const dpr2Off = await measure(browser, { label: "dpr2-off", deviceScaleFactor: 2, postEffect: false, gate: false });

  console.log(
    `参考: 後処理の平均フレーム差 画素密度1=${(dpr1Off - dpr1On).toFixed(1)} 画素密度2=${(dpr2Off - dpr2On).toFixed(1)}`
  );
} finally {
  await closeBrowser(browser);
}

if (failures.length > 0) {
  console.log("不合格:\n" + failures.join("\n"));
  process.exit(1);
}
console.log(
  "合格: 実GPU描画で、後処理を有効にした画素密度1と2の双方が、解像度1920x1080で" +
    "平均55フレーム毎秒以上かつ下位5パーセンタイル45フレーム毎秒以上を満たす"
);
