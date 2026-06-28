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
  /** タブ離脱など自動の契機で一時停止する（タブ復帰で自動的に再開してよい停止）。利用者操作による停止は一時停止ボタンが担う。 */
  pause(): void;
  /** タブ復帰でカウントインを最初から開始する。ただし自動の停止で停止中のときだけ行い、手動で停止中なら何もしない。 */
  beginResumeCountIn(): void;
  /** 毎フレーム呼ぶ。カウントインの実時間進行を進め、表示を更新する。 */
  tick(realDeltaMs: number): void;
  /** プレイ進行の更新と「触れて再生」表示を止めるべきか。停止中またはカウントイン中で真。 */
  isHalted(): boolean;
  /** 後始末。生成した表示要素を取り付け先から取り除く。 */
  dispose(): void;
}

/** 副作用の出口。楽曲再生の停止・再開と入力の有効無効に加え、一時停止からの中断（題名へ戻す）を注入で受け取る。 */
export interface PauseControllerDeps extends PauseStateDeps {
  /** 一時停止からプレイを中断して題名へ戻す（覆いの「トップに戻る」が呼ぶ）。 */
  returnToTitle(): void;
}

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
  resumeButton.className = "pause-overlay__resume ui-button--primary";
  resumeButton.textContent = "再開";
  resumeButton.setAttribute("aria-label", "再開する");

  // プレイを中断して題名へ戻すボタン。停止中だけ出す（再開ボタンと同じ局面）。
  const returnButton = document.createElement("button");
  returnButton.type = "button";
  returnButton.className = "pause-overlay__return ui-button--secondary";
  returnButton.textContent = "トップに戻る";
  returnButton.setAttribute("aria-label", "トップ（題名）に戻る");

  overlay.append(message, countdown, resumeButton, returnButton);
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
    returnButton.hidden = counting;
    countdown.hidden = !counting;
    countdown.textContent = counting ? String(view.countdownRemaining) : "";
  }

  // 一時停止ボタンは利用者の操作による停止（automatic=false）。利用者が再開を指示するまで停止を保つ。
  const onPauseClick = (): void => {
    state.pause(false);
    render();
  };
  // 覆いの「再開」ボタンは利用者の明示の再開のため、常にカウントインを開始する。
  const onResumeClick = (): void => {
    state.beginResumeCountIn();
    render();
  };
  // 覆いの「トップに戻る」ボタンは、プレイを中断して題名へ戻す。中断の後始末（プレイ局面の解除・覆いの非表示）は
  // 統括が returnToTitle の中で setPlayPhase(false) を呼んで行うため、ここでは中断を依頼するだけにする。
  const onReturnClick = (): void => {
    deps.returnToTitle();
  };

  pauseButton.addEventListener("click", onPauseClick);
  resumeButton.addEventListener("click", onResumeClick);
  returnButton.addEventListener("click", onReturnClick);

  render();

  return {
    setPlayPhase(active: boolean): void {
      state.setPlayPhase(active);
      render();
    },
    pause(): void {
      // タブ離脱など自動の停止（automatic=true）。タブ復帰で自動的に再開してよい。
      state.pause(true);
      render();
    },
    beginResumeCountIn(): void {
      // タブ復帰の自動再開は、自動の停止で停止中のときだけ行う。利用者が手動で停止したまま離脱・復帰した場合は
      // 勝手に再開せず停止を保つ（利用者は覆いの「再開」ボタンで再開する）。
      if (state.shouldAutoResume()) {
        state.beginResumeCountIn();
        render();
      }
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
      returnButton.removeEventListener("click", onReturnClick);
      pauseButton.remove();
      overlay.remove();
    },
  };
}
