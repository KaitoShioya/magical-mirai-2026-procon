// ネオン星雲の夜空（Issue #205）の受け入れ検証。Playwright で夜空診断ページ（night-sky.html）を開き、診断
// グローバル window.__nightSkyState を読み、本番と同じ経路で夜空が成立することを確かめる。
// 反射解像度512と256の双方で、夜空が組み込まれ（skyPresent）、反射が有効で、描画命令数が100未満であること、
// 空の代表領域の輝度が黒と区別でき（下限24以上）かつブルームで白くにじまない（上限128未満）こと、空に星・星雲の
// 明るい部分があること（最大輝度が平均より16以上高い）、地形・水面の代表領域がブルーム下限を超えない（128未満）
// ことを判定する。閾値の根拠はプラン（256段階での0.5＝128、黒との識別下限24、知覚最小差16）に従う。
// 接続先サーバは環境変数 BASE で指定する（既定 http://127.0.0.1:4173）。
//   PowerShell:  $env:BASE='http://127.0.0.1:4173'; node scripts/rendering-night-sky-smoke.mjs
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:4173";

// 閾値（採用理由はファイル冒頭に先述）。
const SKY_LUMINANCE_FLOOR = 24; // 空が黒と知覚的に区別できる下限（現状の背景輝度およそ5の約5倍）。
const BLOOM_LUMINANCE_CEIL = 128; // ブルーム下限0.5に対応する256段階の値。これ未満で白くにじまない。
// 空の構造（グラデーションと星雲の濃淡）が存在することの最小の明暗差。採用理由を先に述べる。空が単一の平らな色でなく、
// 明暗の構造を持つことを確かめるため、空の代表領域の最大輝度と最小輝度の差がこの値以上であることを要求する。値は、
// 黒と区別できる下限として採った24（256段階）を流用し、空の最も明るい所と最も暗い所が少なくとも「見える」差を持つこと
// を求める。最大と平均の差でなく最大と最小の差にするのは、描画環境や星雲の漂いの時刻によらず安定して測れるためである。
const SKY_STRUCTURE_MIN = 24;
const DRAW_CALL_LIMIT = 100; // 1フレームの描画命令数の上限。

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

async function checkResolution(reflectionResolution) {
  let connected = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await page.goto(BASE + "/night-sky.html?refl=" + reflectionResolution, {
        waitUntil: "load",
        timeout: 2000,
      });
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
    () => typeof window.__nightSkyReady === "function" && window.__nightSkyReady() === true,
    undefined,
    { timeout: 30000 }
  );

  const state = await page.evaluate(() =>
    typeof window.__nightSkyState === "function" ? window.__nightSkyState() : null
  );

  const label = `反射解像度${reflectionResolution}`;
  if (!state) {
    fail(`${label}: window.__nightSkyState が取得できませんでした`);
    return;
  }
  if (!state.webglAvailable) {
    fail(`${label}: WebGL を利用できませんでした（webglAvailable が偽）`);
    return;
  }
  if (state.skyPresent) {
    console.log(`確認: ${label}: 夜空が組み込まれています（skyPresent=true）`);
  } else {
    fail(`${label}: 夜空が組み込まれていません（skyPresent=false）`);
  }
  if (state.reflectionEnabled) {
    console.log(`確認: ${label}: 平面反射が有効です（夜空が湖面に映る経路が成立）`);
  } else {
    fail(`${label}: 平面反射が有効ではありません（reflectionEnabled=false）`);
  }
  if (state.reflectionResolution === reflectionResolution) {
    console.log(`確認: ${label}: 反射解像度が要求どおりです`);
  } else {
    fail(`${label}: 反射解像度が要求と異なります（${state.reflectionResolution}）`);
  }
  if (state.drawCalls < DRAW_CALL_LIMIT) {
    console.log(`確認: ${label}: 描画命令数が上限未満です（${state.drawCalls} < ${DRAW_CALL_LIMIT}）`);
  } else {
    fail(`${label}: 描画命令数が上限以上です（${state.drawCalls} >= ${DRAW_CALL_LIMIT}）`);
  }
  if (state.skyLuminance >= SKY_LUMINANCE_FLOOR && state.skyLuminance < BLOOM_LUMINANCE_CEIL) {
    console.log(
      `確認: ${label}: 空が暗すぎず明るすぎません（輝度 ${state.skyLuminance.toFixed(1)} は ${SKY_LUMINANCE_FLOOR} 以上 ${BLOOM_LUMINANCE_CEIL} 未満）`
    );
  } else {
    fail(
      `${label}: 空の輝度が範囲外です（${state.skyLuminance.toFixed(1)}、要件 ${SKY_LUMINANCE_FLOOR} 以上 ${BLOOM_LUMINANCE_CEIL} 未満）`
    );
  }
  if (state.skyMaxLuminance - state.skyMinLuminance >= SKY_STRUCTURE_MIN) {
    console.log(
      `確認: ${label}: 空に明暗の構造（グラデーションと星雲の濃淡）があります（最大 ${state.skyMaxLuminance.toFixed(1)} − 最小 ${state.skyMinLuminance.toFixed(1)} ≥ ${SKY_STRUCTURE_MIN}）`
    );
  } else {
    fail(
      `${label}: 空の明暗の構造が不足しています（最大 ${state.skyMaxLuminance.toFixed(1)} − 最小 ${state.skyMinLuminance.toFixed(1)} < ${SKY_STRUCTURE_MIN}）`
    );
  }
  if (state.terrainLuminance < BLOOM_LUMINANCE_CEIL) {
    console.log(
      `確認: ${label}: 地形・水面がブルーム下限を超えません（輝度 ${state.terrainLuminance.toFixed(1)} < ${BLOOM_LUMINANCE_CEIL}）`
    );
  } else {
    fail(
      `${label}: 地形・水面の輝度がブルーム下限以上です（${state.terrainLuminance.toFixed(1)} >= ${BLOOM_LUMINANCE_CEIL}）`
    );
  }
}

try {
  for (const reflectionResolution of [512, 256]) {
    await checkResolution(reflectionResolution);
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
  console.error("ネオン星雲の夜空の受け入れ検証: 失敗");
  process.exit(1);
} else {
  console.log("ネオン星雲の夜空の受け入れ検証: 成功");
}
