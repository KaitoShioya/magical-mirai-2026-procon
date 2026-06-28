import { describe, it, expect, vi } from "vitest";
import { createPauseState } from "./pauseState";
import { WARMUP_COUNTDOWN_STEP_MS, WARMUP_COUNTDOWN_STEPS } from "../screens/constants";

// カウントインの全体尺。状態モジュールと同じ「1段あたり時間 × 段数」で求め、テストの待ち時間の基準にする。
const COUNT_IN_TOTAL_MS = WARMUP_COUNTDOWN_STEP_MS * WARMUP_COUNTDOWN_STEPS;

function makeDeps() {
  return {
    pausePlayback: vi.fn(),
    resumePlayback: vi.fn(),
    setInputActive: vi.fn(),
  };
}

describe("createPauseState", () => {
  it("(a) pause で楽曲を止め入力を無効化し、停止状態になる", () => {
    const deps = makeDeps();
    const state = createPauseState(deps);

    state.pause(false);

    expect(deps.pausePlayback).toHaveBeenCalledTimes(1);
    expect(deps.setInputActive).toHaveBeenCalledTimes(1);
    expect(deps.setInputActive).toHaveBeenLastCalledWith(false);
    expect(state.isHalted()).toBe(true);
    expect(state.view().phase).toBe("paused");
  });

  it("(b) 再開のカウントインは全体尺に達して初めて楽曲を戻し入力を有効化する", () => {
    const deps = makeDeps();
    const state = createPauseState(deps);

    state.pause(false);
    state.beginResumeCountIn();

    state.tick(COUNT_IN_TOTAL_MS - 1);
    expect(deps.resumePlayback).not.toHaveBeenCalled();
    expect(state.isHalted()).toBe(true);
    expect(state.view().phase).toBe("countingIn");

    state.tick(1);
    expect(deps.resumePlayback).toHaveBeenCalledTimes(1);
    expect(deps.setInputActive).toHaveBeenLastCalledWith(true);
    expect(state.isHalted()).toBe(false);
    expect(state.view().phase).toBe("running");
  });

  it("(c) 実行中の beginResumeCountIn は何もしない", () => {
    const deps = makeDeps();
    const state = createPauseState(deps);

    state.beginResumeCountIn();
    state.tick(COUNT_IN_TOTAL_MS);

    expect(deps.resumePlayback).not.toHaveBeenCalled();
    expect(state.view().phase).toBe("running");
  });

  it("(d) 連続 pause は冪等（楽曲停止・入力無効を増やさない）", () => {
    const deps = makeDeps();
    const state = createPauseState(deps);

    state.pause(false);
    state.pause(false);
    state.pause(false);

    expect(deps.pausePlayback).toHaveBeenCalledTimes(1);
    expect(deps.setInputActive).toHaveBeenCalledTimes(1);
  });

  it("(e) カウントイン中の pause は累積を0へ戻し、再開は3から数え直す（タブ復帰のやり直し）", () => {
    const deps = makeDeps();
    const state = createPauseState(deps);

    state.pause(true);
    state.beginResumeCountIn();
    state.tick(COUNT_IN_TOTAL_MS - 1); // あと1ミリ秒で完了する手前まで進める

    state.pause(true); // タブ離脱で停止へ戻す
    expect(state.isHalted()).toBe(true);
    expect(state.view().phase).toBe("paused");

    state.beginResumeCountIn();
    state.tick(COUNT_IN_TOTAL_MS - 1); // 直前の進みが残っていれば完了するはずの量
    expect(deps.resumePlayback).not.toHaveBeenCalled(); // やり直しのため未完了

    state.tick(1); // 合計で全体尺に達する
    expect(deps.resumePlayback).toHaveBeenCalledTimes(1);
  });

  it("自動の停止（automatic=true）は shouldAutoResume が真、手動の停止（false）は偽", () => {
    const autoState = createPauseState(makeDeps());
    autoState.pause(true);
    expect(autoState.shouldAutoResume()).toBe(true);

    const manualState = createPauseState(makeDeps());
    manualState.pause(false);
    expect(manualState.shouldAutoResume()).toBe(false);
  });

  it("手動停止のままタブ離脱（自動停止の再呼び出し）が来ても、最初の手動の契機を保ち自動再開しない", () => {
    const state = createPauseState(makeDeps());

    state.pause(false); // 利用者が手動で停止
    state.pause(true); // タブ離脱の自動停止が来る（停止中のため冪等で契機は変えない）

    expect(state.shouldAutoResume()).toBe(false);
  });

  it("実行中は shouldAutoResume が偽", () => {
    const state = createPauseState(makeDeps());
    expect(state.shouldAutoResume()).toBe(false);
  });

  it("カウントインの残り段数は3から1へ減る", () => {
    const deps = makeDeps();
    const state = createPauseState(deps);

    state.pause(false);
    state.beginResumeCountIn();
    expect(state.view().countdownRemaining).toBe(WARMUP_COUNTDOWN_STEPS);

    state.tick(WARMUP_COUNTDOWN_STEP_MS);
    expect(state.view().countdownRemaining).toBe(WARMUP_COUNTDOWN_STEPS - 1);

    state.tick(WARMUP_COUNTDOWN_STEP_MS);
    expect(state.view().countdownRemaining).toBe(WARMUP_COUNTDOWN_STEPS - 2);
  });

  it("setPlayPhase(false) で一時停止の状態を持ち越さない", () => {
    const deps = makeDeps();
    const state = createPauseState(deps);

    state.pause(false);
    state.setPlayPhase(false);

    expect(state.isHalted()).toBe(false);
    expect(state.view().phase).toBe("running");
    expect(state.view().playPhaseActive).toBe(false);
  });
});
