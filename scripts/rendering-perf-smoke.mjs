// 性能バジェット自動劣化制御（Issue #18）の受け入れ検証。描画器が劣化段階を実際に適用することを、実FPSに
// 依存せず決定的に確かめる。Playwright で受け入れ診断ページ（perf-budget.html）を開き、診断グローバル
// window.__perfApplied を読み、段階0から4の各段階で次を確かめる。
//   段階1: 中心オブジェクト（常在ミク）が反射から外れる（reflectCenterFigure が偽になり、実効変化が立つ）。
//   段階2: 画素密度倍率が下がる（端末画素密度倍率を2に設定して計測するため、上限1.0で半分になる）。
//   段階3: ブルーム解像度倍率が0.25へ下がる。
//   段階4: ブルームが無効になり、最終出力パスは有効のまま（色管理が保たれる）。
//   全段階: 適用後の段階が要求段階と一致し、描画命令の回数が1以上100未満である。
// 段階適用直後のフレーム時間は記録して表示する（端末依存のため合否には用いない）。
// 実機での平均55以上・滑らかさの確認と正式な性能ゲートは Issue #19・#97 が担う。
// 接続先サーバは環境変数 BASE で指定する（既定 http://127.0.0.1:4173）。
//   PowerShell:  $env:BASE='http://127.0.0.1:4173'; node scripts/rendering-perf-smoke.mjs
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:4173";

// 描画命令の回数の上限。採用理由を先に述べる。docs/research/03-rendering-ui.md §3 が描画命令を100回未満に保つ
// ことを目安とするため、診断シーンでもこの目安を超えないことを確かめる。
const DRAW_CALL_LIMIT = 100;
// 段階適用直後の1フレームの所要時間の上限（ミリ秒）。採用理由を先に述べる。段階適用は描画バッファ再確保を
// 1回伴う一度きりの処理で、モバイル相当解像度の単一描画領域では実GPUで1ミリ秒未満、ソフトウェア描画でも
// 数ミリ秒に収まる（本スモークの実測は最大およそ3ミリ秒）。劣化制御が誤って重い処理（描画基盤の再生成や
// water 再構築など）を段階適用へ持ち込む回帰を捕捉しつつ、ソフトウェア描画のばらつきで偽陽性を出さない余裕
// として、実測最大の数十倍にあたる200ミリ秒を上限とする。これは性能の合否（実機の平均フレーム率）ではなく、
// 段階適用が過度に重い処理になっていないことの回帰検出であり、正式な性能ゲートは Issue #97 が担う。
const APPLY_FRAME_LIMIT_MS = 200;
// 端末画素密度倍率を2に設定して計測する。採用理由を先に述べる。段階2の上限1.0による画素密度の低下を観測する
// には、端末倍率が上限2より大きい（または等しい）必要がある。倍率1の端末では段階2の画素密度は変わらないため、
// 観測のために倍率2を与える。
const DEVICE_SCALE_FACTOR = 2;

const errors = [];
let failed = false;
function fail(message) {
  failed = true;
  console.error("失敗: " + message);
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: DEVICE_SCALE_FACTOR,
});
const page = await context.newPage();
page.on("pageerror", (error) => errors.push("ページ例外: " + error.message));
page.on("console", (message) => {
  if (message.type() === "error") {
    errors.push("コンソールエラー: " + message.text());
  }
});

try {
  let connected = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await page.goto(BASE + "/perf-budget.html", { waitUntil: "load", timeout: 2000 });
      connected = true;
      break;
    } catch {
      await page.waitForTimeout(500);
    }
  }
  if (!connected) {
    throw new Error("プレビューサーバへ接続できませんでした: " + BASE);
  }

  await page.waitForFunction(() => typeof window.__perfApplied === "function", undefined, {
    timeout: 15000,
  });

  const result = await page.evaluate(() =>
    typeof window.__perfApplied === "function" ? window.__perfApplied() : null
  );

  if (!result) {
    fail("window.__perfApplied が取得できませんでした");
  } else if (!result.webglAvailable) {
    fail("WebGL を利用できませんでした（webglAvailable が偽）");
  } else {
    const levels = result.levels;
    if (!Array.isArray(levels) || levels.length !== 5) {
      fail(`段階の数が5ではありません（${levels ? levels.length : "なし"}）`);
    } else {
      const byLevel = (n) => levels.find((entry) => entry.requestedLevel === n);
      const l0 = byLevel(0);
      const l1 = byLevel(1);
      const l2 = byLevel(2);
      const l3 = byLevel(3);
      const l4 = byLevel(4);

      // 全段階共通: 適用後の段階が要求段階と一致し、描画命令の回数が1以上100未満。
      for (const entry of levels) {
        if (entry.degradationLevel !== entry.requestedLevel) {
          fail(
            `段階${entry.requestedLevel}の適用後の段階が一致しません（${entry.degradationLevel}）`
          );
        }
        if (!(entry.drawCalls > 0)) {
          fail(`段階${entry.requestedLevel}の描画命令の回数が0以下です（${entry.drawCalls}）`);
        }
        if (!(entry.drawCalls < DRAW_CALL_LIMIT)) {
          fail(
            `段階${entry.requestedLevel}の描画命令の回数が上限${DRAW_CALL_LIMIT}以上です（${entry.drawCalls}）`
          );
        }
      }

      // 段階0: 中心オブジェクト（常在ミク）を反射に含める（既定。concept-final §10）。
      if (l0) {
        if (l0.reflectCenterFigure) {
          console.log("確認: 段階0で中心オブジェクトを反射に含める（既定）");
        } else {
          fail(`段階0で中心オブジェクトが反射に含まれません（reflectCenterFigure=${l0.reflectCenterFigure}）`);
        }
      }

      // 段階1: 中心オブジェクト（常在ミク）が反射から外れる（reflectCenterFigure が偽になり実効変化が立つ）。
      // 受入スモークは反射解像度の既定値512で動くため反射は有効であり、段階1の遷移で実効変化が立つ。
      if (l1) {
        if (!l1.reflectCenterFigure && l1.reflectCenterFigureChanged && l1.effectiveChanged) {
          console.log("確認: 段階1で中心オブジェクトを反射から除外（reflectCenterFigure が偽へ）");
        } else {
          fail(
            `段階1で中心オブジェクトが反射から外れません（reflectCenterFigure=${l1.reflectCenterFigure} ` +
              `changed=${l1.reflectCenterFigureChanged}）`
          );
        }
      }

      // 段階2: 画素密度倍率が段階1より下がる（端末倍率2・上限1.0で1へ）。
      if (l1 && l2) {
        if (l2.pixelRatio < l1.pixelRatio && l2.pixelRatioChanged && l2.effectiveChanged) {
          console.log(
            `確認: 段階2で画素密度倍率が低下（${l1.pixelRatio} → ${l2.pixelRatio}）`
          );
        } else {
          fail(
            `段階2で画素密度倍率が低下しません（段階1=${l1.pixelRatio} 段階2=${l2.pixelRatio} ` +
              `pixelRatioChanged=${l2.pixelRatioChanged}）`
          );
        }
      }

      // 段階3: ブルーム解像度倍率が0.25へ下がる。
      if (l3) {
        if (l3.bloomResolutionScale === 0.25 && l3.bloomResolutionChanged && l3.bloomEnabled) {
          console.log("確認: 段階3でブルーム解像度倍率が0.25へ低下（ブルームは有効のまま）");
        } else {
          fail(
            `段階3でブルーム解像度倍率が0.25へ下がりません（scale=${l3.bloomResolutionScale} ` +
              `changed=${l3.bloomResolutionChanged} enabled=${l3.bloomEnabled}）`
          );
        }
      }

      // 段階4: ブルームが無効・最終出力パスは有効（色管理が保たれる）。
      if (l4) {
        if (!l4.bloomEnabled && l4.outputPassEnabled && l4.bloomEnabledChanged) {
          console.log("確認: 段階4でブルームが無効・最終出力パスは有効（色管理を保持）");
        } else {
          fail(
            `段階4でブルーム無効・最終出力パス維持になりません（enabled=${l4.bloomEnabled} ` +
              `outputPass=${l4.outputPassEnabled} changed=${l4.bloomEnabledChanged}）`
          );
        }
      }

      // 段階遷移ごとにちょうど1つのレバー（画素密度倍率・ブルーム解像度・ブルーム有効）だけが変わることを
      // 確かめる。採用理由を先に述べる。段階適用直後のフレーム時間の絶対値はGPU・端末依存で、合否閾値に使うと
      // ソフトウェア描画の自動実行環境などで偽陽性を生む。「低下が滑らか」の本質的機構は、各段階変更で描画
      // バッファ再確保を伴う操作を1つに限ることと、振動せず切替を稀に保つこと（後者は判定器の単体テストで検証
      // 済み）である。前者をここで決定的に検証する。
      const leverChangeCount = (entry) =>
        (entry.reflectCenterFigureChanged ? 1 : 0) +
        (entry.pixelRatioChanged ? 1 : 0) +
        (entry.bloomResolutionChanged ? 1 : 0) +
        (entry.bloomEnabledChanged ? 1 : 0);
      const transitions = [l1, l2, l3, l4].filter((entry) => entry !== undefined);
      const multiLever = transitions.filter((entry) => leverChangeCount(entry) !== 1);
      if (multiLever.length === 0) {
        console.log(
          "確認: 段階1→2→3→4の各遷移でちょうど1つのレバーだけが変わる（再確保を最小化）"
        );
      } else {
        fail(
          "1つの段階遷移で複数または0個のレバーが変わりました: " +
            multiLever
              .map(
                (e) =>
                  `L${e.requestedLevel}(reflect=${e.reflectCenterFigureChanged} dpr=${e.pixelRatioChanged} ` +
                  `scale=${e.bloomResolutionChanged} enabled=${e.bloomEnabledChanged}）`
              )
              .join(" ")
        );
      }

      // 段階適用直後の1フレームの所要時間が上限未満であることを確かめる（段階適用が過度に重い処理になる回帰の検出）。
      const slowApply = levels.filter((entry) => !(entry.applyFrameMs < APPLY_FRAME_LIMIT_MS));
      if (slowApply.length === 0) {
        console.log(
          `確認: 全段階の適用直後フレーム時間が上限${APPLY_FRAME_LIMIT_MS}ミリ秒未満`
        );
      } else {
        fail(
          `段階適用が過度に重い段階があります（上限${APPLY_FRAME_LIMIT_MS}ミリ秒）: ` +
            slowApply.map((e) => `L${e.requestedLevel}=${e.applyFrameMs.toFixed(1)}ms`).join(" ")
        );
      }

      // 段階適用直後のフレーム時間の実測値を表示（記録・目視用）。
      console.log(
        "段階適用直後のフレーム時間（ミリ秒）: " +
          levels.map((e) => `L${e.requestedLevel}=${e.applyFrameMs.toFixed(1)}`).join(" ")
      );
      console.log("描画命令の回数: " + levels.map((e) => `L${e.requestedLevel}=${e.drawCalls}`).join(" "));
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
  console.error("性能バジェット自動劣化制御の受け入れ検証: 失敗");
  process.exit(1);
} else {
  console.log("性能バジェット自動劣化制御の受け入れ検証: 成功");
}
