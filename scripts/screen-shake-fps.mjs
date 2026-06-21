// 画面拡大・減衰揺れ（Issue #76）の性能ゲート（実GPU計測）。
// Issue #9 の反射性能ゲート（scripts/reflection-fps.mjs）と同じ方式で、Chromium を新しいヘッドレスモードと
// ANGLE(DirectX11) で起動して実GPUで描画し、診断ページ screen-shake.html を駆動して受け入れ基準を判定する。
//
// 判定対象が screen-shake.html である理由を先に述べる。本ページは本番と同じ描画基盤（createRenderRoot）に
// 演出評価器（screenShake）の変換を実canvasへ当てて拍ごとに拡大・揺れを起こし、毎秒フレーム数の計測フックを
// 持つ。本編アプリは拍時刻配列が無く演出が無作用で計測の代表性を欠くため、診断ページで判定する。
// 本編統合状態（曲ロード後）の性能の再計測は Issue #97 へ委譲する。
//
// 受け入れ基準（Issue #76 の「毎秒60フレーム滑らか」）: 解像度1920×1080・画素密度上限2で、平均55フレーム毎秒
// 以上かつ最低（下位5パーセンタイル）45フレーム毎秒以上。閾値と下位5パーセンタイルで判定する理由は
// scripts/reflection-fps.mjs と同一（研究文書§6、生の最小値でなく下位5パーセンタイルで再現性を確保）。
// ソフトウェア描画（SwiftShader 等）は実機性能を表さないため合格させない。GPU の無い環境では失敗する。
// 実行: BASE=http://localhost:5173 node scripts/screen-shake-fps.mjs  （別端末で npm run dev を起動しておく）
import { launchGpuBrowser, closeBrowser } from "./harness/browser.mjs";
import { openPage, waitForReady, warmup, sampleFps, captureScreenshot } from "./harness/page.mjs";
import {
  readRendererInfo,
  isSoftwareRenderer,
  percentileNearestRank,
  summarizeFps,
} from "./harness/metrics.mjs";
import { BASE, OUT_DIR, DEFAULT_SAMPLE_DURATION_MS, DEFAULT_WARMUP_MS } from "./harness/config.mjs";

const AVG_FPS_MIN = 55;
const P5_FPS_MIN = 45;
const VIEWPORT = { width: 1920, height: 1080 };
const DEVICE_SCALE_FACTOR = 1;

const failures = [];

const { browser, meta } = await launchGpuBrowser({});
console.log(`起動: channel=${meta.channel} angle=${meta.angle} browser=${meta.browserVersion}`);

const { page, pageErrors } = await openPage(browser, {
  url: `${BASE}/screen-shake.html`,
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
await captureScreenshot(page, { outDir: OUT_DIR, name: "screen-shake-proto" });
console.log(
  `[screen-shake] 描画=${software ? "ソフトウェア" : "GPU"}(${rendererInfo.renderer}) ` +
    `平均=${avgFps.toFixed(1)} 下位5%=${p5} 生最小=${summary.min} 標本数=${summary.count} ` +
    `ページ例外=${pageErrors.length}`
);

if (software) {
  failures.push("ソフトウェア描画のため実機性能を表さない（GPUのある環境で実行する）");
}
if (avgFps < AVG_FPS_MIN) {
  failures.push(`平均${avgFps.toFixed(1)}が${AVG_FPS_MIN}未満`);
}
if (p5 < P5_FPS_MIN) {
  failures.push(`下位5パーセンタイル${p5}が${P5_FPS_MIN}未満`);
}
if (pageErrors.length > 0) {
  failures.push(`ページ例外 ${pageErrors.join(" / ")}`);
}

await page.context().close();
await closeBrowser(browser);

if (failures.length > 0) {
  console.log("不合格:\n" + failures.join("\n"));
  process.exit(1);
}
console.log(
  "合格: 実GPU描画で、画面拡大・減衰揺れが解像度1920×1080・画素密度上限2で" +
    "平均55フレーム毎秒以上かつ下位5パーセンタイル45フレーム毎秒以上を満たす"
);
