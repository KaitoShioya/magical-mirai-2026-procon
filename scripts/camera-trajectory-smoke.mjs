// カメラ軌跡システムの実ブラウザ補助確認（Issue #13）: Playwright で診断ページ camera-trajectory.html を開き、
// window.__cameraTrajectory の掃引結果から、全曲長で滑らかに追従すること（隣接サンプル間移動量に飛びがない）、
// カメラが一方向に進むこと（最小速度が正）、setCameraPose の適用拒否がないこと、終点で描画基盤のカメラ位置と
// 前方向きが評価器と一致することを確かめる。評価器の数値的な正しさ（位置補間・距離と時刻の相互変換・速度・
// ±16ミリ秒）は単体テスト（src/utils/cameraTrajectory.test.ts）が担い、本スクリプトは描画基盤の
// setCameraPose 経由の実駆動を確かめる。接続先サーバは環境変数 BASE で指定する（既定 http://127.0.0.1:4173）。
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:4173";
// 連続性の判定閾値。採用理由を先に述べる。位置関数は1階微分まで連続のため一定刻みの移動量は滑らかに
// 変わり、区間境界の実装不具合（瞬間移動）があればその1ステップだけ移動量が平均から桁違いに跳ねる。
// 最大移動量が平均の6倍以内であれば飛びがないと判定する（速度差を許容しつつ瞬間移動を検出する余裕）。
const MAX_STEP_OVER_MEAN_RATIO = 6;
// 終点の位置・向きの一致許容。採用理由を先に述べる。診断ページとスモークは同じ評価器の値を比べ、
// 差は浮動小数の丸めのみのため、微小量 0.001 を一致判定の閾値とする（位置はワールド単位、向きは単位ベクトル成分）。
const END_TOLERANCE = 0.001;

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
      await page.goto(BASE + "/camera-trajectory.html", { waitUntil: "load", timeout: 2000 });
      connected = true;
      break;
    } catch {
      await page.waitForTimeout(500);
    }
  }
  if (!connected) {
    throw new Error("プレビューサーバへ接続できませんでした: " + BASE);
  }

  await page.waitForFunction(() => typeof window.__cameraTrajectory === "function", undefined, {
    timeout: 15000,
  });

  const result = await page.evaluate(() => window.__cameraTrajectory());

  if (!(result.endTimeMs > result.startTimeMs)) {
    fail(`軌跡の時刻範囲が不正です（start=${result.startTimeMs} end=${result.endTimeMs}）`);
  } else {
    console.log("確認: 軌跡が正の時刻範囲を覆う");
  }

  if (!(result.minSpeed > 0)) {
    fail(`軌跡上速度の最小値が ${result.minSpeed} です（期待: 正、カメラが一方向に進む）`);
  } else {
    console.log("確認: 全区間で軌跡上速度が正");
  }

  if (result.cameraPoseRejectedCount !== 0) {
    fail(`setCameraPose が ${result.cameraPoseRejectedCount} 回拒否されました（期待: 0、無音の不具合の検出）`);
  } else {
    console.log("確認: setCameraPose の適用拒否なし");
  }

  if (result.maxStepDistance > result.meanStepDistance * MAX_STEP_OVER_MEAN_RATIO) {
    fail(
      `カメラ移動量に飛びがあります（最大 ${result.maxStepDistance.toFixed(3)} > 平均 ` +
        `${result.meanStepDistance.toFixed(3)} の${MAX_STEP_OVER_MEAN_RATIO}倍）`
    );
  } else {
    console.log("確認: 全曲長で滑らかに追従（移動量に飛びなし）");
  }

  // 差が非有限値（NaN・無限大）のときは一致と誤判定しないよう、Number.isFinite を併用して失敗扱いにする。
  // 採用理由を先に述べる。比較 `差 > 許容` は差が NaN だと偽になり素通りするため、有限値であることを先に要求する。
  const positionError = Math.sqrt(
    (result.cameraPosition.x - result.expectedEndPosition.x) ** 2 +
      (result.cameraPosition.y - result.expectedEndPosition.y) ** 2 +
      (result.cameraPosition.z - result.expectedEndPosition.z) ** 2
  );
  if (!Number.isFinite(positionError) || positionError > END_TOLERANCE) {
    fail(`終点で描画カメラ位置が評価器と一致しません（差 ${positionError}）`);
  } else {
    console.log("確認: setCameraPose が評価器の終点位置を反映");
  }

  const directionError = Math.sqrt(
    (result.cameraDirection.x - result.expectedEndDirection.x) ** 2 +
      (result.cameraDirection.y - result.expectedEndDirection.y) ** 2 +
      (result.cameraDirection.z - result.expectedEndDirection.z) ** 2
  );
  if (!Number.isFinite(directionError) || directionError > END_TOLERANCE) {
    fail(`終点で描画カメラの前方向きが評価器と一致しません（差 ${directionError}）`);
  } else {
    console.log("確認: lookAt が評価器の終点注視方向を反映");
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
  console.error("カメラ軌跡システムの補助確認: 失敗");
  process.exit(1);
} else {
  console.log("カメラ軌跡システムの補助確認: 成功");
}
