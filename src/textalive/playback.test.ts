import { describe, it, expect } from "vitest";
import {
  createReadyGatedTimeSource,
  isSongEnded,
  createLoadStateMachine,
  latchStarted,
  SONG_END_MARGIN_MS,
  SONG_END_STOP_TOLERANCE_MS,
  type PlaybackState,
} from "./playback";

describe("latchStarted", () => {
  it("一度再生中を観測したら真になり、以後再生中でなくなっても真のまま", () => {
    let started = false;
    // まだ再生中を観測していないので偽のまま。
    started = latchStarted(started, false);
    expect(started).toBe(false);
    // 再生中を観測したら真になる（onPlay が発火しない「既に再生中」でも掛け金が立つ）。
    started = latchStarted(started, true);
    expect(started).toBe(true);
    // 楽曲終了で再生中でなくなっても、再生が始まったかの判定のため真のまま残す。
    started = latchStarted(started, false);
    expect(started).toBe(true);
  });
});

describe("createReadyGatedTimeSource", () => {
  it("確定判定を差し込み、再生位置と再生中を読み取り口へ委譲する", () => {
    let pos = 1234;
    let playing = true;
    let ready = false;
    const ts = createReadyGatedTimeSource(
      { positionMs: () => pos, isPlaying: () => playing },
      () => ready
    );
    expect(ts.isReady()).toBe(false);
    ready = true;
    expect(ts.isReady()).toBe(true);
    expect(ts.positionMs()).toBe(1234);
    expect(ts.isPlaying()).toBe(true);
    pos = 5000;
    playing = false;
    expect(ts.positionMs()).toBe(5000);
    expect(ts.isPlaying()).toBe(false);
  });
});

describe("isSongEnded", () => {
  const base = {
    ready: true,
    playStarted: true,
    durationMs: 200000,
    stopped: false,
    endMarginMs: SONG_END_MARGIN_MS,
    stopToleranceMs: SONG_END_STOP_TOLERANCE_MS,
  };

  it("未確定・再生未開始・楽曲長が正でないときは終了としない", () => {
    expect(isSongEnded({ ...base, ready: false, positionMs: base.durationMs })).toBe(false);
    expect(isSongEnded({ ...base, playStarted: false, positionMs: base.durationMs })).toBe(false);
    expect(isSongEnded({ ...base, durationMs: 0, positionMs: 0 })).toBe(false);
  });

  it("主条件: 再生位置が楽曲長から余白以内なら終了", () => {
    expect(isSongEnded({ ...base, positionMs: base.durationMs - SONG_END_MARGIN_MS })).toBe(true);
    expect(isSongEnded({ ...base, positionMs: base.durationMs })).toBe(true);
  });

  it("主条件: 再生位置が余白より手前なら終了としない", () => {
    expect(isSongEnded({ ...base, positionMs: base.durationMs - SONG_END_MARGIN_MS - 1 })).toBe(
      false
    );
  });

  it("補助条件: 停止イベントが楽曲長近傍で起きたら終了", () => {
    expect(
      isSongEnded({
        ...base,
        stopped: true,
        positionMs: base.durationMs - SONG_END_STOP_TOLERANCE_MS,
      })
    ).toBe(true);
  });

  it("補助条件: 停止イベントが楽曲長近傍でない（曲の途中）なら終了としない", () => {
    expect(
      isSongEnded({
        ...base,
        stopped: true,
        positionMs: base.durationMs - SONG_END_STOP_TOLERANCE_MS - 1,
      })
    ).toBe(false);
  });
});

describe("createLoadStateMachine", () => {
  it("初期は読み込み中。確定で ready になり購読者へ通知する", () => {
    const machine = createLoadStateMachine();
    const seen: PlaybackState[] = [];
    machine.subscribe((s) => seen.push(s));
    expect(machine.getState().status).toBe("loading");
    machine.beginAttempt();
    machine.markReady();
    expect(machine.getState().status).toBe("ready");
    expect(seen.at(-1)?.status).toBe("ready");
  });

  it("読み込み失敗で error(load) になる", () => {
    const machine = createLoadStateMachine();
    machine.beginAttempt();
    machine.markLoadError("失敗の理由");
    const state = machine.getState();
    expect(state.status).toBe("error");
    if (state.status === "error") {
      expect(state.kind).toBe("load");
      expect(state.message).toBe("失敗の理由");
    }
  });

  it("確定の後に届いた読み込み失敗・確定の通知は無視する", () => {
    const machine = createLoadStateMachine();
    machine.beginAttempt();
    machine.markReady();
    machine.markLoadError("遅れて届いた失敗");
    expect(machine.getState().status).toBe("ready");
  });

  it("エラーの後に届いた確定の通知は無視する（新しい試行の開始が必要）", () => {
    const machine = createLoadStateMachine();
    machine.beginAttempt();
    machine.markLoadError();
    machine.markReady();
    expect(machine.getState().status).toBe("error");
  });

  it("再試行: 新しい試行を始めると読み込み中へ戻り、確定できる", () => {
    const machine = createLoadStateMachine();
    machine.beginAttempt();
    machine.markLoadError();
    machine.beginAttempt();
    expect(machine.getState().status).toBe("loading");
    machine.markReady();
    expect(machine.getState().status).toBe("ready");
  });

  it("試行番号: 最新の試行番号だけが最新と判定される", () => {
    const machine = createLoadStateMachine();
    const first = machine.beginAttempt();
    const second = machine.beginAttempt();
    expect(machine.isLatestAttempt(first)).toBe(false);
    expect(machine.isLatestAttempt(second)).toBe(true);
  });

  it("再試行は読み込み失敗の状態からのみ新しい試行を始める", () => {
    const machine = createLoadStateMachine();
    machine.beginAttempt();
    machine.markLoadError();
    const attempt = machine.beginRetryAttempt();
    expect(attempt).not.toBeNull();
    expect(machine.getState().status).toBe("loading");
    expect(machine.isLatestAttempt(attempt as number)).toBe(true);
  });

  it("再試行は読み込み中・確定・設定エラーでは何もせず null を返す", () => {
    const loading = createLoadStateMachine();
    loading.beginAttempt();
    expect(loading.beginRetryAttempt()).toBeNull();
    expect(loading.getState().status).toBe("loading");

    const ready = createLoadStateMachine();
    ready.beginAttempt();
    ready.markReady();
    expect(ready.beginRetryAttempt()).toBeNull();
    expect(ready.getState().status).toBe("ready");

    const config = createLoadStateMachine();
    config.markConfigError();
    expect(config.beginRetryAttempt()).toBeNull();
    const state = config.getState();
    expect(state.status).toBe("error");
    if (state.status === "error") {
      expect(state.kind).toBe("config");
    }
  });

  it("設定エラーは状態に依らず反映する", () => {
    const machine = createLoadStateMachine();
    machine.markConfigError("トークン未設定");
    const state = machine.getState();
    expect(state.status).toBe("error");
    if (state.status === "error") {
      expect(state.kind).toBe("config");
    }
  });
});
