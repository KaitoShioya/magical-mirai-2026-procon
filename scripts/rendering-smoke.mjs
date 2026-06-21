// 描画基盤の実ブラウザ補助確認（Issue #8）: Playwright で診断グローバル window.__renderState を読み、
// クリアカラー・画素密度上限・描画バッファ寸法・カメラ縦横比を確かめ、ビューポート変更で縦横比が
// 追従することを検証する。WebGL の描画文脈の生成可否も確認する。
// 受け入れ基準の決定的検証（純粋関数）は単体テスト（src/rendering/viewport.test.ts）が担い、本スクリプトは
// 本体へ組み込んだ描画基盤が実ブラウザで成立することを確かめる。
// 接続先サーバは環境変数 BASE で指定する（既定 http://127.0.0.1:4173）。診断モードのため /?smoke=1 を開く。
//   PowerShell:  $env:BASE='http://127.0.0.1:4173'; node scripts/rendering-smoke.mjs
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:4173";
const EXPECTED_CLEAR_COLOR_HEX = "05060a"; // 深夜色 NIGHT_COLOR(0x05060a)。
const MAX_PIXEL_RATIO = 2;
// 縦横比は浮動小数の比のため、わずかな丸めを許す閾値を設ける。表示寸法は整数画素で比は有理数だが、
// スクロールバー等で内寸が1画素ずれても比の差は0.01未満に収まるため、この値を一致判定の閾値とする。
const ASPECT_TOLERANCE = 0.01;
// 2次元層（Issue #15）の視錐台の一致判定の閾値。視錐台は浮動小数で計算されるため厳密一致でなく、差の絶対値が
// この値以下を一致とみなす。視錐台の左右は診断状態のカメラ縦横比と同一の計算（computeAspect）から導くため、
// 端末ごとの誤差ではなく演算誤差だけを吸収すればよい。1e-6 は単精度・倍精度の演算誤差を吸収しつつ規約からの
// 逸脱を検出できる十分小さな値として採る。
const FRUSTUM_TOLERANCE = 1e-6;
// ブルーム後処理（Issue #11）の期待値。src/rendering/constants.ts の定数と一致させる。
// ブルーム入力解像度の倍率0.5は、表示寸法（CSS画素）×倍率を切り捨て下限1にした値が診断状態へ出る。
// 算出式の正本は src/rendering/viewport.ts の computeBloomResolution であり、ここはそれを写した照合を行う
// （本スクリプトは既に描画バッファ寸法を表示寸法×画素密度倍率の切り捨てで照合しており、同じ方式に合わせる）。
const BLOOM_RESOLUTION_SCALE = 0.5;
const EXPECTED_BLOOM_STRENGTH = 1.2;
const EXPECTED_BLOOM_RADIUS = 0.6;
const EXPECTED_BLOOM_THRESHOLD = 0.5;

const errors = [];
let failed = false;
function fail(message) {
  failed = true;
  console.error("失敗: " + message);
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
page.on("pageerror", (error) => errors.push("ページ例外: " + error.message));
page.on("console", (message) => {
  if (message.type() === "error") {
    errors.push("コンソールエラー: " + message.text());
  }
});

async function readRenderState() {
  return page.evaluate(() =>
    typeof window.__renderState === "function" ? window.__renderState() : null
  );
}
async function readViewport() {
  return page.evaluate(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
    dpr: window.devicePixelRatio,
  }));
}

try {
  let connected = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await page.goto(BASE + "/?smoke=1", { waitUntil: "load", timeout: 2000 });
      connected = true;
      break;
    } catch {
      await page.waitForTimeout(500);
    }
  }
  if (!connected) {
    throw new Error("プレビューサーバへ接続できませんでした: " + BASE);
  }

  await page.waitForFunction(() => typeof window.__renderState === "function", undefined, {
    timeout: 15000,
  });

  const state = await readRenderState();
  const vp = await readViewport();
  if (!state) {
    fail("window.__renderState が取得できませんでした");
  } else {
    if (!state.webglAvailable) {
      fail("WebGL の描画文脈を生成できませんでした（webglAvailable が偽）");
    } else {
      console.log("確認: WebGL の描画文脈を生成できた");
    }

    if (state.clearColorHex !== EXPECTED_CLEAR_COLOR_HEX) {
      fail(`クリアカラーが ${state.clearColorHex} です（期待: ${EXPECTED_CLEAR_COLOR_HEX}）`);
    } else {
      console.log("確認: クリアカラーが深夜色 05060a");
    }

    const expectedPixelRatio = Math.min(vp.dpr, MAX_PIXEL_RATIO);
    if (state.pixelRatio !== expectedPixelRatio) {
      fail(`画素密度倍率が ${state.pixelRatio} です（期待: ${expectedPixelRatio}）`);
    } else {
      console.log("確認: 画素密度倍率が上限内");
    }

    const expectedW = Math.floor(vp.w * expectedPixelRatio);
    const expectedH = Math.floor(vp.h * expectedPixelRatio);
    if (state.drawingBufferWidth !== expectedW || state.drawingBufferHeight !== expectedH) {
      fail(
        `描画バッファ寸法が ${state.drawingBufferWidth}x${state.drawingBufferHeight} です` +
          `（期待: ${expectedW}x${expectedH}）`
      );
    } else {
      console.log("確認: 描画バッファ寸法が表示寸法×画素密度倍率");
    }

    const expectedAspect = vp.w / vp.h;
    if (Math.abs(state.cameraAspect - expectedAspect) > ASPECT_TOLERANCE) {
      fail(`カメラ縦横比が ${state.cameraAspect} です（期待: ${expectedAspect}）`);
    } else {
      console.log("確認: カメラ縦横比が表示寸法に一致");
    }

    // ブルーム後処理（Issue #11）。既定で有効・3パラメータが既定値・最終出力パスが有効・入力解像度が
    // 表示寸法の半分であることを確認する。
    // 入力解像度の期待値計算に使う vp.w・vp.h は readViewport が返す window.innerWidth・window.innerHeight
    // （CSS画素）であり、本体がブルーム入力解像度の基準に用いる表示寸法と同じ単位のため、単位の食い違いなく
    // 照合が成立する。
    if (!state.bloom) {
      fail("診断状態に bloom がありません");
    } else {
      if (state.bloom.enabled !== true) {
        fail(`既定でブルームが有効ではありません（enabled=${state.bloom.enabled}）`);
      } else {
        console.log("確認: 既定でブルームが有効");
      }

      if (
        state.bloom.strength !== EXPECTED_BLOOM_STRENGTH ||
        state.bloom.radius !== EXPECTED_BLOOM_RADIUS ||
        state.bloom.threshold !== EXPECTED_BLOOM_THRESHOLD
      ) {
        fail(
          `ブルームのパラメータが strength=${state.bloom.strength} radius=${state.bloom.radius} ` +
            `threshold=${state.bloom.threshold} です（期待: ${EXPECTED_BLOOM_STRENGTH}/` +
            `${EXPECTED_BLOOM_RADIUS}/${EXPECTED_BLOOM_THRESHOLD}）`
        );
      } else {
        console.log("確認: ブルームのパラメータが既定値");
      }

      if (state.bloom.outputPassEnabled !== true) {
        fail("最終出力パス（OutputPass）が有効ではありません");
      } else {
        console.log("確認: 最終出力パスが有効");
      }

      const expectedBloomW = Math.max(1, Math.floor(vp.w * BLOOM_RESOLUTION_SCALE));
      const expectedBloomH = Math.max(1, Math.floor(vp.h * BLOOM_RESOLUTION_SCALE));
      if (
        state.bloom.bloomInputWidth !== expectedBloomW ||
        state.bloom.bloomInputHeight !== expectedBloomH
      ) {
        fail(
          `ブルーム入力解像度が ${state.bloom.bloomInputWidth}x${state.bloom.bloomInputHeight} です` +
            `（期待: ${expectedBloomW}x${expectedBloomH}）`
        );
      } else {
        console.log("確認: ブルーム入力解像度が表示寸法の半分");
      }
    }

    // 拍同期ポストエフェクト（Issue #17）と色管理の明示設定。
    // 後処理パスは本編で既定無効のため postEffectEnabled は偽だが、診断フィールドが真偽値で存在し配線されて
    // いることを確かめる。色管理は後処理を線形空間で作用させる前提（最終段の色管理は OutputPass）を保つため、
    // 出力sRGB・トーンマッピング無しを明示設定したことを確かめる。期待値の根拠を先に述べる。three.js では
    // SRGBColorSpace は文字列 "srgb"、NoToneMapping は数値0であり、現在の既定と同値（見えは不変）をそのまま
    // 明示設定したことの確認である。
    if (!state.bloom || typeof state.bloom.postEffectEnabled !== "boolean") {
      fail(`診断状態の bloom.postEffectEnabled が真偽値ではありません（${state.bloom && state.bloom.postEffectEnabled}）`);
    } else if (state.bloom.postEffectEnabled !== false) {
      fail(`本編で後処理が既定有効になっています（postEffectEnabled=${state.bloom.postEffectEnabled}、期待: false）`);
    } else {
      console.log("確認: 拍同期ポストエフェクトは本編で既定無効（配線あり）");
    }
    if (state.outputColorSpace !== "srgb") {
      fail(`出力色空間が ${state.outputColorSpace} です（期待: srgb）`);
    } else {
      console.log("確認: 出力色空間が sRGB");
    }
    if (state.toneMapping !== 0) {
      fail(`トーンマッピングが ${state.toneMapping} です（期待: 0 = トーンマッピング無し）`);
    } else {
      console.log("確認: トーンマッピング無し（最終段の色管理は OutputPass に集約）");
    }

    // 2次元層（Issue #15）。本番の描画基盤が2次元層を組み込み、正射影カメラの視錐台が座標規約どおりで
    // あることを確認する。視錐台の上下は +1 と -1、左右は符号反転で絶対値がカメラ縦横比に一致する。
    if (!state.overlay) {
      fail("診断状態に overlay がありません（2次元層が組み込まれていません）");
    } else {
      if (
        Math.abs(state.overlay.frustumTop - 1) > FRUSTUM_TOLERANCE ||
        Math.abs(state.overlay.frustumBottom - -1) > FRUSTUM_TOLERANCE
      ) {
        fail(
          `2次元層の視錐台の上下が ${state.overlay.frustumTop}/${state.overlay.frustumBottom} です` +
            "（期待: 1/-1）"
        );
      } else {
        console.log("確認: 2次元層の視錐台の上下が +1 と -1");
      }
      if (
        Math.abs(state.overlay.frustumRight - state.cameraAspect) > FRUSTUM_TOLERANCE ||
        Math.abs(state.overlay.frustumLeft - -state.cameraAspect) > FRUSTUM_TOLERANCE
      ) {
        fail(
          `2次元層の視錐台の左右が ${state.overlay.frustumLeft}/${state.overlay.frustumRight} です` +
            `（期待: ${-state.cameraAspect}/${state.cameraAspect}）`
        );
      } else {
        console.log("確認: 2次元層の視錐台の左右が±縦横比");
      }
    }
  }

  // 単一WebGL描画領域の不変条件（docs/decisions/architecture.md §1）。canvas は1つだけで #stage の中にある。
  // 背面canvasが画面UIの操作を妨げないことは、同じ統合済みアプリで開始ボタンを押下する既存の画面遷移
  // スモーク（scripts/screens-smoke.mjs）が担うため、ここでは重複して押下確認しない。
  const canvasInfo = await page.evaluate(() => {
    const all = document.querySelectorAll("canvas");
    const stage = document.getElementById("stage");
    return {
      count: all.length,
      insideStage: all.length === 1 && stage !== null && stage.contains(all[0]),
    };
  });
  if (canvasInfo.count !== 1) {
    fail(`canvas が ${canvasInfo.count} 個あります（期待: 1個）`);
  } else if (!canvasInfo.insideStage) {
    fail("唯一の canvas が #stage の中にありません");
  } else {
    console.log("確認: WebGL描画領域は #stage 内の1個だけ");
  }

  // ビューポートを別の縦横比へ変更し、縦横比と描画バッファが追従することを確認する。
  await page.setViewportSize({ width: 800, height: 400 });
  try {
    await page.waitForFunction(
      (tol) => {
        const s = typeof window.__renderState === "function" ? window.__renderState() : null;
        return s !== null && Math.abs(s.cameraAspect - window.innerWidth / window.innerHeight) <= tol;
      },
      ASPECT_TOLERANCE,
      { timeout: 5000 }
    );
  } catch {
    fail("リサイズ後にカメラ縦横比が表示寸法へ追従しませんでした");
  }

  const afterResize = await readRenderState();
  const vp2 = await readViewport();
  if (afterResize) {
    const expectedAspect2 = vp2.w / vp2.h;
    if (Math.abs(afterResize.cameraAspect - expectedAspect2) > ASPECT_TOLERANCE) {
      fail(`リサイズ後のカメラ縦横比が ${afterResize.cameraAspect} です（期待: ${expectedAspect2}）`);
    } else {
      console.log("確認: リサイズで縦横比が追従");
    }
    const ratio2 = Math.min(vp2.dpr, MAX_PIXEL_RATIO);
    const expectedW2 = Math.floor(vp2.w * ratio2);
    const expectedH2 = Math.floor(vp2.h * ratio2);
    if (
      afterResize.drawingBufferWidth !== expectedW2 ||
      afterResize.drawingBufferHeight !== expectedH2
    ) {
      fail(
        `リサイズ後の描画バッファ寸法が ${afterResize.drawingBufferWidth}x${afterResize.drawingBufferHeight} です` +
          `（期待: ${expectedW2}x${expectedH2}）`
      );
    } else {
      console.log("確認: リサイズで描画バッファ寸法が追従");
    }
  }

  // 反射の配線確認（Issue #9）。起動時パラメータ refl により反射の有効・解像度が診断状態へ反映される
  // ことを確かめる。これは配線の検証であり、発光点が実際に反射像へ描かれることの視覚確認は性能ゲート
  // （scripts/reflection-fps.mjs）の保存画像で行う。WebGL の描画文脈の生成はソフトウェア描画でも成立する
  // ため、反射を作ったか・解像度はいくつかの真偽は GPU の無い自動実行環境でも正しく確認できる。
  async function checkReflection(query, expectedEnabled, expectedResolution) {
    await page.goto(BASE + query, { waitUntil: "load" });
    await page.waitForFunction(() => typeof window.__renderState === "function", undefined, {
      timeout: 15000,
    });
    const reflectionState = await readRenderState();
    if (!reflectionState) {
      fail(`反射確認(${query}): window.__renderState を取得できませんでした`);
      return;
    }
    if (reflectionState.reflectionEnabled !== expectedEnabled) {
      fail(
        `反射確認(${query}): reflectionEnabled が ${reflectionState.reflectionEnabled} です` +
          `（期待: ${expectedEnabled}）`
      );
    } else if (reflectionState.reflectionResolution !== expectedResolution) {
      fail(
        `反射確認(${query}): reflectionResolution が ${reflectionState.reflectionResolution} です` +
          `（期待: ${expectedResolution}）`
      );
    } else {
      console.log(`確認: 反射(${query}) 有効=${expectedEnabled} 解像度=${expectedResolution}`);
    }
  }
  await checkReflection("/?smoke=1", true, 512);
  await checkReflection("/?smoke=1&refl=256", true, 256);
  await checkReflection("/?smoke=1&refl=0", false, 0);
  await checkReflection("/?smoke=1&refl=9999", true, 512);

  // ?bloom=0 でブルームが無効になることを確認する（達成基準3の配線確認）。
  // 診断状態を読むため smoke=1 も付ける。これは入口（src/main.ts）から統括・描画基盤・合成までの
  // 受け渡し経路が実際に働くことの確認でもある。
  await page.goto(BASE + "/?smoke=1&bloom=0", { waitUntil: "load" });
  await page.waitForFunction(() => typeof window.__renderState === "function", undefined, {
    timeout: 15000,
  });
  const disabledState = await readRenderState();
  if (!disabledState || !disabledState.bloom) {
    fail("?bloom=0 で診断状態の bloom を取得できませんでした");
  } else if (disabledState.bloom.enabled !== false) {
    fail(`?bloom=0 でブルームが無効になりません（enabled=${disabledState.bloom.enabled}）`);
  } else {
    console.log("確認: ?bloom=0 でブルームが無効");
  }

  // 通常構成（?smoke=1 なし）では診断アクセサが公開されていない。
  await page.goto(BASE + "/", { waitUntil: "load" });
  const absent = await page.evaluate(() => typeof window.__renderState === "undefined");
  if (!absent) {
    fail("通常構成（?smoke=1 なし）で window.__renderState が公開されています");
  } else {
    console.log("確認: 通常構成では診断アクセサが未公開");
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
  console.error("描画基盤の補助確認: 失敗");
  process.exit(1);
} else {
  console.log("描画基盤の補助確認: 成功");
}
