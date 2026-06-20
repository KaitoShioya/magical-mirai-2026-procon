// 常時到達できる開閉式のクレジット表示。素材全体の出典をアプリ内に常設する（Issue #82）。
// 画面状態ではないため src/screens に置かず、状態機械が置換する画面表示領域の影響を受けないよう
// document.body 直下に置く（既存の src/app/attribution.ts・src/app/overlay.ts と同じ作法）。
// 後続の設定・クレジット画面（Issue #77）が、この集約データと表示を取り込んで SE 消音切替や較正を足す。

import type { CreditRegistry, FontCredit, SongCredit } from "../../types/credits";
import type { CharacterCredit } from "../../types/character";

export interface CreditsView {
  /** 後始末。生成した表示要素と取り付けた監視を取り除く。 */
  dispose(): void;
}

/** 文言の段落を作る。 */
function textRow(text: string): HTMLParagraphElement {
  const row = document.createElement("p");
  row.className = "credits-panel__text";
  row.textContent = text;
  return row;
}

/** 新しいタブで開く安全なリンクの段落を作る。文言と行き先を受け取る。 */
function linkRow(label: string, href: string): HTMLParagraphElement {
  const row = document.createElement("p");
  row.className = "credits-panel__text";
  const link = document.createElement("a");
  link.className = "credits-panel__link";
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = label;
  row.append(link);
  return row;
}

/** 節（見出し＋本文）を作る。 */
function section(heading: string, rows: readonly HTMLElement[]): HTMLElement {
  const group = document.createElement("section");
  group.className = "credits-panel__section";
  const title = document.createElement("h2");
  title.className = "credits-panel__heading";
  title.textContent = heading;
  group.append(title, ...rows);
  return group;
}

function characterSection(credit: CharacterCredit): HTMLElement {
  return section("初音ミク", [
    textRow(credit.subject),
    textRow(credit.rightsHolder),
    linkRow(credit.licenseName, credit.licenseUrl),
    textRow(credit.guidelineNote),
  ]);
}

function fontSection(fonts: readonly FontCredit[]): HTMLElement {
  const rows: HTMLElement[] = [];
  for (const font of fonts) {
    rows.push(textRow(`${font.fontName}（作者 ${font.author}）`));
    rows.push(linkRow(`配布元: ${font.sourceLabel}`, font.sourceUrl));
    rows.push(linkRow(`ライセンス: ${font.license}`, font.licenseFileUrl));
  }
  return section("フォント", rows);
}

function songSection(songs: readonly SongCredit[]): HTMLElement {
  const rows: HTMLElement[] = [];
  for (const song of songs) {
    rows.push(textRow(`${song.title}（作者 ${song.artist}）`));
    rows.push(linkRow(song.sourceUrl, song.sourceUrl));
  }
  return section("楽曲・歌詞", rows);
}

/**
 * クレジット表示を生成して host（既定は document.body）へ取り付ける。
 * 小さな開閉ボタンと、初期は隠した一覧を作り、ボタンで開閉する。
 * 開閉ボタンは常に操作を受け取り、一覧は開いている時だけ操作を受け取る。
 */
export function createCreditsView(
  registry: CreditRegistry,
  host: HTMLElement = document.body
): CreditsView {
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "credits-toggle";
  toggle.textContent = "クレジット";
  toggle.setAttribute("aria-haspopup", "dialog");
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-label", "クレジットを開く");

  const panel = document.createElement("div");
  panel.className = "credits-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "クレジット");
  panel.hidden = true;

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "credits-panel__close";
  closeButton.textContent = "閉じる";
  closeButton.setAttribute("aria-label", "クレジットを閉じる");

  panel.append(
    closeButton,
    characterSection(registry.character),
    fontSection(registry.fonts),
    songSection(registry.songs),
    section("AI生成物について", [textRow(registry.provenance)])
  );

  function open(): void {
    panel.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    closeButton.focus();
  }

  function close(): void {
    panel.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    toggle.focus();
  }

  const onToggleClick = (): void => {
    if (panel.hidden) {
      open();
    } else {
      close();
    }
  };
  const onCloseClick = (): void => {
    close();
  };
  // Escキーは、開いている間だけ閉じる。閉じている間はゲームの操作を妨げない。
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && !panel.hidden) {
      close();
    }
  };

  toggle.addEventListener("click", onToggleClick);
  closeButton.addEventListener("click", onCloseClick);
  document.addEventListener("keydown", onKeyDown);

  host.append(toggle, panel);

  return {
    dispose(): void {
      toggle.removeEventListener("click", onToggleClick);
      closeButton.removeEventListener("click", onCloseClick);
      document.removeEventListener("keydown", onKeyDown);
      toggle.remove();
      panel.remove();
    },
  };
}
