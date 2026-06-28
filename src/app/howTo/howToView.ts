// 「これはなに？」の常設トグルと、本作の使い方説明（世界観・操作方法・成果物）のパネル。
// 画面状態ではないため src/screens に置かず、状態機械が置換する画面表示領域の影響を受けないよう
// document.body 直下に置く（src/app/credits/creditsView.ts・src/app/overlay.ts と同じ作法）。
// 楽曲の読み込み中はトグルを隠し、読み込みが終わってから見せる（表示の切り替えは setToggleVisible が担う。
// 結線は src/app/index.ts の renderOverlays）。
//
// 使い方説明の節を組み立てる関数 createHowToSectionElements は、ロード中の覆い（src/app/overlay.ts）も
// 取り込んで同じ内容を描く（重複を作らない）。

import { HOW_TO_CONTENT, type HowToContent, type HowToSection } from "./howToContent";

/** 「これはなに？」表示の外部契約。 */
export interface HowToView {
  /** トグルの表示・非表示を切り替える。偽のときは、パネルが開いていれば閉じる。 */
  setToggleVisible(visible: boolean): void;
  /** 後始末。生成した表示要素と取り付けた監視を取り除く。 */
  dispose(): void;
}

/** 段落（本文1行）を作る。 */
function paragraphRow(text: string): HTMLParagraphElement {
  const row = document.createElement("p");
  row.className = "howto-panel__text";
  row.textContent = text;
  return row;
}

/** 1節（見出し＋本文の段落）を作る。 */
function sectionElement(section: HowToSection): HTMLElement {
  const group = document.createElement("section");
  group.className = "howto-panel__section";
  const heading = document.createElement("h2");
  heading.className = "howto-panel__heading";
  heading.textContent = section.heading;
  group.append(heading, ...section.paragraphs.map(paragraphRow));
  return group;
}

/** 使い方説明の節要素の並びを作る。ロード中の覆いと「これはなに？」パネルが共有して使う。 */
export function createHowToSectionElements(
  content: HowToContent = HOW_TO_CONTENT
): HTMLElement[] {
  return content.sections.map(sectionElement);
}

/**
 * 「これはなに？」表示を生成して host（既定は document.body）へ取り付ける。
 * 初期はトグルもパネルも隠す。setToggleVisible(true) でトグルを見せ、押下でパネルを開閉する。
 * 開閉ボタンと Esc キーで閉じる。Esc キーは開いている間だけ閉じる。
 */
export function createHowToView(
  content: HowToContent = HOW_TO_CONTENT,
  host: HTMLElement = document.body
): HowToView {
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "howto-toggle";
  toggle.textContent = "これはなに？";
  toggle.setAttribute("aria-haspopup", "dialog");
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-label", "遊び方を開く");
  // 初期は隠す。楽曲の読み込みが終わってから setToggleVisible(true) で見せる。
  toggle.hidden = true;

  const panel = document.createElement("div");
  panel.className = "howto-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", content.title);
  panel.hidden = true;

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "howto-panel__close";
  closeButton.textContent = "閉じる";
  closeButton.setAttribute("aria-label", "遊び方を閉じる");

  const title = document.createElement("h1");
  title.className = "howto-panel__title";
  title.textContent = content.title;

  panel.append(closeButton, title, ...createHowToSectionElements(content));

  function open(): void {
    panel.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    closeButton.focus();
  }

  // パネルを閉じる。focusToToggle が真のときだけトグルへ焦点を戻す（利用者がトグル・閉じる・Esc で閉じたとき）。
  // 偽のときはトグルへ焦点を戻さない（setToggleVisible(false) でトグルが隠れる・画面表示領域が操作不能になり得るため）。
  function close(focusToToggle: boolean): void {
    if (panel.hidden) {
      return;
    }
    panel.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    if (focusToToggle) {
      toggle.focus();
    }
  }

  const onToggleClick = (): void => {
    if (panel.hidden) {
      open();
    } else {
      close(true);
    }
  };
  const onCloseClick = (): void => {
    close(true);
  };
  // Esc キーは、開いている間だけ閉じる。閉じている間はゲームの操作を妨げない。
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && !panel.hidden) {
      close(true);
    }
  };

  toggle.addEventListener("click", onToggleClick);
  closeButton.addEventListener("click", onCloseClick);
  document.addEventListener("keydown", onKeyDown);

  host.append(toggle, panel);

  return {
    setToggleVisible(visible: boolean): void {
      if (visible) {
        toggle.hidden = false;
        return;
      }
      // 隠すとき、パネルが開いていれば閉じる。トグルが隠れ、また画面表示領域が操作不能（inert）になり得るため、
      // トグルにも画面表示領域にも焦点を移さない。パネル内に焦点があれば、その焦点だけを外す。
      if (!panel.hidden) {
        const active = document.activeElement;
        if (active instanceof HTMLElement && (active === closeButton || panel.contains(active))) {
          active.blur();
        }
        close(false);
      }
      toggle.hidden = true;
    },
    dispose(): void {
      toggle.removeEventListener("click", onToggleClick);
      closeButton.removeEventListener("click", onCloseClick);
      document.removeEventListener("keydown", onKeyDown);
      toggle.remove();
      panel.remove();
    },
  };
}
