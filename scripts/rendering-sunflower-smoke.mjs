// ひまわり造形（Issue #60）の受け入れ基準の実機検証。
// Playwright でひまわり診断ページ（sunflower.html）を開き、診断グローバル window.__sunflowerState を読み、
// ひまわりのみのシーンを描いた直後の描画命令の回数・三角形の数・描画個体数・個体あたり三角形数・
// 代表個体の大きさと輝度の標本・幾何メトリクスを確かめる。形状の螺旋・花弁・色階調の決定的検証は単体テスト
// （src/rendering/entities/sunflower*.test.ts）が担い、本スクリプトは派生材質が実機でコンパイルされ、単一の
// InstancedMesh が1回の描画命令にまとまり、三角形数がジオメトリと描画個体数の積に一致し、中心花弁比率が
// 妥当な帯に収まることを確かめる。あわせて固定seedの3段階を並べた画面のスクリーンショットを保存し作者目視に供する。
// 接続先サーバは環境変数 BASE で指定する（既定 http://127.0.0.1:4173）。
//   PowerShell:  $env:BASE='http://127.0.0.1:4173'; node scripts/rendering-sunflower-smoke.mjs
import { chromium } from "playwright";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE || "http://127.0.0.1:4173";
// 描画命令の上限。判定方法の根拠を先に述べる。ひまわりは単一の InstancedMesh で全個体を1回のインスタンス描画
// 命令で描くため描画命令は1回になる。発光点・蝶のスモークと同じ「5未満」の余裕上限に揃える。
const DRAW_CALL_LIMIT = 5;
// 中心花弁比率の許容帯。判定方法の根拠を先に述べる。設計の目標は 花盤半径÷(花盤半径＋花弁長)=0.5 であり、
// 受け入れ基準④の±10%に合わせて 0.45 以上 0.55 以下を合格とする（厳密な目標一致は単体テストが固定する）。
const RATIO_MIN = 0.45;
const RATIO_MAX = 0.55;
const SCREENSHOT_PATH = join(tmpdir(), "sunflower-smoke.png");

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

try {
  let connected = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await page.goto(BASE + "/sunflower.html", { waitUntil: "load", timeout: 2000 });
      connected = true;
      break;
    } catch {
      await page.waitForTimeout(500);
    }
  }
  if (!connected) {
    throw new Error("プレビューサーバへ接続できませんでした: " + BASE);
  }

  await page.waitForFunction(() => typeof window.__sunflowerState === "function", undefined, {
    timeout: 15000,
  });

  const state = await page.evaluate(() =>
    typeof window.__sunflowerState === "function" ? window.__sunflowerState() : null
  );

  if (!state) {
    fail("window.__sunflowerState が取得できませんでした");
  } else {
    if (state.drawCalls < DRAW_CALL_LIMIT) {
      console.log(`確認: ひまわりの描画命令は ${state.drawCalls} 回（上限 ${DRAW_CALL_LIMIT} 未満）`);
    } else {
      fail(`描画命令が ${state.drawCalls} 回です（期待: ${DRAW_CALL_LIMIT} 未満）`);
    }

    if (state.triangles > 0) {
      console.log(`確認: ひまわりが実際に描かれた（三角形 ${state.triangles} 個）`);
    } else {
      fail(`三角形が ${state.triangles} 個です（期待: 0より大きい）`);
    }

    // 三角形数の期待値を、状態が公開する個体あたり三角形数と描画個体数の積で動的に計算する。判定方法の根拠を
    // 先に述べる。単一ジオメトリのインスタンス描画では三角形数はこの積に等しくなるため、一致しなければ
    // ジオメトリの分割暴走か描画個体数の不整合を検出できる。形状の分割数を調整しても追従する。
    const expectedTriangles = state.trianglesPerInstance * state.instanceCount;
    if (state.triangles === expectedTriangles) {
      console.log(
        `確認: 三角形数 ${state.triangles} は 個体あたり${state.trianglesPerInstance}×描画個体${state.instanceCount} に一致`
      );
    } else {
      fail(
        `三角形数 ${state.triangles} が 個体あたり${state.trianglesPerInstance}×描画個体${state.instanceCount}=${expectedTriangles} と一致しません`
      );
    }

    // 反応強度3段階の大きさ・輝度が単調増加（反応強度で大きさ/輝度が可変であることの確認）。
    const scales = state.sampleScales;
    const brights = state.sampleBrightnesses;
    const monotonic = (arr) => arr.every((v, i) => i === 0 || v > arr[i - 1]);
    if (Array.isArray(scales) && scales.length >= 2 && monotonic(scales)) {
      console.log(`確認: 反応強度で大きさが単調増加（${scales.map((v) => v.toFixed(2)).join(", ")}）`);
    } else {
      fail(`大きさの標本が単調増加ではありません（${JSON.stringify(scales)}）`);
    }
    if (Array.isArray(brights) && brights.length >= 2 && monotonic(brights)) {
      console.log(`確認: 反応強度で輝度が単調増加（${brights.map((v) => v.toFixed(2)).join(", ")}）`);
    } else {
      fail(`輝度の標本が単調増加ではありません（${JSON.stringify(brights)}）`);
    }

    // 中心花弁比率が許容帯に収まる。ジオメトリは全個体で共有のため、この比率は各個体の等方スケールに依らず一定
    // （スケール不変）である。よって3段階の大きさのいずれでも同じ比率になる。
    if (state.centerPetalRatio >= RATIO_MIN && state.centerPetalRatio <= RATIO_MAX) {
      console.log(
        `確認: 中心花弁比率は ${state.centerPetalRatio.toFixed(3)}（許容 ${RATIO_MIN}〜${RATIO_MAX}、スケール不変）`
      );
    } else {
      fail(
        `中心花弁比率が ${state.centerPetalRatio.toFixed(3)} です（期待: ${RATIO_MIN}〜${RATIO_MAX}）`
      );
    }
  }

  // 固定seedの3段階を並べた画面のスクリーンショットを保存し、作者目視（花盤螺旋・花弁・色階調・発光）に供する。
  // 描画ループが1フレーム描いてから撮るため、短く待ってから保存する。
  await page.waitForTimeout(300);
  await page.screenshot({ path: SCREENSHOT_PATH });
  console.log(`スクリーンショットを保存しました: ${SCREENSHOT_PATH}`);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
} finally {
  await browser.close();
}

if (errors.length > 0) {
  fail("ページ・コンソールのエラーを検出しました:\n" + errors.join("\n"));
}

if (failed) {
  console.error("ひまわり造形描画の受け入れ検証: 失敗");
  process.exit(1);
} else {
  console.log("ひまわり造形描画の受け入れ検証: 成功");
}
