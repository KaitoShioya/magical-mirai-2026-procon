// 蝶造形（Issue #61）の受け入れ基準の実機検証。
// Playwright で蝶診断ページ（butterfly.html）を開き、診断グローバル window.__butterflyState を読み、
// 蝶のみのシーンを描いた直後の描画命令の回数・三角形の数・描画個体数・個体あたり三角形数・活動個体数を確かめる。
// 形状の左右対称や寿命の数値の決定的検証は単体テスト（src/rendering/entities/butterfly*.test.ts）が担い、
// 本スクリプトは派生シェーダが実機でコンパイルされ、単一の InstancedMesh が1回の描画命令にまとまり、
// 三角形数がジオメトリと描画個体数の積に一致することを確かめる。
// 接続先サーバは環境変数 BASE で指定する（既定 http://127.0.0.1:4173）。
//   PowerShell:  $env:BASE='http://127.0.0.1:4173'; node scripts/rendering-butterfly-smoke.mjs
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:4173";
// 描画命令の上限。判定方法の根拠を先に述べる。蝶は単一の InstancedMesh で全個体を1回のインスタンス描画命令で
// 描くため描画命令は1回になる。発光点スモークと同じ「5未満」の余裕上限に揃え、後で発光点と蝶を同居させた
// ときの比較基準も合わせる。
const DRAW_CALL_LIMIT = 5;

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
      await page.goto(BASE + "/butterfly.html", { waitUntil: "load", timeout: 2000 });
      connected = true;
      break;
    } catch {
      await page.waitForTimeout(500);
    }
  }
  if (!connected) {
    throw new Error("プレビューサーバへ接続できませんでした: " + BASE);
  }

  await page.waitForFunction(() => typeof window.__butterflyState === "function", undefined, {
    timeout: 15000,
  });

  const state = await page.evaluate(() =>
    typeof window.__butterflyState === "function" ? window.__butterflyState() : null
  );

  if (!state) {
    fail("window.__butterflyState が取得できませんでした");
  } else {
    if (state.drawCalls < DRAW_CALL_LIMIT) {
      console.log(`確認: 蝶の描画命令は ${state.drawCalls} 回（上限 ${DRAW_CALL_LIMIT} 未満）`);
    } else {
      fail(`描画命令が ${state.drawCalls} 回です（期待: ${DRAW_CALL_LIMIT} 未満）`);
    }

    // 蝶が実際に描かれたことを三角形の数が0より多いことで確かめる。
    if (state.triangles > 0) {
      console.log(`確認: 蝶が実際に描かれた（三角形 ${state.triangles} 個）`);
    } else {
      fail(`三角形が ${state.triangles} 個です（期待: 0より大きい）`);
    }

    // 三角形数の期待値を固定値ではなく、状態が公開する個体あたり三角形数と描画個体数の積で動的に計算する。
    // 判定方法の根拠を先に述べる。単一ジオメトリのインスタンス描画では三角形数はこの積に等しくなるため、
    // 一致しなければジオメトリの分割暴走か描画個体数の不整合を検出できる。形状の分割数を調整しても追従する。
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

    // 活動個体が0より多いこと（spawnと更新が機能している）。
    if (state.activeCount > 0) {
      console.log(`確認: 活動個体数は ${state.activeCount}`);
    } else {
      fail(`活動個体数が ${state.activeCount} です（期待: 0より大きい）`);
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
  console.error("蝶造形描画の受け入れ検証: 失敗");
  process.exit(1);
} else {
  console.log("蝶造形描画の受け入れ検証: 成功");
}
