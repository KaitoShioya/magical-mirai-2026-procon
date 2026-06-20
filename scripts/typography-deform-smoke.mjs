// 全文一括変形（Issue #22）の実レンダリング検査。
// Playwright で変形シナリオ（typography.html?profile=deform）を実機GPUで開き、自前の頂点変形シェーダが
// 破綻なくコンパイル・描画されること、各変形単位が1回の描画命令で描かれることを確かめる。
// 単体テスト（src/typography/kineticText/deformMaterial.test.ts・engine.deform.test.ts）は呼び出し順・
// ユニフォーム値・冪等性を担い、実際のシェーダ派生とGPU描画は本スクリプトが担う。
// 接続先サーバは環境変数 BASE で指定する。
//   実行: BASE=http://localhost:5173 node scripts/typography-deform-smoke.mjs（別端末で npm run dev を起動）
import { launchGpuBrowser, closeBrowser } from "./harness/browser.mjs";
import { openPage, waitForReady } from "./harness/page.mjs";
import { readRendererInfo, isSoftwareRenderer } from "./harness/metrics.mjs";
import { BASE } from "./harness/config.mjs";

// 描画命令数の上限の許容余裕。判定方法の根拠を先に述べる。発光を切った（bloom=0）診断シーンは、合成の
// 描画の枠組み（描画パス）と、各変形単位（1単位＝1つの Text＝1回の描画命令、縁取りなしで追加描画なし）
// だけを描く。よって描画命令数は「枠組みの定数 + 変形単位の数」で近似でき、枠組みの定数を小さな余裕として
// 許す。2 は描画パスと画面消去の分の妥当な上限である。
const DRAW_CALL_OVERHEAD = 2;
// 変形シナリオは最悪集中区間（58秒）から始め、変形単位がすぐ現れるようにする（出典は typography-fps.mjs）。
const PEAK_START_MS = 58000;

const failures = [];
function fail(message) {
  failures.push(message);
  console.error("失敗: " + message);
}

const { browser, meta } = await launchGpuBrowser({});
console.log(`起動: channel=${meta.channel} angle=${meta.angle} browser=${meta.browserVersion}`);

try {
  // 発光を切って描画命令数を「枠組み + 変形単位数」に保ち、1単位＝1描画命令を確かめられるようにする。
  const { page, errors, pageErrors } = await openPage(browser, {
    url: `${BASE}/typography.html?profile=deform&start=${PEAK_START_MS}&bloom=0`,
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    cpuThrottle: 1,
  });

  const rendererInfo = await readRendererInfo(page);
  const software = isSoftwareRenderer(rendererInfo.renderer);

  await waitForReady(page, {});
  // 変形単位が描かれるまで待つ（先行暖機の後、最悪集中区間で単位が現れる）。
  await page.waitForFunction(
    () => typeof window.__activeDeformUnits === "function" && window.__activeDeformUnits() > 0,
    undefined,
    { timeout: 15000 }
  );

  const snapshot = await page.evaluate(() => ({
    drawCalls: typeof window.__drawCalls === "function" ? window.__drawCalls() : -1,
    units: typeof window.__activeDeformUnits === "function" ? window.__activeDeformUnits() : -1,
  }));

  console.log(
    `[deform] 描画=${software ? "ソフトウェア" : "GPU"}(${rendererInfo.renderer}) ` +
      `描画命令=${snapshot.drawCalls} 変形単位=${snapshot.units} ページ例外=${pageErrors.length}`
  );

  if (software) {
    fail("ソフトウェア描画のため実機の描画健全性を表さない（GPUのある環境で実行する）");
  }
  if (snapshot.units <= 0) {
    fail(`変形単位が ${snapshot.units} 個です（期待: 1個以上）`);
  }
  // 自前の頂点変形シェーダがコンパイルに失敗すると、three.js が "THREE.WebGLProgram: Shader Error" を
  // コンソールに出して描画を飛ばす。コンソールエラーにこの文言が無いことで、実機コンパイルの成功を確かめる。
  const shaderErrors = errors.filter((message) => /Shader Error|WebGLProgram/.test(message));
  if (shaderErrors.length > 0) {
    fail("シェーダのコンパイル誤りを検出しました:\n" + shaderErrors.join("\n"));
  }
  // 各変形単位が1回の描画命令で描かれることを確かめる。判定方法の根拠を先に述べる。発光を切った診断シーンの
  // 描画命令数は「枠組みの定数 + 変形単位の数」になる。描画命令数が変形単位数以上であることは各単位が
  // 描かれたこと（実際に1回の描画命令を発したこと）を、変形単位数 + 余裕以内であることは1単位が1回の描画命令に
  // 収まっていること（縁取りなどで増えていないこと）を示す。
  if (snapshot.drawCalls < snapshot.units) {
    fail(`描画命令が ${snapshot.drawCalls} 回で、変形単位 ${snapshot.units} 個に満たない（描かれていない単位がある）`);
  } else if (snapshot.drawCalls > snapshot.units + DRAW_CALL_OVERHEAD) {
    fail(
      `描画命令が ${snapshot.drawCalls} 回です（期待: 変形単位 ${snapshot.units} + 余裕 ${DRAW_CALL_OVERHEAD} 以内）`
    );
  } else {
    console.log(
      `確認: 各変形単位が1回の描画命令で描かれた（変形単位 ${snapshot.units} ≦ 描画命令 ${snapshot.drawCalls} ≦ 変形単位 + 余裕 ${DRAW_CALL_OVERHEAD}）`
    );
  }
  if (pageErrors.length > 0) {
    fail("ページ例外を検出しました:\n" + pageErrors.join("\n"));
  }

  await page.context().close();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
} finally {
  await closeBrowser(browser);
}

if (failures.length > 0) {
  console.error("全文一括変形の実レンダリング検査: 失敗");
  process.exit(1);
} else {
  console.log("全文一括変形の実レンダリング検査: 成功");
}
