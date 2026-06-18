// プレイ画面。本Issueでは最小プレースホルダに留める（本編の判定・描画は後続Issue）。
// 暫定の「結果へ」ボタンで結果へ進む。このボタンは Issue #4 で TextAlive の楽曲終了検知に置き換える。

import type { Screen, ScreenContext, ScreenFactory } from "./types";

export const createPlayScreen: ScreenFactory = (context: ScreenContext): Screen => {
  const element = document.createElement("section");
  element.className = "screen screen--play";
  element.dataset.screen = "play";

  const heading = document.createElement("h1");
  heading.className = "screen__title";
  heading.textContent = "プレイ";

  const note = document.createElement("p");
  note.className = "screen__text";
  note.textContent = "本編の演出・操作・採点は後続の実装で追加します。";

  // 暫定ボタン。Issue #4 で楽曲終了の自動検知に置き換える。
  const toResultButton = document.createElement("button");
  toResultButton.className = "screen__button";
  toResultButton.type = "button";
  toResultButton.dataset.action = "show-result";
  toResultButton.textContent = "結果へ（暫定）";

  element.append(heading, note, toResultButton);

  const onShowResult = (): void => {
    context.requestTransition("result");
  };

  return {
    element,
    onEnter(): void {
      toResultButton.addEventListener("click", onShowResult);
    },
    onUpdate(): void {
      // 本Issueのプレイ画面は時間進行を持たない（楽曲再生は Issue #4）。
    },
    onExit(): void {
      toResultButton.removeEventListener("click", onShowResult);
    },
  };
};
