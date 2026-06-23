// 結果画面（撮影モードの最小版）。本Issueでは最小プレースホルダに留める。
// 「タイトルに戻る」で再挑戦状態を経て題名へ戻る。
// 成果物の表示・カメラ操作・画像書出は後続Issue（M2・#71）で追加する。
// 百分位が作品内推定（固定分布）で実際のオンライン順位ではない旨（Issue #66）を本画面に明記する。文言は得点ロジックを持つ
// scoring が所有する表示用定数 PERCENTILE_ESTIMATE_DISCLAIMER を取り込む（論理ではなく文言の取り込みのため src/screens/README.md の依存規則に整合）。

import type { Screen, ScreenContext, ScreenFactory } from "./types";
import { PERCENTILE_ESTIMATE_DISCLAIMER } from "../scoring";

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

  // 百分位の注意文言（Issue #66）。後続の結果画面（Issue #74）へ引き継ぐため、最小版でもここに表示する。
  const disclaimer = document.createElement("p");
  disclaimer.className = "screen__text";
  disclaimer.dataset.role = "percentile-disclaimer";
  disclaimer.textContent = PERCENTILE_ESTIMATE_DISCLAIMER;

  const returnButton = document.createElement("button");
  returnButton.className = "screen__button";
  returnButton.type = "button";
  returnButton.dataset.action = "return-title";
  returnButton.textContent = "タイトルに戻る";

  element.append(heading, note, disclaimer, returnButton);

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
