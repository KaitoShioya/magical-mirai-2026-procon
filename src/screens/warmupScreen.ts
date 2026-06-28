// ウォームアップ画面。固定尺・自動進行。導入演出の後にカウントイン（3-2-1）を表示し、
// 完了でプレイへ自動遷移する（concept-final.md §14）。利用者の操作を必要としない。

import {
  WARMUP_COUNTDOWN_STEP_MS,
  WARMUP_COUNTDOWN_STEPS,
  WARMUP_INTRO_DURATION_MS,
  WARMUP_TOTAL_DURATION_MS,
} from "./constants";
import type { Screen, ScreenContext, ScreenFactory } from "./types";

export const createWarmupScreen: ScreenFactory = (context: ScreenContext): Screen => {
  const element = document.createElement("section");
  element.className = "screen screen--warmup";
  element.dataset.screen = "warmup";

  // 見出し（「ウォームアップ」）や導入文言（「まもなく開始」）は置かない。カウントダウンの数字だけで導入を示す
  // （本タスクのユーザー決定）。湖が暗から現れる導入とソナーの波紋は src/style.css の .screen--warmup が描く。
  const countdown = document.createElement("p");
  countdown.className = "screen__countdown";

  element.append(countdown);

  let elapsedMs = 0;
  let requested = false;

  // 経過時間からカウントインの表示を決める。
  // 導入演出の間は何も表示せず、その後はカウントインの残り段数（3→2→1）を表示する。
  function render(): void {
    if (elapsedMs < WARMUP_INTRO_DURATION_MS) {
      countdown.textContent = "";
      return;
    }
    const stepIndex = Math.floor((elapsedMs - WARMUP_INTRO_DURATION_MS) / WARMUP_COUNTDOWN_STEP_MS);
    const remaining = WARMUP_COUNTDOWN_STEPS - stepIndex;
    countdown.textContent = remaining > 0 ? String(remaining) : "";
  }

  return {
    element,
    onEnter(): void {
      render();
    },
    onUpdate(deltaMs: number): void {
      elapsedMs += deltaMs;
      render();
      if (!requested && elapsedMs >= WARMUP_TOTAL_DURATION_MS) {
        requested = true;
        context.requestTransition("play");
      }
    },
    onExit(): void {
      // 文書要素は機械が除去する。固有の後始末はない。
    },
  };
};
