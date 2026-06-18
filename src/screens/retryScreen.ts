// 再挑戦画面。後始末用の遷移状態。進入後の最初の onUpdate で題名へ自動遷移する。
// 進入時（onEnter）には遷移を要求しない。これにより、結果→再挑戦はボタン押下が起動する反映処理で、
// 再挑戦→題名は次フレームの onUpdate が起動する別の反映処理で消化する（同一の反映処理ではない）。
// 利用者には一瞬で題名へ戻るように見える。正典が要求する5状態を保つために独立した状態とする。

import type { Screen, ScreenContext, ScreenFactory } from "./types";

export const createRetryScreen: ScreenFactory = (context: ScreenContext): Screen => {
  const element = document.createElement("section");
  element.className = "screen screen--retry";
  element.dataset.screen = "retry";

  const note = document.createElement("p");
  note.className = "screen__text";
  note.textContent = "タイトルへ戻ります";

  element.append(note);

  let requested = false;

  return {
    element,
    onEnter(): void {
      // 後始末のみ。遷移要求は最初の onUpdate で行う。
    },
    onUpdate(): void {
      if (!requested) {
        requested = true;
        context.requestTransition("title");
      }
    },
    onExit(): void {
      // 文書要素は機械が除去する。固有の後始末はない。
    },
  };
};
