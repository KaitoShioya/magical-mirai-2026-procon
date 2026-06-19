// プレイ画面。本Issueでは最小プレースホルダに留める（本編の判定・描画は後続Issue）。
// プレイ→結果は統括（src/app）が楽曲終了を検知して起こす。本画面は遷移を要求しない。

import type { Screen, ScreenFactory } from "./types";

export const createPlayScreen: ScreenFactory = (): Screen => {
  const element = document.createElement("section");
  element.className = "screen screen--play";
  element.dataset.screen = "play";

  const heading = document.createElement("h1");
  heading.className = "screen__title";
  heading.textContent = "プレイ";

  const note = document.createElement("p");
  note.className = "screen__text";
  note.textContent = "本編の演出・操作・採点は後続の実装で追加します。";

  element.append(heading, note);

  return {
    element,
    onEnter(): void {
      // 本Issueのプレイ画面は固有の操作を持たない（楽曲再生と終了検知は統括が担う）。
    },
    onUpdate(): void {
      // 本Issueのプレイ画面は時間進行を持たない。
    },
    onExit(): void {
      // 固有の後始末はない。
    },
  };
};
