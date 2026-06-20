// 入力アーキテクチャ（Issue #47）のスモークテスト。Playwright で実ブラウザの入力受付を検証する。
// 接続先サーバは環境変数 BASE で指定する（既定 http://127.0.0.1:4173）。診断ページ /input.html を開く。
// 操作の主軸がスマートフォンの横持ち両手であるため、横長の寸法（横844×縦390画素）で検証する。
// 起動例:
//   Unix系シェル:   BASE=http://127.0.0.1:4173 npm run smoke:input
//   PowerShell:     $env:BASE='http://127.0.0.1:4173'; npm run smoke:input
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:4173";
const SLOT_COUNT = 7;

const errors = [];
let failed = false;

function fail(message) {
  failed = true;
  console.error("失敗: " + message);
}

function approxEqual(a, b) {
  // 浮動小数点の比較。色パラメータと正規化座標の一致判定に用いる。
  // 1e-9 を採る理由: 入力面の画素から逆算した正規化値の丸め誤差は 1e-12 程度であり、それを十分上回るため。
  return Math.abs(a - b) < 1e-9;
}

// 入力面の矩形は全画面（横844×縦390）。スロット s の中央の縦位置はその帯の中央 (s+0.5)/SLOT_COUNT に対応する。
function clientYForSlotCenter(slot, height) {
  return ((slot + 0.5) / SLOT_COUNT) * height;
}

async function dispatchPointerDown(page, pointerId, pointerType, clientX, clientY) {
  return page.evaluate(
    (arg) => {
      const surface = document.getElementById("input-surface");
      const event = new PointerEvent("pointerdown", {
        pointerId: arg.pointerId,
        pointerType: arg.pointerType,
        clientX: arg.clientX,
        clientY: arg.clientY,
        cancelable: true,
        bubbles: true,
      });
      surface.dispatchEvent(event);
      return event.defaultPrevented;
    },
    { pointerId, pointerType, clientX, clientY }
  );
}

async function dispatchPointerUp(page, pointerId, pointerType, clientX, clientY) {
  return page.evaluate(
    (arg) => {
      const surface = document.getElementById("input-surface");
      surface.dispatchEvent(
        new PointerEvent("pointerup", {
          pointerId: arg.pointerId,
          pointerType: arg.pointerType,
          clientX: arg.clientX,
          clientY: arg.clientY,
          bubbles: true,
        })
      );
    },
    { pointerId, pointerType, clientX, clientY }
  );
}

async function dispatchKeyDown(page, key, repeat) {
  return page.evaluate(
    (arg) => {
      const event = new KeyboardEvent("keydown", {
        key: arg.key,
        repeat: arg.repeat,
        cancelable: true,
        bubbles: true,
      });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    },
    { key, repeat }
  );
}

async function readReactions(page) {
  return page.evaluate(() =>
    typeof window.__inputReactions === "function" ? window.__inputReactions() : null
  );
}

async function readState(page) {
  return page.evaluate(() =>
    typeof window.__inputState === "function" ? window.__inputState() : null
  );
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 844, height: 390 } });
const page = await context.newPage();
page.on("pageerror", (error) => errors.push("ページ例外: " + error.message));
page.on("console", (message) => {
  if (message.type() === "error") {
    errors.push("コンソールエラー: " + message.text());
  }
});

try {
  // 起動待ち: 最大30回・各500ミリ秒間隔（合計上限15秒）でプレビューサーバの起動完了を待つ。
  let connected = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await page.goto(BASE + "/input.html", { waitUntil: "load", timeout: 2000 });
      connected = true;
      break;
    } catch {
      await page.waitForTimeout(500);
    }
  }
  if (!connected) {
    throw new Error("プレビューサーバへ接続できませんでした: " + BASE);
  }

  // 診断ページの初期化完了（入力面とアクセサの公開）を待つ。
  await page.waitForFunction(
    () =>
      document.getElementById("input-surface") !== null &&
      typeof window.__inputReactions === "function" &&
      typeof window.__inputState === "function",
    undefined,
    { timeout: 15000 }
  );

  const rect = await page.evaluate(() => {
    const surface = document.getElementById("input-surface");
    const box = surface.getBoundingClientRect();
    return { width: box.width, height: box.height };
  });

  // 1. 入力面要素の算出 touch-action が none であること。
  const initialState = await readState(page);
  if (!initialState || initialState.touchAction !== "none") {
    fail(`touch-action が "${initialState ? initialState.touchAction : "不明"}" です（期待: "none"）`);
  } else {
    console.log("確認: 入力面の touch-action が none");
  }

  // 2. 同一座標でマウスとタッチが同じ slotIndex と colorX01 を返し、source が区別されること。
  const sameX = rect.width * 0.5;
  const sameY = clientYForSlotCenter(2, rect.height);
  const mouseDownPrevented = await dispatchPointerDown(page, 1, "mouse", sameX, sameY);
  await dispatchPointerUp(page, 1, "mouse", sameX, sameY);
  await dispatchPointerDown(page, 2, "touch", sameX, sameY);
  await dispatchPointerUp(page, 2, "touch", sameX, sameY);
  let list = await readReactions(page);
  const touchReaction = list[list.length - 1];
  const mouseReaction = list[list.length - 2];
  if (!mouseDownPrevented) {
    fail("pointerdown の既定動作が取り消されていません（スクロール・ピンチ無効化の根拠が無い）");
  } else {
    console.log("確認: pointerdown で既定動作が取り消される");
  }
  if (mouseReaction.source !== "mouse" || touchReaction.source !== "touch") {
    fail(
      `入力源が区別されていません（mouse=${mouseReaction.source}, touch=${touchReaction.source}）`
    );
  } else if (
    mouseReaction.slotIndex !== touchReaction.slotIndex ||
    !approxEqual(mouseReaction.colorX01, touchReaction.colorX01)
  ) {
    fail("同一座標のマウスとタッチで出力が一致しません");
  } else if (mouseReaction.slotIndex !== 2) {
    fail(`スロット番号が ${mouseReaction.slotIndex} です（期待: 2）`);
  } else {
    console.log("確認: 同一座標でマウスとタッチが同一出力かつ入力源を区別");
  }

  // 3. 異なるY位置の2点同時押しで、追跡接触数が2へ達し、別々の slotIndex を持つこと。
  const beforeMultiTouch = (await readReactions(page)).length;
  await dispatchPointerDown(page, 11, "touch", rect.width * 0.3, clientYForSlotCenter(0, rect.height));
  await dispatchPointerDown(page, 12, "touch", rect.width * 0.7, clientYForSlotCenter(6, rect.height));
  const multiTouchState = await readState(page);
  list = await readReactions(page);
  const multiTouchReactions = list.slice(beforeMultiTouch);
  if (multiTouchState.activePointerCount !== 2) {
    fail(`同時追跡接触数が ${multiTouchState.activePointerCount} です（期待: 2）`);
  } else if (
    multiTouchReactions.length !== 2 ||
    multiTouchReactions[0].slotIndex === multiTouchReactions[1].slotIndex
  ) {
    fail("2点同時押しが別々のスロットの2件として独立に扱われていません");
  } else {
    console.log("確認: 2点同時押しが独立に追跡され別々のスロットを持つ");
  }
  // 片方を解放しても他方が残ること（多指の独立）。
  await dispatchPointerUp(page, 11, "touch", rect.width * 0.3, clientYForSlotCenter(0, rect.height));
  const afterOneRelease = await readState(page);
  if (afterOneRelease.activePointerCount !== 1) {
    fail(`片方解放後の追跡接触数が ${afterOneRelease.activePointerCount} です（期待: 1）`);
  } else {
    console.log("確認: 片方の解放が他方に影響しない");
  }
  await dispatchPointerUp(page, 12, "touch", rect.width * 0.7, clientYForSlotCenter(6, rect.height));

  // 4. キーボード。数字キー「3」で slotIndex 2・colorX01 0.5、「d」後の「3」で colorX01 0.6。
  const key3Prevented = await dispatchKeyDown(page, "3", false);
  list = await readReactions(page);
  const key3Reaction = list[list.length - 1];
  if (!key3Prevented) {
    fail("数字キーの既定動作が取り消されていません");
  } else if (
    key3Reaction.source !== "keyboard" ||
    key3Reaction.slotIndex !== 2 ||
    !approxEqual(key3Reaction.colorX01, 0.5)
  ) {
    fail(
      `数字キー「3」の出力が不正です（source=${key3Reaction.source}, slot=${key3Reaction.slotIndex}, colorX=${key3Reaction.colorX01}）`
    );
  } else {
    console.log("確認: 数字キー「3」が中央0.5・スロット2を生む");
  }
  // 「3」のキーボード出力が、同じ正規化座標のポインタ押下と一致すること（入力同等性）。
  const equivX = rect.width * 0.5;
  const equivY = clientYForSlotCenter(2, rect.height);
  await dispatchPointerDown(page, 21, "touch", equivX, equivY);
  await dispatchPointerUp(page, 21, "touch", equivX, equivY);
  list = await readReactions(page);
  const equivPointer = list[list.length - 1];
  if (
    equivPointer.slotIndex !== key3Reaction.slotIndex ||
    !approxEqual(equivPointer.colorX01, key3Reaction.colorX01)
  ) {
    fail("キーボードと同一正規化座標のポインタ押下で出力が一致しません");
  } else {
    console.log("確認: キーボードとポインタが同一座標で同一出力（入力同等性）");
  }

  await dispatchKeyDown(page, "d", false);
  await dispatchKeyDown(page, "3", false);
  list = await readReactions(page);
  const afterMoveReaction = list[list.length - 1];
  if (!approxEqual(afterMoveReaction.colorX01, 0.6)) {
    fail(`「d」後の「3」の colorX01 が ${afterMoveReaction.colorX01} です（期待: 0.6）`);
  } else {
    console.log("確認: 「d」で仮想カーソルが右へ1段移動し colorX01 が0.6");
  }

  // 5. 数字キーの自動繰り返しでは反応が増えないこと（押下1回につき1反応）。
  const beforeRepeat = (await readReactions(page)).length;
  await dispatchKeyDown(page, "3", true);
  const afterRepeat = (await readReactions(page)).length;
  if (afterRepeat !== beforeRepeat) {
    fail("数字キーの自動繰り返しで反応が増えました（押下1回につき1反応に反する）");
  } else {
    console.log("確認: 数字キーの自動繰り返しは反応を生まない");
  }

  // 6. 左移動キー「a」「ArrowLeft」で減少、「ArrowRight」で増加し、0以上1以下に収まること。
  const xBeforeMove = (await readState(page)).keyboardColorX01;
  await dispatchKeyDown(page, "a", false);
  const xAfterLeftKeyA = (await readState(page)).keyboardColorX01;
  await dispatchKeyDown(page, "ArrowRight", false);
  const xAfterArrowRight = (await readState(page)).keyboardColorX01;
  await dispatchKeyDown(page, "ArrowLeft", false);
  const xAfterArrowLeft = (await readState(page)).keyboardColorX01;
  if (!(xAfterLeftKeyA < xBeforeMove + 1e-9)) {
    fail(`「a」で仮想カーソルが減少しません（${xBeforeMove} -> ${xAfterLeftKeyA}）`);
  } else if (!(xAfterArrowRight > xAfterLeftKeyA - 1e-9)) {
    fail(`「ArrowRight」で仮想カーソルが増加しません（${xAfterLeftKeyA} -> ${xAfterArrowRight}）`);
  } else if (!(xAfterArrowLeft < xAfterArrowRight + 1e-9)) {
    fail(`「ArrowLeft」で仮想カーソルが減少しません（${xAfterArrowRight} -> ${xAfterArrowLeft}）`);
  } else {
    console.log("確認: 「a」「ArrowLeft」で減少し「ArrowRight」で増加する");
  }
  // 下限・上限のクランプ。全幅1.0を移動量0.1で割ると10回で端から端へ届くため、余裕を見て12回で確実に端へ到達する。
  for (let i = 0; i < 12; i += 1) {
    await dispatchKeyDown(page, "a", false);
  }
  const xAtLowerBound = (await readState(page)).keyboardColorX01;
  for (let i = 0; i < 12; i += 1) {
    await dispatchKeyDown(page, "ArrowRight", false);
  }
  const xAtUpperBound = (await readState(page)).keyboardColorX01;
  if (!approxEqual(xAtLowerBound, 0)) {
    fail(`左移動を重ねた下限が ${xAtLowerBound} です（期待: 0、0未満にならない）`);
  } else if (!approxEqual(xAtUpperBound, 1)) {
    fail(`右移動を重ねた上限が ${xAtUpperBound} です（期待: 1、1超にならない）`);
  } else {
    console.log("確認: 仮想カーソルが0以上1以下にクランプされる");
  }

  // 7. 通常の本体ページでは入力の診断アクセサが公開されていないこと。
  await page.goto(BASE + "/", { waitUntil: "load" });
  const diagnosticAbsent = await page.evaluate(
    () => typeof window.__inputReactions === "undefined"
  );
  if (!diagnosticAbsent) {
    fail("本体ページ（/）で window.__inputReactions が公開されています");
  } else {
    console.log("確認: 本体ページでは入力の診断アクセサが未公開");
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
  console.error("入力スモークテスト: 失敗");
  process.exit(1);
} else {
  console.log("入力スモークテスト: 成功");
}
