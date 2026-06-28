// 一時停止の状態と時間進行（Issue #112）の純粋な部分。表示生成（document）を持たないため node 環境で決定的に
// 単体検証できる。表示生成・取り付けは pauseController.ts が本モジュールを包んで担う。
//
// 3つの局面を持つ。実行中（running）・停止中（paused）・カウントイン中（countingIn）。
// 一時停止すると楽曲再生を止め入力を無効化する。再開はカウントイン（3-2-1）を実時間で進め、完了で楽曲再生を戻し
// 入力を有効化する。一時停止中・カウントイン中はゲームの時計が止まる（楽曲が止まる）ため、判定・採点・カメラ・画面揺れも
// 自動的に止まる。統括はさらに isHalted() が真の間それらの更新を呼ばないことで二重に止める。

import { WARMUP_COUNTDOWN_STEP_MS, WARMUP_COUNTDOWN_STEPS } from "../screens/constants";

/** 一時停止の局面。 */
export type PausePhase = "running" | "paused" | "countingIn";

/** 副作用の出口。楽曲再生の停止・再開と入力の有効無効を注入で受け取り、検証で擬装に差し替える。 */
export interface PauseStateDeps {
  /** 楽曲再生を止める。 */
  pausePlayback(): void;
  /** 楽曲再生を再開する。 */
  resumePlayback(): void;
  /** 入力の有効・無効を切り替える（停止中・カウントイン中は無効）。 */
  setInputActive(active: boolean): void;
}

/** 表示層が読む現在の見え方。 */
export interface PauseStateView {
  /** 現在の局面。 */
  phase: PausePhase;
  /** プレイ進行中か（一時停止ボタンを出してよい局面か）。 */
  playPhaseActive: boolean;
  /** カウントインの残り段数（3→2→1）。カウントイン中以外は0。 */
  countdownRemaining: number;
}

/** 一時停止の状態機械の外部契約。 */
export interface PauseState {
  /** プレイ進行の開始・終了で切り替える。終了（偽）にすると実行中へ戻し累積を0にする。 */
  setPlayPhase(active: boolean): void;
  /**
   * 一時停止する。実行中・カウントイン中のどちらからでも停止中へ移し累積を0へ戻す。停止中の再呼び出しは無作用。
   * automatic は停止の契機を表す。true はタブ離脱など自動の停止で、タブ復帰で自動的に再開（カウントイン）してよい。
   * false は利用者の操作による停止で、利用者が再開を指示するまで停止を保つ。停止中の再呼び出しでは最初の契機を保つ。
   */
  pause(automatic: boolean): void;
  /** タブ復帰で自動的に再開してよいか。自動の停止（automatic=true）で停止中のときだけ真。 */
  shouldAutoResume(): boolean;
  /** 停止中からカウントインを最初（3）から開始する。停止中以外では何もしない。 */
  beginResumeCountIn(): void;
  /** 毎フレーム呼ぶ。カウントイン中だけ実経過を累積し、全体尺に達したら楽曲再生を戻し入力を有効化する。 */
  tick(realDeltaMs: number): void;
  /** プレイ進行の更新と「触れて再生」表示を止めるべきか。停止中またはカウントイン中で真。 */
  isHalted(): boolean;
  /** 表示層が読む現在の見え方。 */
  view(): PauseStateView;
}

// カウントインの全体尺（ミリ秒）。採用理由を先に述べる。仕様（docs/decisions/app-overall-decisions.md §3.11）が
// ウォームアップと「同じ3-2-1表現を流用」と定めるため、ウォームアップのカウントインと同じ「1段あたり時間 × 段数」を用いる。
const COUNT_IN_TOTAL_MS = WARMUP_COUNTDOWN_STEP_MS * WARMUP_COUNTDOWN_STEPS;

export function createPauseState(deps: PauseStateDeps): PauseState {
  let phase: PausePhase = "running";
  let accumulatedMs = 0;
  let playPhaseActive = false;
  // 停止の契機がタブ復帰で自動再開してよい自動の停止か。停止へ移るときに記録し、タブ復帰の自動再開の可否に使う。
  let resumeAutomatically = false;

  function isHalted(): boolean {
    return phase === "paused" || phase === "countingIn";
  }

  return {
    setPlayPhase(active: boolean): void {
      playPhaseActive = active;
      if (!active) {
        // プレイを抜けるときは一時停止の状態を持ち越さない。停止の契機も初期化して、次のプレイへ古い値を残さない。
        phase = "running";
        accumulatedMs = 0;
        resumeAutomatically = false;
      }
    },

    pause(automatic: boolean): void {
      if (phase === "paused") {
        return;
      }
      phase = "paused";
      accumulatedMs = 0;
      resumeAutomatically = automatic;
      deps.pausePlayback();
      deps.setInputActive(false);
    },

    shouldAutoResume(): boolean {
      return phase === "paused" && resumeAutomatically;
    },

    beginResumeCountIn(): void {
      if (phase !== "paused") {
        return;
      }
      phase = "countingIn";
      accumulatedMs = 0;
    },

    tick(realDeltaMs: number): void {
      if (phase !== "countingIn") {
        return;
      }
      accumulatedMs += realDeltaMs;
      if (accumulatedMs >= COUNT_IN_TOTAL_MS) {
        phase = "running";
        accumulatedMs = 0;
        // 実行中へ戻るため、停止の契機を初期化する（次の停止までは判定に使わない値だが、古い値を残さない）。
        resumeAutomatically = false;
        deps.resumePlayback();
        deps.setInputActive(true);
      }
    },

    isHalted,

    view(): PauseStateView {
      // 残り段数はウォームアップ画面と同じ式（段数 − floor(累積 / 1段あたり時間)）で求める。カウントイン中以外は0。
      const countdownRemaining =
        phase === "countingIn"
          ? WARMUP_COUNTDOWN_STEPS - Math.floor(accumulatedMs / WARMUP_COUNTDOWN_STEP_MS)
          : 0;
      return { phase, playPhaseActive, countdownRemaining };
    },
  };
}
