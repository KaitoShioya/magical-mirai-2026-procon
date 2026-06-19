// 品質検査ハーネスのローカル実行。新しいヘッドレスモードのGPUブラウザで prototype.html を描画し、
// 各端末プロファイルで毎秒フレーム数を採取・撮影・指標抽出し、レポートを書き出す。
// 描画系統がソフトウェア描画、または描画系統名が取得できない場合は失敗とする（実機性能を保証するため）。
// ブラウザ起動部品（Playwright）を読み込むため、コマンド入口から動的に読み込まれる（クラウド経路は読まない）。
import os from "node:os";
import { launchGpuBrowser, closeBrowser } from "./browser.mjs";
import {
  captureScreenshot,
  openPage,
  sampleFps,
  waitForReady,
  warmup,
} from "./page.mjs";
import {
  evaluateRunAcceptance,
  isSoftwareRenderer,
  readRendererInfo,
  summarizeFps,
} from "./metrics.mjs";
import { buildReport, writeReport } from "./report.mjs";
import {
  BASE,
  DEFAULT_SAMPLE_DURATION_MS,
  DEFAULT_WARMUP_MS,
  OUT_DIR,
  PROFILES,
  PROTOTYPE_PATH,
} from "./config.mjs";

/**
 * ローカル実行。
 * @param {{ base?: string, outDir?: string, profiles?: object[], channel?: string, angle?: string, durationMs?: number, allowUnknownRenderer?: boolean }} options
 * @returns {Promise<number>} 終了コード（0が成功）
 */
export async function runLocal(options = {}) {
  const base = options.base || BASE;
  const outDir = options.outDir || OUT_DIR;
  const profiles = options.profiles || PROFILES;
  const durationMs = options.durationMs || DEFAULT_SAMPLE_DURATION_MS;
  const allowUnknownRenderer = options.allowUnknownRenderer === true;

  const topLevelErrors = [];
  const runs = [];
  let failed = false;

  const { browser, meta } = await launchGpuBrowser({
    channel: options.channel,
    angle: options.angle,
  });

  const runtimeInfo = {
    os: os.platform() + " " + os.release(),
    node: process.version,
    playwright: meta.playwrightVersion,
    chromium: meta.browserVersion,
  };

  try {
    for (const profile of profiles) {
      const url = base + PROTOTYPE_PATH + "?" + profile.query;
      const run = {
        profile: profile.name,
        url,
        viewport: profile.viewport,
        deviceScaleFactor: profile.deviceScaleFactor ?? 1,
        isMobile: profile.isMobile ?? false,
        cpuThrottle: profile.cpuThrottle ?? 1,
        renderer: "",
        vendor: "",
        rendererInfoAvailable: false,
        softwareRendering: true,
        trusted: false,
        fps: summarizeFps([]),
        lastFps: -1,
        samples: [],
        artifacts: [],
        errors: [],
      };

      let context;
      let pageErrors = [];
      // 平均の毎秒フレーム数を返す計測フック（window.__avgFps）の読み取り値。
      // 既定を0にする理由を先に述べる。計測へ到達する前に例外で抜けた場合（接続失敗など）は
      // 平均フックの欠落ではないため、0（欠落を検出していない）にしておき、誤った理由を足さない。
      // 計測が走れば実際の読み取り値（フックが無ければ-1）で上書きする。
      let measuredAvgFps = 0;
      try {
        const opened = await openPage(browser, {
          url,
          viewport: profile.viewport,
          deviceScaleFactor: profile.deviceScaleFactor,
          isMobile: profile.isMobile,
          cpuThrottle: profile.cpuThrottle,
        });
        context = opened.context;
        run.errors = opened.errors;
        pageErrors = opened.pageErrors;
        const page = opened.page;

        await waitForReady(page, {});

        const rendererInfo = await readRendererInfo(page);
        run.renderer = rendererInfo.renderer;
        run.vendor = rendererInfo.vendor;
        run.rendererInfoAvailable = rendererInfo.available;
        run.softwareRendering = isSoftwareRenderer(rendererInfo.renderer);
        run.trusted = run.rendererInfoAvailable && !run.softwareRendering;

        await warmup(page, { ms: DEFAULT_WARMUP_MS });
        const measured = await sampleFps(page, { durationMs });
        run.samples = measured.samples;
        run.lastFps = measured.lastFps;
        measuredAvgFps = measured.avgFps;
        run.fps = summarizeFps(measured.samples);

        const shot = await captureScreenshot(page, { outDir, name: profile.name });
        run.artifacts.push({ type: "screenshot", path: shot.path });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        run.errors.push(message);
        failed = true;
      } finally {
        if (context) {
          await context.close();
        }
      }

      // 合否判定は純粋関数 evaluateRunAcceptance に委ねる。合格条件は、描画系統が信頼できること
      // （描画系統名が取得できない場合に限り手元調査ノブで許容）、平均フックが公開されていること、
      // 毎秒フレーム数の標本が1件以上あること、ページの未捕捉例外が無いこと、の4つである。背景の404の
      // ような良性のコンソールエラーは合否に含めず、レポートの errors に記録するだけにする。不合格の
      // 理由は errors に書き残して見落としを防ぐ（レポートに合否欄は設けない方針のため、専用の欄では
      // なく errors に残す）。
      const acceptance = evaluateRunAcceptance({
        trusted: run.trusted,
        rendererInfoAvailable: run.rendererInfoAvailable,
        avgFps: measuredAvgFps,
        sampleCount: run.samples.length,
        pageErrorCount: pageErrors.length,
        allowUnknownRenderer,
      });
      if (!acceptance.acceptable) {
        failed = true;
        for (const reason of acceptance.reasons) {
          if (!run.errors.includes(reason)) {
            run.errors.push(reason);
          }
        }
      }
      runs.push(run);
    }
  } finally {
    await closeBrowser(browser);
  }

  const report = buildReport({
    mode: "local",
    browserMeta: { channel: meta.channel, angle: meta.angle, args: meta.args },
    runtimeInfo,
    runs,
    errors: topLevelErrors,
  });
  const { path } = await writeReport(report, { outDir });

  // 標準出力で結果の要約を示す。
  for (const run of runs) {
    const verdict = run.trusted ? "信頼可" : "信頼不可";
    console.log(
      `[${run.profile}] 平均fps=${run.fps.avg.toFixed(1)} 下位5%=${run.fps.p5} ` +
        `描画系統=${run.renderer || "(取得不可)"} ${verdict}`
    );
  }
  console.log("レポート: " + path);
  console.log(failed ? "品質ハーネス（ローカル）: 失敗" : "品質ハーネス（ローカル）: 成功");

  return failed ? 1 : 0;
}
