// 拍同期ポストエフェクト（Issue #17）の受け入れ基準「視線が中央へ誘導される」「色ずれが意図的効果として
// 認識される」の実機検証。Playwright で診断ページ（posteffects.html）を開き、決定的なステップ実行で基準・
// ピーク・減衰の3時刻の画素を読み戻して判定する。
//
// 標本を2系統に分けて読む理由を先に述べる。白黒境界の黒側画素を明領域の明度判定に混ぜると必ず暗く誤って
// 失敗し、明領域画素を色ずれ判定に使うと色境界が無く差が出ないため、検証目的ごとに標本領域を分離する。
//
// 横長の表示寸法（1920x1080）で計測する理由を先に述べる。周縁減光と色収差の強さは中心からの正規化距離に比例
// するため、境界を画面右端寄り（高い正規化距離）に置ける横長の表示寸法にして効果を画素差として確実に検出し、
// 横の画素数を多くして色収差のずれ量（画素数に比例）に余裕を持たせ、ピークと減衰後を確実に区別する。
//
// 接続先サーバは環境変数 BASE で指定する（既定 http://127.0.0.1:4173）。
//   PowerShell:  $env:BASE='http://127.0.0.1:4173'; node scripts/rendering-posteffects-smoke.mjs
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:4173";

// 色収差の減衰時定数（src/config/tuning.ts の POST_CHROMA_DECAY_TAU_MS と一致させる）。診断の強拍時刻と
// 合わせて、ピーク（強拍ちょうど）と減衰後（3τ後）の時刻を決める。
const DECAY_TAU_MS = 120;
// 最初の合成強拍の時刻（src/rendering/diagnostics/postEffects/main.ts の STRONG_BEAT_TIMES_MS の先頭と一致）。
const FIRST_STRONG_BEAT_MS = 500;
const PEAK_TIME_MS = FIRST_STRONG_BEAT_MS; // 強拍ちょうど。包絡の強度は1.0。
const DECAY_TIME_MS = FIRST_STRONG_BEAT_MS + 3 * DECAY_TAU_MS; // 3τ後。包絡の強度は約0.05。

// 黒潰れの下限（256段階）。8にする理由を先に述べる。8段階は8ビットの丸め誤差（およそ±0.5段階）より十分大きく、
// 周縁が情報を失わず視認できることを保証する下限である。
const PERIPHERY_MIN_LUMINANCE = 8;
// 色収差が認識される最小の色ずれ（256段階）。16にする理由を先に述べる。16段階は高コントラスト境界で明確に知覚
// できるチャンネル分離量である。
const CHROMA_PEAK_OVER_BASELINE = 16;
// 減衰後に基準へ戻ったとみなす色ずれの上限（256段階、基準との差）。4にする理由を先に述べる。4段階は丸め誤差と
// 副画素の残差の範囲で「基準へ戻った」と判断できる量である。
const CHROMA_DECAY_OVER_BASELINE = 4;
// 包絡のピーク・減衰後の強度の判定値。ピークは強拍ちょうどで1.0に近く、3τ後は約0.05である。
const ENVELOPE_PEAK_MIN = 0.99;
const ENVELOPE_DECAY_MAX = 0.05;

const errors = [];
let failed = false;
function fail(message) {
  failed = true;
  console.error("失敗: " + message);
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();
page.on("pageerror", (error) => errors.push("ページ例外: " + error.message));
page.on("console", (message) => {
  if (message.type() === "error") {
    errors.push("コンソールエラー: " + message.text());
  }
});

// 指定時刻までステップ実行し、その時点の状態を返す。
async function stepAndRead(gameTimeMs) {
  await page.evaluate((t) => {
    if (typeof window.__postEffectsStep === "function") {
      window.__postEffectsStep(t);
    }
  }, gameTimeMs);
  return page.evaluate(() =>
    typeof window.__postEffectsState === "function" ? window.__postEffectsState() : null
  );
}

try {
  let connected = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await page.goto(BASE + "/posteffects.html", { waitUntil: "load", timeout: 2000 });
      connected = true;
      break;
    } catch {
      await page.waitForTimeout(500);
    }
  }
  if (!connected) {
    throw new Error("プレビューサーバへ接続できませんでした: " + BASE);
  }

  await page.waitForFunction(
    () =>
      typeof window.__postEffectsStep === "function" &&
      typeof window.__postEffectsState === "function" &&
      typeof window.__postEffectsReset === "function",
    undefined,
    { timeout: 15000 }
  );

  // 再実行可能な初期状態へ戻す（基準時刻を0へ置き直す）。
  await page.evaluate(() => {
    if (typeof window.__postEffectsReset === "function") {
      window.__postEffectsReset();
    }
  });

  // 基準（強拍前、時刻0、色収差なし）→ ピーク（強拍ちょうど）→ 減衰後（3τ後）の順で読む。
  const baseline = await stepAndRead(0);
  const peak = await stepAndRead(PEAK_TIME_MS);
  const decay = await stepAndRead(DECAY_TIME_MS);

  if (!baseline || !peak || !decay) {
    fail("window.__postEffectsState を取得できませんでした");
  } else if (!baseline.webglAvailable) {
    fail("WebGL を利用できませんでした（webglAvailable が偽）");
  } else {
    // 1. 周縁減光（明領域系統）: 周縁が中心より暗い。
    if (baseline.peripheryLuminance < baseline.centerLuminance) {
      console.log(
        `確認: 周縁が中心より暗い（中心=${baseline.centerLuminance.toFixed(0)} > ` +
          `周縁=${baseline.peripheryLuminance.toFixed(0)}、視線が中央へ誘導される）`
      );
    } else {
      fail(
        `周縁が中心より暗くありません（中心=${baseline.centerLuminance.toFixed(0)} ` +
          `周縁=${baseline.peripheryLuminance.toFixed(0)}）`
      );
    }

    // 2. 黒潰れの回避（明領域系統）: 周縁の最低明度が下限以上。
    if (baseline.peripheryMinLuminance >= PERIPHERY_MIN_LUMINANCE) {
      console.log(
        `確認: 周縁の最低明度 ${baseline.peripheryMinLuminance.toFixed(0)} が下限 ${PERIPHERY_MIN_LUMINANCE} 以上（黒潰れなし）`
      );
    } else {
      fail(
        `周縁の最低明度 ${baseline.peripheryMinLuminance.toFixed(0)} が下限 ${PERIPHERY_MIN_LUMINANCE} 未満（黒潰れ）`
      );
    }

    // 3. 色収差バースト（境界系統）: ピークで基準より十分大きく、減衰後は基準へ戻る。
    const peakOverBaseline = peak.boundaryMaxAbsRB - baseline.boundaryMaxAbsRB;
    const decayOverBaseline = decay.boundaryMaxAbsRB - baseline.boundaryMaxAbsRB;
    if (peakOverBaseline >= CHROMA_PEAK_OVER_BASELINE) {
      console.log(
        `確認: ピークの色ずれが基準より ${peakOverBaseline.toFixed(0)} 大きい` +
          `（基準=${baseline.boundaryMaxAbsRB.toFixed(0)} ピーク=${peak.boundaryMaxAbsRB.toFixed(0)}、色ずれが認識される）`
      );
    } else {
      fail(
        `ピークの色ずれが基準より ${peakOverBaseline.toFixed(0)} しか大きくありません` +
          `（必要: ${CHROMA_PEAK_OVER_BASELINE} 以上、基準=${baseline.boundaryMaxAbsRB.toFixed(0)} ピーク=${peak.boundaryMaxAbsRB.toFixed(0)}）`
      );
    }
    if (decayOverBaseline <= CHROMA_DECAY_OVER_BASELINE) {
      console.log(
        `確認: 減衰後の色ずれが基準へ戻る（基準との差 ${decayOverBaseline.toFixed(0)} が ${CHROMA_DECAY_OVER_BASELINE} 以下、強拍時のみ現れ消える）`
      );
    } else {
      fail(
        `減衰後の色ずれが基準へ戻りません（基準との差 ${decayOverBaseline.toFixed(0)} が ${CHROMA_DECAY_OVER_BASELINE} を超える）`
      );
    }

    // 4. 包絡: ピークの強度がほぼ1、減衰後がほぼ0。
    if (peak.chromaIntensity >= ENVELOPE_PEAK_MIN) {
      console.log(`確認: 包絡のピーク強度 ${peak.chromaIntensity.toFixed(3)} が ${ENVELOPE_PEAK_MIN} 以上`);
    } else {
      fail(`包絡のピーク強度 ${peak.chromaIntensity.toFixed(3)} が ${ENVELOPE_PEAK_MIN} 未満`);
    }
    if (decay.chromaIntensity <= ENVELOPE_DECAY_MAX) {
      console.log(`確認: 包絡の減衰後強度 ${decay.chromaIntensity.toFixed(3)} が ${ENVELOPE_DECAY_MAX} 以下`);
    } else {
      fail(`包絡の減衰後強度 ${decay.chromaIntensity.toFixed(3)} が ${ENVELOPE_DECAY_MAX} を超える`);
    }
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
} finally {
  await browser.close();
}

if (errors.length > 0) {
  fail("ページ・コンソールのエラーを検出しました:\n" + errors.join("\n"));
}

if (failed) {
  console.error("拍同期ポストエフェクトの受け入れ検証: 失敗");
  process.exit(1);
} else {
  console.log("拍同期ポストエフェクトの受け入れ検証: 成功");
}
