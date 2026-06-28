// プレイ中の一時停止の表示と操作（Issue #112）。純粋な状態機械 pauseState を包み、一時停止ボタン・停止中の覆い・
// 再開ボタン・カウントインの数字の表示生成と更新を担う。画面状態は増やさず、覆いは画面状態機械の外で、既存の覆い
// （src/app/overlay.ts の読込・エラー・「触れて再生」と同じ作法）として取り付け先（既定は document.body）の直下へ置く。
//
// 取り付け先を引数で受ける理由を先に述べる。既存の createOverlays(host = document.body) と同じく、単体検証で
// 取り付け先を差し替えられるようにし、検証後に取り除いて取り付け先へ要素が残らないようにするためである。

import { createPauseState, type PauseStateDeps } from "./pauseState";

/** 一時停止の表示と操作の外部契約。 */
export interface PauseController {
  /** プレイ進行の開始・終了で一時停止ボタンの表示可否を切り替える。 */
  setPlayPhase(active: boolean): void;
  /** 利用者操作またはタブ離脱で一時停止する。 */
  pause(): void;
  /** タブ復帰または「再開」操作でカウントインを最初から開始する。 */
  beginResumeCountIn(): void;
  /** 毎フレーム呼ぶ。カウントインの実時間進行を進め、表示を更新する。 */
  tick(realDeltaMs: number): void;
  /** プレイ進行の更新と「触れて再生」表示を止めるべきか。停止中またはカウントイン中で真。 */
  isHalted(): boolean;
  /** 後始末。生成した表示要素を取り付け先から取り除く。 */
  dispose(): void;
}

/** 副作用の出口。楽曲再生の停止・再開と入力の有効無効を注入で受け取る。 */
export type PauseControllerDeps = PauseStateDeps;

export function createPauseController(
  deps: PauseControllerDeps,
  host: HTMLElement = document.body
): PauseController {
  const state = createPauseState(deps);

  // 一時停止ボタン。実行中だけ出す。初期は隠す。
  const pauseButton = document.createElement("button");
  pauseButton.type = "button";
  pauseButton.className = "pause-button";
  pauseButton.textContent = "一時停止";
  pauseButton.setAttribute("aria-label", "一時停止する");
  pauseButton.hidden = true;

  // 停止中・カウントイン中の覆い。初期は隠す。
  const overlay = document.createElement("div");
  overlay.className = "pause-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-label", "一時停止");
  overlay.hidden = true;

  const message = document.createElement("p");
  message.className = "pause-overlay__message";
  message.textContent = "一時停止中";

  // カウントインの残り段数（3→2→1）。カウントイン中だけ出す。
  const countdown = document.createElement("p");
  countdown.className = "pause-overlay__countdown";

  const resumeButton = document.createElement("button");
  resumeButton.type = "button";
  resumeButton.className = "pause-overlay__resume";
  resumeButton.textContent = "再開";
  resumeButton.setAttribute("aria-label", "再開する");

  overlay.append(message, countdown, resumeButton);
  host.append(pauseButton, overlay);

  // 状態の見え方を表示へ反映する。実行中は覆いを隠し一時停止ボタンを（プレイ中だけ）出す。停止中は停止中表示と再開ボタンを、
  // カウントイン中は残り段数の数字を出す。
  function render(): void {
    const view = state.view();
    pauseButton.hidden = !(view.playPhaseActive && view.phase === "running");
    overlay.hidden = view.phase === "running";
    const counting = view.phase === "countingIn";
    message.hidden = counting;
    resumeButton.hidden = counting;
    countdown.hidden = !counting;
    countdown.textContent = counting ? String(view.countdownRemaining) : "";
  }

  const onPauseClick = (): void => {
    state.pause();
    render();
  };
  const onResumeClick = (): void => {
    state.beginResumeCountIn();
    render();
  };

  pauseButton.addEventListener("click", onPauseClick);
  resumeButton.addEventListener("click", onResumeClick);

  render();

  return {
    setPlayPhase(active: boolean): void {
      state.setPlayPhase(active);
      render();
    },
    pause(): void {
      state.pause();
      render();
    },
    beginResumeCountIn(): void {
      state.beginResumeCountIn();
      render();
    },
    tick(realDeltaMs: number): void {
      state.tick(realDeltaMs);
      render();
    },
    isHalted(): boolean {
      return state.isHalted();
    },
    dispose(): void {
      pauseButton.removeEventListener("click", onPauseClick);
      resumeButton.removeEventListener("click", onResumeClick);
      pauseButton.remove();
      overlay.remove();
    },
  };
}
