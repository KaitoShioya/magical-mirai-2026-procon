import { describe, it, expect } from "vitest";
import { advanceFrame, createLoop } from "./loop";
import type { FrameDeps, LoopState } from "./loop";
import type { TimeSource } from "./timeSource";
import type { Environment } from "./environment";
import type { Scheduler } from "./scheduler";
import { createClock } from "./clock";
import type { Clock, ClockSample } from "./clock";
import { createScheduler } from "./scheduler";
import { createWorld } from "./world";
import { MAX_SIMULATION_STEPS_PER_FRAME, RESYNC_THRESHOLD_MS } from "./constants";

// 可変な時間源のにせもの。
function createFakeTimeSource(init: { positionMs: number; isPlaying: boolean; isReady: boolean }): {
  source: TimeSource;
  set(patch: Partial<{ positionMs: number; isPlaying: boolean; isReady: boolean }>): void;
} {
  const s = { ...init };
  return {
    source: {
      positionMs: () => s.positionMs,
      isPlaying: () => s.isPlaying,
      isReady: () => s.isReady,
    },
    set: (patch) => Object.assign(s, patch),
  };
}

// 差し替え可能な環境層のにせもの。描画合図のコールバックを捕まえ、tick で手動駆動する。
function createFakeEnvironment(initialVisible = true): {
  env: Environment;
  tick(timeMs: number): void;
  hide(): void;
  show(): void;
  hasFrame(): boolean;
  subscribeCount(): number;
  requestFrameCount(): number;
  unsubscribeCount(): number;
} {
  let visible = initialVisible;
  let callback: ((timeMs: number) => void) | null = null;
  let onHide: (() => void) | null = null;
  let onShow: (() => void) | null = null;
  let nextHandle = 1;
  let subscribeCalls = 0;
  let requestFrameCalls = 0;
  let unsubscribeCalls = 0;
  return {
    env: {
      isVisible: () => visible,
      requestFrame: (c) => {
        requestFrameCalls += 1;
        callback = c;
        return nextHandle++;
      },
      cancelFrame: () => {
        callback = null;
      },
      subscribe: (h, s) => {
        subscribeCalls += 1;
        onHide = h;
        onShow = s;
        return () => {
          unsubscribeCalls += 1;
          onHide = null;
          onShow = null;
        };
      },
    },
    tick: (timeMs) => {
      callback?.(timeMs);
    },
    hide: () => {
      visible = false;
      onHide?.();
    },
    show: () => {
      visible = true;
      onShow?.();
    },
    hasFrame: () => callback !== null,
    subscribeCount: () => subscribeCalls,
    requestFrameCount: () => requestFrameCalls,
    unsubscribeCount: () => unsubscribeCalls,
  };
}

// 恒等の時計のにせもの: 平滑化せず報告位置をそのままゲーム時刻にする。
// loop 結合での「同じゲーム時刻の進行なら分割数に依らず同じ刻み列」を、時計の平滑化を除いて検証するために使う。
function createIdentityClock(): Clock {
  let gameTimeMs = 0;
  let sampled = false;
  return {
    update(reportedMs: number): ClockSample {
      const first = !sampled;
      sampled = true;
      gameTimeMs = reportedMs;
      return { gameTimeMs, didResync: first };
    },
    forceResync(reportedMs: number): boolean {
      if (!Number.isFinite(reportedMs)) {
        return false;
      }
      gameTimeMs = reportedMs;
      sampled = true;
      return true;
    },
    reset(): void {
      gameTimeMs = 0;
      sampled = false;
    },
    get gameTimeMs(): number {
      return gameTimeMs;
    },
    get hasSample(): boolean {
      return sampled;
    },
  };
}

describe("advanceFrame", () => {
  it("再生開始の排他: 停止→再生のフレームは強制再同期だけ行い刻みを実行しない", () => {
    const clock = createClock();
    const scheduler = createScheduler();
    const world = createWorld();
    const time = createFakeTimeSource({ positionMs: 1000, isPlaying: true, isReady: true });
    const deps: FrameDeps = {
      timeSource: time.source,
      clock,
      scheduler,
      world,
      onSimulationStep: (t) => world.step(t),
    };
    const state: LoopState = { previousPlaying: false, resyncCount: 0, overflowCount: 0 };

    const outcome = advanceFrame(deps, state, { realDeltaMs: 16 });

    expect(outcome.enteredPlayStart).toBe(true);
    expect(outcome.didResync).toBe(true);
    expect(outcome.advanced).toBe(false);
    expect(world.stepCount).toBe(0);
    expect(clock.gameTimeMs).toBe(1000);
    expect(state.resyncCount).toBe(1);
    expect(state.previousPlaying).toBe(true);
  });

  it("未初期化スキップ: 時計が一度も有効値を受けていない通常フレームは刻みを実行しない", () => {
    const clock = createClock();
    const scheduler = createScheduler();
    const world = createWorld();
    // 停止中かつ位置が無効値。clock.update は据え置きで didResync 偽・hasSample 偽のまま。
    const time = createFakeTimeSource({ positionMs: Number.NaN, isPlaying: false, isReady: true });
    const deps: FrameDeps = {
      timeSource: time.source,
      clock,
      scheduler,
      world,
      onSimulationStep: (t) => world.step(t),
    };
    const state: LoopState = { previousPlaying: false, resyncCount: 0, overflowCount: 0 };

    const outcome = advanceFrame(deps, state, { realDeltaMs: 16 });

    expect(outcome.advanced).toBe(false);
    expect(world.stepCount).toBe(0);
    expect(state.resyncCount).toBe(0);
    expect(clock.hasSample).toBe(false);
  });

  it("再同期フレーム: 再生中の大きな飛びで時刻を合わせ刻みを実行しない", () => {
    const clock = createClock();
    const scheduler = createScheduler();
    const world = createWorld();
    const time = createFakeTimeSource({ positionMs: 1000, isPlaying: true, isReady: true });
    const deps: FrameDeps = {
      timeSource: time.source,
      clock,
      scheduler,
      world,
      onSimulationStep: (t) => world.step(t),
    };
    const state: LoopState = { previousPlaying: false, resyncCount: 0, overflowCount: 0 };

    // 1フレーム目で再生開始（1000 へ同期）。
    advanceFrame(deps, state, { realDeltaMs: 16 });
    // 2フレーム目で閾値を超えて前へ飛ぶ。
    time.set({ positionMs: 1000 + RESYNC_THRESHOLD_MS + 500 });
    const outcome = advanceFrame(deps, state, { realDeltaMs: 16 });

    expect(outcome.didResync).toBe(true);
    expect(outcome.advanced).toBe(false);
    expect(world.stepCount).toBe(0);
    expect(clock.gameTimeMs).toBe(1000 + RESYNC_THRESHOLD_MS + 500);
    expect(state.resyncCount).toBe(2);
  });

  it("通常前進: ゲーム時刻の進みに応じて固定刻みを実行する", () => {
    const clock = createClock();
    const scheduler = createScheduler();
    const world = createWorld();
    const time = createFakeTimeSource({ positionMs: 0, isPlaying: true, isReady: true });
    const deps: FrameDeps = {
      timeSource: time.source,
      clock,
      scheduler,
      world,
      onSimulationStep: (t) => world.step(t),
    };
    const state: LoopState = { previousPlaying: false, resyncCount: 0, overflowCount: 0 };

    // 1フレーム目で再生開始（0 へ同期）。
    advanceFrame(deps, state, { realDeltaMs: 16 });
    // 2フレーム目で報告が 100 ミリ秒へ。平滑化後のゲーム時刻 32.8 ミリ秒で 10/20/30 の3刻み。
    time.set({ positionMs: 100 });
    const outcome = advanceFrame(deps, state, { realDeltaMs: 16 });

    expect(outcome.advanced).toBe(true);
    expect(world.stepCount).toBe(3);
    expect(world.gameTimeMs).toBe(30);
  });

  it("超過フレーム: scheduler が超過を返すと現在時刻へ合わせ超過回数を増やす", () => {
    const clock = createClock();
    const world = createWorld();
    let synced = 0;
    const overflowingScheduler: Scheduler = {
      advanceTo: () => ({ steps: MAX_SIMULATION_STEPS_PER_FRAME, overflow: true }),
      syncTo: () => {
        synced += 1;
      },
      reset: () => {},
      get interpolationAlpha() {
        return 0;
      },
    };
    const time = createFakeTimeSource({ positionMs: 1000, isPlaying: true, isReady: true });
    const deps: FrameDeps = {
      timeSource: time.source,
      clock,
      scheduler: overflowingScheduler,
      world,
      onSimulationStep: () => {},
    };
    // 直前も再生中として再生開始の排他を避け、通常フレームへ入れる。
    const state: LoopState = { previousPlaying: true, resyncCount: 0, overflowCount: 0 };

    // 1フレーム目: 時計の初期化（再同期）。
    advanceFrame(deps, state, { realDeltaMs: 16 });
    // 2フレーム目: 通常更新→超過。
    time.set({ positionMs: 1016 });
    const outcome = advanceFrame(deps, state, { realDeltaMs: 16 });

    expect(outcome.didOverflow).toBe(true);
    expect(state.overflowCount).toBe(1);
    expect(synced).toBeGreaterThanOrEqual(1);
  });

  it("再生開始で報告位置が無効なら同期せず、直前再生状態を偽のまま持ち越す", () => {
    const clock = createClock();
    const scheduler = createScheduler();
    const world = createWorld();
    const time = createFakeTimeSource({ positionMs: Number.NaN, isPlaying: true, isReady: true });
    const deps: FrameDeps = {
      timeSource: time.source,
      clock,
      scheduler,
      world,
      onSimulationStep: (t) => world.step(t),
    };
    const state: LoopState = { previousPlaying: false, resyncCount: 0, overflowCount: 0 };

    const outcome = advanceFrame(deps, state, { realDeltaMs: 16 });

    expect(outcome.enteredPlayStart).toBe(false);
    expect(outcome.didResync).toBe(false);
    expect(state.resyncCount).toBe(0);
    expect(state.previousPlaying).toBe(false);
    expect(clock.hasSample).toBe(false);

    // 次に有効な位置が来たら、持ち越した再生開始の同期が成立する。
    time.set({ positionMs: 1000 });
    const next = advanceFrame(deps, state, { realDeltaMs: 16 });
    expect(next.enteredPlayStart).toBe(true);
    expect(clock.gameTimeMs).toBe(1000);
    expect(state.resyncCount).toBe(1);
  });

  it("結合のフレーム数非依存: 同じゲーム時刻の進行なら分割数に依らず同じ刻み列になる", () => {
    function run(reportedSeries: number[]): number[] {
      const clock = createIdentityClock();
      const scheduler = createScheduler();
      const world = createWorld();
      const steps: number[] = [];
      const time = createFakeTimeSource({ positionMs: 0, isPlaying: true, isReady: true });
      const deps: FrameDeps = {
        timeSource: time.source,
        clock,
        scheduler,
        world,
        onSimulationStep: (t) => steps.push(t),
      };
      const state: LoopState = { previousPlaying: false, resyncCount: 0, overflowCount: 0 };
      for (const reported of reportedSeries) {
        time.set({ positionMs: reported });
        advanceFrame(deps, state, { realDeltaMs: 16 });
      }
      return steps;
    }

    // 先頭の 0 は再生開始の同期。以降の到達点が同じなら刻み列は一致する。
    const whole = run([0, 100]);
    const split = run([0, 16, 33, 50, 66, 83, 100]);
    expect(whole).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    expect(split).toEqual(whole);
  });
});

describe("loop（環境層を差し替えて決定的に検証）", () => {
  function makeLoop(visible = true) {
    const fakeEnv = createFakeEnvironment(visible);
    const time = createFakeTimeSource({ positionMs: 2000, isPlaying: true, isReady: true });
    const world = createWorld();
    let onFrameCount = 0;
    let pauseCount = 0;
    let resumeCount = 0;
    let lastRealDeltaMs = Number.NaN;
    const loop = createLoop({
      timeSource: time.source,
      clock: createClock(),
      scheduler: createScheduler(),
      world,
      onSimulationStep: (stepEndGameTimeMs) => world.step(stepEndGameTimeMs),
      onFrame: (realDeltaMs) => {
        onFrameCount += 1;
        lastRealDeltaMs = realDeltaMs;
      },
      onPause: () => {
        pauseCount += 1;
      },
      onResume: () => {
        resumeCount += 1;
      },
      environment: fakeEnv.env,
    });
    return {
      loop,
      fakeEnv,
      time,
      world,
      counts: () => ({ onFrameCount, pauseCount, resumeCount }),
      lastRealDeltaMs: () => lastRealDeltaMs,
    };
  }

  it("停止中は onFrame を呼ばない", () => {
    const { loop, fakeEnv, counts } = makeLoop();
    loop.start();
    fakeEnv.tick(0);
    expect(counts().onFrameCount).toBe(1);

    fakeEnv.hide();
    expect(counts().pauseCount).toBe(1);
    expect(fakeEnv.hasFrame()).toBe(false);

    fakeEnv.tick(100);
    expect(counts().onFrameCount).toBe(1); // 停止中は増えない
    loop.dispose();
  });

  it("復帰で時計を合わせ直し再同期回数が増え、再開が一度だけ呼ばれる", () => {
    const { loop, fakeEnv, counts } = makeLoop();
    loop.start();
    fakeEnv.tick(0); // 再生開始の同期（resyncCount 1）

    fakeEnv.hide();
    fakeEnv.show();

    expect(counts().resumeCount).toBe(1);
    expect(loop.state().resyncCount).toBeGreaterThanOrEqual(2);
    loop.dispose();
  });

  it("二重発火防止: 連続した非表示・表示で停止と再開はそれぞれ一度だけ", () => {
    const { loop, fakeEnv, counts } = makeLoop();
    loop.start();
    fakeEnv.tick(0);

    fakeEnv.hide();
    fakeEnv.hide();
    expect(counts().pauseCount).toBe(1);

    fakeEnv.show();
    fakeEnv.show();
    expect(counts().resumeCount).toBe(1);
    loop.dispose();
  });

  it("復帰直後のフレームで再生開始検出が二重に再同期しない", () => {
    const { loop, fakeEnv, time } = makeLoop();
    loop.start();
    fakeEnv.tick(0); // 再生開始（resyncCount 1）
    fakeEnv.hide();
    fakeEnv.show(); // 復帰で再同期（resyncCount 2、previousPlaying を再生中へ即時更新）
    const afterResume = loop.state().resyncCount;

    // 再開後の通常フレームでは再生開始検出が起きず再同期回数は増えない。
    time.set({ positionMs: 2016 });
    fakeEnv.tick(16);
    expect(loop.state().resyncCount).toBe(afterResume);
    loop.dispose();
  });

  it("通常フレームでは環境層からworldまで結線され固定刻みが進む", () => {
    const { loop, fakeEnv, time, world } = makeLoop();
    loop.start();
    fakeEnv.tick(0); // 再生開始（2000 へ同期、この時点では刻み無し）
    expect(world.stepCount).toBe(0);
    // 報告位置が 2100 へ。平滑化後のゲーム時刻 2032.8 ミリ秒で 2010/2020/2030 の3刻み。
    time.set({ positionMs: 2100 });
    fakeEnv.tick(16);
    expect(world.stepCount).toBe(3);
    expect(world.gameTimeMs).toBe(2030);
    loop.dispose();
  });

  it("実経過の差分は上限100ミリ秒にクランプされる", () => {
    const { loop, fakeEnv, lastRealDeltaMs } = makeLoop();
    loop.start();
    fakeEnv.tick(0);
    // 5秒の大きな飛びでも onFrame へ渡る差分は100ミリ秒に収まる。
    fakeEnv.tick(5000);
    expect(lastRealDeltaMs()).toBe(100);
    loop.dispose();
  });

  it("非表示中に再生位置が進んでも、復帰でゲーム時刻が現在の再生位置へ一致する", () => {
    const { loop, fakeEnv, time, world } = makeLoop();
    loop.start();
    fakeEnv.tick(0); // 再生開始（2000 へ同期）
    fakeEnv.hide();
    // 非表示のあいだに再生位置が大きく進む。
    time.set({ positionMs: 60000 });
    fakeEnv.show();
    // 復帰で現在位置へ合わせ直すため、飛びぶんを刻まずゲーム時刻が現在位置に一致する。
    expect(loop.state().gameTimeMs).toBe(60000);
    expect(world.gameTimeMs).toBe(60000);
    loop.dispose();
  });

  it("dispose は冪等で購読を一度だけ解除し、破棄後は表示切替や駆動が何も起こさない", () => {
    const { loop, fakeEnv, counts } = makeLoop();
    loop.start();
    fakeEnv.tick(0);
    const before = counts().onFrameCount;

    loop.dispose();
    loop.dispose(); // 2回目も例外なく何もしない
    expect(fakeEnv.unsubscribeCount()).toBe(1);
    fakeEnv.show();
    fakeEnv.hide();
    fakeEnv.tick(100);
    expect(counts().onFrameCount).toBe(before);
  });

  it("start の二重呼び出しは購読とフレーム予約を重複させない", () => {
    const { loop, fakeEnv } = makeLoop();
    loop.start();
    loop.start();
    expect(fakeEnv.subscribeCount()).toBe(1);
    expect(fakeEnv.requestFrameCount()).toBe(1);
    loop.dispose();
  });

  it("復帰時に位置が無効でも、次の有効な再生フレームで現在位置へ合わせ直す", () => {
    const { loop, fakeEnv, time, world } = makeLoop();
    loop.start();
    fakeEnv.tick(0); // 再生開始（2000 へ同期）
    fakeEnv.hide();
    // 復帰の瞬間に位置が無効。
    time.set({ positionMs: Number.NaN });
    fakeEnv.show();
    // 次フレームで有効な位置が来たら、持ち越した復帰同期が成立する。
    time.set({ positionMs: 50000 });
    fakeEnv.tick(16);
    expect(world.gameTimeMs).toBe(50000);
    expect(loop.state().gameTimeMs).toBe(50000);
    loop.dispose();
  });
});
