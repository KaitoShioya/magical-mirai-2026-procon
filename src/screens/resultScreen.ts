// 結果画面（撮影モードの最小版）。本Issueでは最小プレースホルダに留める。
// 「タイトルに戻る」で再挑戦状態を経て題名へ戻る。
// 成果物の表示・カメラ操作・画像書出は後続Issue（M2・#71）で追加する。

import type { Screen, ScreenContext, ScreenFactory } from "./types";

export const createResultScreen: ScreenFactory = (context: ScreenContext): Screen => {
  const element = document.createElement("section");
  element.className = "screen screen--result";
  element.dataset.screen = "result";

  const heading = document.createElement("h1");
  heading.className = "screen__title";
  heading.textContent = "結果";

  const note = document.createElement("p");
  note.className = "screen__text";
  note.textContent = "成果物の表示と撮影モードは後続の実装で追加します。";

  const returnButton = document.createElement("button");
  returnButton.className = "screen__button";
  returnButton.type = "button";
  returnButton.dataset.action = "return-title";
  returnButton.textContent = "タイトルに戻る";

  element.append(heading, note, returnButton);

  const onReturnTitle = (): void => {
    context.requestTransition("retry");
  };

  return {
    element,
    onEnter(): void {
      returnButton.addEventListener("click", onReturnTitle);
    },
    onUpdate(): void {
      // 結果画面は時間進行を持たない。
    },
    onExit(): void {
      returnButton.removeEventListener("click", onReturnTitle);
    },
  };
};
