// 品質検査ハーネスの指標算出。純粋関数（パーセンタイル算出・標本要約・ソフトウェア描画判定）と、
// 渡されたページから描画系統名を読む関数を持つ。
// ブラウザ起動部品（Playwright）を読み込まない。readRendererInfo は引数のページを評価するだけで、
// これにより本ファイルを単体テストで直接読み込んでもブラウザ起動部品に到達しない。

// ソフトウェア描画を示す語。実機GPUでない描画系統名はこれらのいずれかを含む。
// 採用理由を先に述べる。クラウドや一部環境ではGPUが無く、ヘッドレスのブラウザは
// SwiftShader（Googleのソフトウェア描画）や llvmpipe（Mesaのソフトウェア描画）、
// WindowsのDirect3Dソフトウェア描画である Microsoft Basic Render Driver / WARP に落ちる。
// これらの語を含む描画系統名は実機性能を表さないため、合格させない。
const SOFTWARE_RENDERER_MARKERS = [
  "swiftshader",
  "llvmpipe",
  "software rasterizer",
  "microsoft basic render driver",
  "warp",
];

/**
 * 最近接順位法でパーセンタイルを求める。
 * 採用理由を先に述べる。標本数が小さいとき、補間法は実在しない中間値を作って外れ値に
 * 引きずられやすい。最近接順位法は実測標本値をそのまま返し、小標本で決定的かつ頑健である。
 * 順位 = 天井(パーセンタイル/100 × 標本数)。最小1・最大は標本数でクランプする。
 * 空標本は非数（NaN）を返し、合否は呼び側に委ねる。
 * @param {readonly number[]} samples 毎秒フレーム数の標本
 * @param {number} p パーセンタイル（0以上100以下）
 * @returns {number}
 */
export function percentileNearestRank(samples, p) {
  const n = samples.length;
  if (n === 0) {
    return Number.NaN;
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const rawRank = Math.ceil((p / 100) * n);
  const rank = Math.min(Math.max(rawRank, 1), n);
  return sorted[rank - 1];
}

/**
 * 毎秒フレーム数の標本を要約する。
 * 空標本はすべて0で返す。採用理由を先に述べる。レポートはJSONで残すため、JSONで表せない
 * 非数（NaN）を要約値に混ぜないようにする。
 * @param {readonly number[]} samples
 * @returns {{ count: number, avg: number, min: number, max: number, p5: number, p50: number }}
 */
export function summarizeFps(samples) {
  const count = samples.length;
  if (count === 0) {
    return { count: 0, avg: 0, min: 0, max: 0, p5: 0, p50: 0 };
  }
  const sum = samples.reduce((acc, value) => acc + value, 0);
  return {
    count,
    avg: sum / count,
    min: Math.min(...samples),
    max: Math.max(...samples),
    p5: percentileNearestRank(samples, 5),
    p50: percentileNearestRank(samples, 50),
  };
}

/**
 * 描画系統名がソフトウェア描画を示すか判定する。
 * 描画系統名が空文字列・null・undefined（取得できない）場合も真とする。
 * 採用理由を先に述べる。描画系統が確認できないものを合格させると、実機性能を表さない
 * 計測値を見逃すため、確認できないものは合格させない。
 * @param {string | null | undefined} rendererString
 * @returns {boolean}
 */
export function isSoftwareRenderer(rendererString) {
  if (!rendererString) {
    return true;
  }
  const lowered = rendererString.toLowerCase();
  return SOFTWARE_RENDERER_MARKERS.some((marker) => lowered.includes(marker));
}

/**
 * ローカル計測1件の合否を判定する（純粋）。
 * 合格条件は次の4つをすべて満たすこと。採用理由を先に述べる。
 * 1. 描画系統が信頼できること。基盤の役割は実機GPUで計測したことの保証であり、ソフトウェア描画や
 *    描画系統名が取得できない計測は実機性能を表さないためである。ただし描画系統名が取得できない場合に
 *    限り、手元調査ノブ allowUnknownRenderer で信頼不可を許容する（描画系統名が取得できて、かつ
 *    ソフトウェア描画のときは許容しない）。
 * 2. 平均の毎秒フレーム数を返す計測フック（window.__avgFps）が公開されていること。基盤は計測フック
 *    契約（window.__fps / __avgFps / __fpsSamples）に依存し、avgFps が負の値は __avgFps が公開されて
 *    いない（契約の一部が欠けている）ことを意味するためである。
 * 3. 毎秒フレーム数の標本が1件以上あること。基盤は500ミリ秒区間の標本を生成するのが役割であり、
 *    0件は計測フックが公開されていないか描画ループが回っていない、すなわち計測が起きていないことを
 *    意味するためである。
 * 4. ページで未捕捉の例外が発生していないこと。計測対象ページがエラー状態にあると計測値の信頼性を
 *    損なうためである。背景の404のような良性のコンソールエラーはこれに含めない。
 * @param {{ trusted: boolean, rendererInfoAvailable: boolean, avgFps: number, sampleCount: number, pageErrorCount: number, allowUnknownRenderer: boolean }} input
 * @returns {{ acceptable: boolean, reasons: string[] }}
 */
export function evaluateRunAcceptance(input) {
  const reasons = [];
  const excusedUnknown =
    input.allowUnknownRenderer === true && input.rendererInfoAvailable === false;
  if (!input.trusted && !excusedUnknown) {
    reasons.push(
      "描画系統が信頼できません（ソフトウェア描画、または描画系統名が取得できません）"
    );
  }
  if (input.avgFps < 0) {
    reasons.push(
      "平均の毎秒フレーム数を返す計測フック（window.__avgFps）が公開されていません"
    );
  }
  if (input.sampleCount === 0) {
    reasons.push(
      "毎秒フレーム数の標本が得られませんでした（計測フックが公開されていないか描画ループが回っていません）"
    );
  }
  if (input.pageErrorCount > 0) {
    reasons.push("ページで未捕捉の例外が発生しました");
  }
  return { acceptable: reasons.length === 0, reasons };
}

/**
 * 渡されたページからWebGLの非マスク描画系統名と製造元名を読む。
 * 取得できない場合は available を偽にする。Playwrightを読み込まず、引数のページを評価するだけにする。
 * @param {{ evaluate: (fn: () => unknown) => Promise<unknown> }} page
 * @returns {Promise<{ renderer: string, vendor: string, available: boolean }>}
 */
export async function readRendererInfo(page) {
  return /** @type {Promise<{ renderer: string, vendor: string, available: boolean }>} */ (
    page.evaluate(() => {
      const canvas = document.createElement("canvas");
      const gl =
        canvas.getContext("webgl2") || canvas.getContext("webgl");
      if (!gl) {
        return { renderer: "", vendor: "", available: false };
      }
      const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
      if (!debugInfo) {
        return { renderer: "", vendor: "", available: false };
      }
      const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
      const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
      if (typeof renderer !== "string" || renderer.length === 0) {
        return { renderer: "", vendor: typeof vendor === "string" ? vendor : "", available: false };
      }
      return {
        renderer,
        vendor: typeof vendor === "string" ? vendor : "",
        available: true,
      };
    })
  );
}
