// 題名画面。既定曲名の表示と「はじめる」ボタンを持つ最小プレースホルダ。
// 「はじめる」でウォームアップへ進む。曲選択UIと未実装曲の無効化は Issue #5 で追加する。

import type { Screen, ScreenContext, ScreenFactory } from "./types";

export const createTitleScreen: ScreenFactory = (context: ScreenContext): Screen => {
  const element = document.createElement("section");
  element.className = "screen screen--title";
  element.dataset.screen = "title";

  const heading = document.createElement("h1");
  heading.className = "screen__title";
  heading.textContent = "マジカルミライ2026 リリックアプリ";

  const songLine = document.createElement("p");
  songLine.className = "screen__text";
  songLine.textContent = `課題曲: ${context.songTitle}`;

  const startButton = document.createElement("button");
  startButton.className = "screen__button";
  startButton.type = "button";
  startButton.dataset.action = "start";
  startButton.textContent = "はじめる";

  element.append(heading, songLine, startButton);

  const onStart = (): void => {
    context.requestTransition("warmup");
  };

  return {
    element,
    onEnter(): void {
      startButton.addEventListener("click", onStart);
    },
    onUpdate(): void {
      // 題名画面は時間進行を持たない。
    },
    onExit(): void {
      startButton.removeEventListener("click", onStart);
    },
  };
};
