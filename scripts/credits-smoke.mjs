// クレジット表示のスモークテスト（Issue #82）。
// 規定文言が漏れなく表示され、開閉でき、覆いより上の重なり順に置かれることを実ブラウザで検証する。
// 接続先サーバは環境変数 BASE で指定する（既定 http://127.0.0.1:4173）。トークン不要の診断経路 /?smoke=1 を開く。
// 診断モードで抑止される #64 のミクのバッジは確認対象にしない（検証対象は本Issueのクレジット表示に限る）。
// 文書要素の検証を実ブラウザのスモークで行う理由を先に述べる。単体テスト（vitest）は node 環境で動かし、
// 文書要素を扱う仕組み（jsdom 等）を導入していないため、開閉と表示の検証は実ブラウザで行う。
// 後始末（dispose による表示要素の除去）は、アプリの通常実行では破棄の経路を踏まないため、本スモークでは検証しない。
// 起動例:
//   Unix系シェル:   BASE=http://127.0.0.1:4173 npm run smoke:credits
//   PowerShell:     $env:BASE='http://127.0.0.1:4173'; npm run smoke:credits
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:4173";

// 一覧の本文に必ず含まれるべき規定文言。
// 受け入れ基準「規定文言が漏れなく表示される」を描画レベルで担保するため、
// ミクの指定文言・フォント・使用楽曲・AI不使用の各項目のうち、文字として表示するものを網羅する。
// （アドレスはリンクの行き先で別途確かめる。）
const REQUIRED_TEXTS = [
  // ミクの指定文言（描いた旨・ライセンス名・権利者の社名・ガイドライン遵守の旨）。
  "この作品はピアプロ・キャラクター・ライセンスに基づいて初音ミクを描いています。",
  "ピアプロ・キャラクター・ライセンス",
  "Crypton Future Media",
  "本作品はクリプトン・フューチャー・メディア株式会社のキャラクター利用のガイドラインに従います。",
  // フォント（書体名・作者・配布元の名称・ライセンス名）。
  "Zen Kaku Gothic New",
  "Yoshimichi Ohira / Zenfonts",
  "Google Fonts",
  "SIL Open Font License",
  // 使用楽曲（題名・作者）。
  "TAKEOVER",
  "Twinfield",
  // AI不使用の明示。
  "AIが生成した素材は使用していません",
];

// リンクの行き先で確かめるアドレス。
const PCL_LICENSE_URL = "https://piapro.jp/license/pcl/summary"; // ミクのライセンスのアドレス
const FONT_SOURCE_URL = "https://fonts.google.com/specimen/Zen+Kaku+Gothic+New"; // フォントの配布元
const FONT_LICENSE_FILE_PATH = "/fonts/zen-kaku-gothic-new-OFL.txt"; // フォントのライセンス本文の場所
// 使用楽曲の出所のアドレスの完全な形。版の番号は将来更新され得るため数字の並びとして確かめ、
// かつ余計な文字が無い完全な形であることまで確かめる（楽曲識別子 E2i3 は TAKEOVER を一意に指す不変部分）。
const SONG_URL_PATTERN = /^https:\/\/piapro\.jp\/t\/E2i3\/\d+$/;

const errors = [];
let failed = false;

function fail(message) {
  failed = true;
  console.error("失敗: " + message);
}

async function isPanelHidden(page) {
  return page.evaluate(() => {
    const panel = document.querySelector(".credits-panel");
    return panel ? panel.hidden === true : null;
  });
}

async function ariaExpanded(page) {
  return page.evaluate(() => {
    const toggle = document.querySelector(".credits-toggle");
    return toggle ? toggle.getAttribute("aria-expanded") : null;
  });
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
  // 起動待ち: 最大30回・各500ミリ秒間隔でプレビューサーバの起動完了を待つ。
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

  // 1. クレジットの開閉ボタンが存在し、初期は閉じている。
  await page.waitForSelector(".credits-toggle", { timeout: 5000 });
  if ((await isPanelHidden(page)) !== true) {
    fail("初期状態で一覧が閉じていません");
  } else if ((await ariaExpanded(page)) !== "false") {
    fail("初期状態の aria-expanded が false ではありません");
  } else {
    console.log("確認: 開閉ボタンが存在し、初期は閉じている");
  }

  // 2. 重なり順の確認: 開閉ボタンの算出後の重なり順が、覆い（.overlay）の算出後の重なり順より大きい。
  //    覆いが出ている間も到達できることを、覆いの表示状態に依らず決定的に確かめる。
  const zOrder = await page.evaluate(() => {
    const toggle = document.querySelector(".credits-toggle");
    const overlay = document.querySelector(".overlay");
    const read = (el) => (el ? Number.parseInt(getComputedStyle(el).zIndex, 10) : Number.NaN);
    return { toggle: read(toggle), overlay: read(overlay) };
  });
  if (!(zOrder.toggle > zOrder.overlay)) {
    fail(`開閉ボタンの重なり順(${zOrder.toggle})が覆い(${zOrder.overlay})より上ではありません`);
  } else {
    console.log(`確認: 開閉ボタン(${zOrder.toggle}) > 覆い(${zOrder.overlay})`);
  }

  // 3. クリックで一覧が見え、aria-expanded が true になる。
  await page.click(".credits-toggle");
  if ((await isPanelHidden(page)) !== false) {
    fail("開閉ボタンを押しても一覧が表示されません");
  } else if ((await ariaExpanded(page)) !== "true") {
    fail("一覧を開いても aria-expanded が true になりません");
  } else {
    console.log("確認: 開閉ボタンで一覧が表示され、aria-expanded が true になる");
  }

  // 4. 一覧の本文に規定文言が漏れなく含まれる。
  const panelText = await page.evaluate(() => {
    const panel = document.querySelector(".credits-panel");
    return panel ? panel.textContent || "" : "";
  });
  for (const text of REQUIRED_TEXTS) {
    if (!panelText.includes(text)) {
      fail(`一覧に「${text}」が含まれていません`);
    }
  }
  if (REQUIRED_TEXTS.every((text) => panelText.includes(text))) {
    console.log("確認: 規定文言が一覧に漏れなく含まれる");
  }

  // 5. リンクの行き先の確認: ミクのライセンス・フォント配布元・フォントライセンス本文・使用楽曲の出所。
  const hrefs = await page.evaluate(() => {
    const panel = document.querySelector(".credits-panel");
    if (!panel) return [];
    return Array.from(panel.querySelectorAll("a.credits-panel__link")).map((a) => a.href);
  });
  if (!hrefs.includes(PCL_LICENSE_URL)) {
    fail(`ミクのライセンスのアドレス(${PCL_LICENSE_URL})のリンクがありません`);
  }
  if (!hrefs.includes(FONT_SOURCE_URL)) {
    fail(`フォントの配布元のアドレス(${FONT_SOURCE_URL})のリンクがありません`);
  }
  // ライセンス本文はルート相対のため、リンクの行き先は配信元を前置した絶対アドレスになる。末尾で確かめる。
  if (!hrefs.some((href) => href.endsWith(FONT_LICENSE_FILE_PATH))) {
    fail(`フォントのライセンス本文(${FONT_LICENSE_FILE_PATH})のリンクがありません`);
  }
  if (!hrefs.some((href) => SONG_URL_PATTERN.test(href))) {
    fail(`使用楽曲の出所の完全なアドレス（${SONG_URL_PATTERN}）のリンクがありません`);
  }
  if (
    hrefs.includes(PCL_LICENSE_URL) &&
    hrefs.includes(FONT_SOURCE_URL) &&
    hrefs.some((href) => href.endsWith(FONT_LICENSE_FILE_PATH)) &&
    hrefs.some((href) => SONG_URL_PATTERN.test(href))
  ) {
    console.log("確認: ミクのライセンス・フォント配布元・フォントライセンス本文・使用楽曲の出所のリンクがある");
  }

  // 6. 閉じるボタンで一覧が隠れ、aria-expanded が false になる。
  await page.click(".credits-panel__close");
  if ((await isPanelHidden(page)) !== true) {
    fail("閉じるボタンで一覧が隠れません");
  } else if ((await ariaExpanded(page)) !== "false") {
    fail("閉じても aria-expanded が false になりません");
  } else {
    console.log("確認: 閉じるボタンで一覧が隠れ、aria-expanded が false になる");
  }

  // 7. もう一度開いてから Esc キーでも一覧が隠れる。
  await page.click(".credits-toggle");
  if ((await isPanelHidden(page)) !== false) {
    fail("再度の開閉ボタンで一覧が表示されません");
  }
  await page.keyboard.press("Escape");
  if ((await isPanelHidden(page)) !== true) {
    fail("Escキーで一覧が隠れません");
  } else {
    console.log("確認: Escキーでも一覧が隠れる");
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
  console.error("クレジット表示スモークテスト: 失敗");
  process.exit(1);
} else {
  console.log("クレジット表示スモークテスト: 成功");
}
