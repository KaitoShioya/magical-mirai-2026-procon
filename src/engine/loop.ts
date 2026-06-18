// 描画合図・タブ表示イベントを clock・scheduler・world と結ぶ薄い結線層。
// 毎フレームの判定は advanceFrame（描画合図にもタブ表示イベントにも依存しない関数）に切り出し、
// 決定的に単体検証する。loop 本体は環境層で advanceFrame を駆動するだけにする。
//
// このループはゲームの時計だけを扱い、操作音の時計 AudioContext.currentTime には関与しない（操作音は Issue #52）。

import type { Clock } from "./clock";
import type { Scheduler } from "./scheduler";
import type { World } from "./world";
import type { TimeSource } from "./timeSource";
import type { Environment } from "./environment";
import { createBrowserEnvironment } from "./environment";
import { FRAME_DELTA_CLAMP_MS } from "./constants";

/** loop が1か所で持つ可変状態。advanceFrame はこの記録だけを書き換える。 */
export interface LoopState {
  /** 直前フレームが再生中だったか（再生開始＝停止→再生の検出に使う）。 */
  previousPlaying: boolean;
  /** ゲーム時計を報告位置へ飛ばした回数の総計（初回同期・再生開始・タブ復帰・閾値超再同期を合算）。 */
  resyncCount: number;
  /** 上限超過で現在時刻へ合わせた回数。 */
  overflowCount: number;
}

/** advanceFrame の結果（診断と検証に使う）。 */
export interface FrameOutcome {
  /** 再生開始の排他分岐に入ったか。 */
  enteredPlayStart: boolean;
  /** このフレームで再同期したか。 */
  didResync: boolean;
  /** このフレームで上限超過し現在時刻へ合わせたか。 */
  didOverflow: boolean;
  /** シミュレーション刻みを1回以上実行したか。 */
  advanced: boolean;
}

/** advanceFrame が状態を進める対象。状態の変更はこれらと LoopState だけに限る。 */
export interface FrameDeps {
  timeSource: TimeSource;
  clock: Clock;
  scheduler: Scheduler;
  world: World;
  onSimulationStep: (stepEndGameTimeMs: number) => void;
}

/** advanceFrame への入力。 */
export interface FrameInput {
  /** クランプ済みの実経過ミリ秒。 */
  realDeltaMs: number;
}

/**
 * 毎フレームの判定。描画合図にもタブ表示イベントにも依存しない。
 * 状態の変更は引数で渡した clock・scheduler・world と state に限る。
 */
export function advanceFrame(deps: FrameDeps, state: LoopState, input: FrameInput): FrameOutcome {
  const { timeSource, clock, scheduler, world, onSimulationStep } = deps;
  const outcome: FrameOutcome = {
    enteredPlayStart: false,
    didResync: false,
    didOverflow: false,
    advanced: false,
  };

  // 時間源が未確定のあいだは時計を進めない（UIの実時間進行は loop 本体の onFrame が担う）。
  if (!timeSource.isReady()) {
    state.previousPlaying = false;
    return outcome;
  }

  const playing = timeSource.isPlaying();
  const reportedMs = timeSource.positionMs();

  // 再生開始の検出（排他）: 直前停止→今回再生なら強制再同期だけ行い、clock.update も刻みも実行せず返る。
  if (playing && !state.previousPlaying) {
    // 報告位置が無効なら同期しない。再生開始の同期は次の有効な位置のフレームへ持ち越す
    // （直前再生状態を偽のままにして再検出させる）。
    if (!clock.forceResync(reportedMs)) {
      state.previousPlaying = false;
      return outcome;
    }
    scheduler.syncTo(clock.gameTimeMs);
    world.syncTo(clock.gameTimeMs);
    state.previousPlaying = true;
    state.resyncCount += 1;
    outcome.enteredPlayStart = true;
    outcome.didResync = true;
    return outcome;
  }
  state.previousPlaying = playing;

  const sample = clock.update(reportedMs, playing, input.realDeltaMs);

  // 再同期フレーム: 時刻を合わせ、飛びぶんの刻みは実行しない。
  if (sample.didResync) {
    scheduler.syncTo(sample.gameTimeMs);
    world.syncTo(sample.gameTimeMs);
    state.resyncCount += 1;
    outcome.didResync = true;
    return outcome;
  }

  // 通常フレーム: 時計が未初期化（無効値据え置き）のあいだは刻みを実行しない。
  if (!clock.hasSample) {
    return outcome;
  }

  const result = scheduler.advanceTo(sample.gameTimeMs, onSimulationStep);
  outcome.advanced = result.steps > 0;
  if (result.overflow) {
    scheduler.syncTo(sample.gameTimeMs);
    world.syncTo(sample.gameTimeMs);
    state.overflowCount += 1;
    outcome.didOverflow = true;
  }
  return outcome;
}

/** loop の外部契約。 */
export interface Loop {
  start(): void;
  /** 後始末。冪等。描画合図の取り消し・タブ表示イベントの待ち受け解除・以後のフレーム手順の無効化を行う。 */
  dispose(): void;
  /** 診断用。現在のゲーム時刻・刻み回数・再同期回数・超過回数・時間源確定・時計初期化を返す。 */
  state(): {
    gameTimeMs: number;
    stepCount: number;
    resyncCount: number;
    overflowCount: number;
    ready: boolean;
    hasClockSample: boolean;
  };
}

export interface LoopOptions {
  timeSource: TimeSource;
  clock: Clock;
  scheduler: Scheduler;
  world: World;
  /** 統括が world.step を結ぶ。 */
  onSimulationStep: (stepEndGameTimeMs: number) => void;
  /** 統括が machine.update を結ぶ（実経過ミリ秒で駆動）。 */
  onFrame: (realDeltaMs: number, interpolationAlpha: number) => void;
  /** タブ非表示・ページ退避で呼ばれる。Issue #4 が player の一時停止を結ぶ接合点。 */
  onPause?: () => void;
  /** タブ表示・ページ復元で呼ばれる。 */
  onResume?: () => void;
  /** 差し替え可能な環境層。既定はブラウザ実装。検証では差し替える。 */
  environment?: Environment;
}

export function createLoop(options: LoopOptions): Loop {
  const { timeSource, clock, scheduler, world, onSimulationStep, onFrame, onPause, onResume } =
    options;
  const environment = options.environment ?? createBrowserEnvironment();

  const deps: FrameDeps = { timeSource, clock, scheduler, world, onSimulationStep };
  const state: LoopState = { previousPlaying: false, resyncCount: 0, overflowCount: 0 };

  let frameHandle: number | null = null;
  let lastTimeMs: number | null = null;
  let started = false;
  let paused = false;
  let disposed = false;
  let unsubscribe: (() => void) | null = null;

  function schedule(): void {
    frameHandle = environment.requestFrame(frame);
  }

  function frame(timeMs: number): void {
    if (disposed || paused) {
      return;
    }
    if (lastTimeMs === null) {
      lastTimeMs = timeMs;
    }
    const realDeltaMs = Math.min(timeMs - lastTimeMs, FRAME_DELTA_CLAMP_MS);
    lastTimeMs = timeMs;

    // 判定・得点の進行（advanceFrame が時間源の確定判定を内包する）。
    advanceFrame(deps, state, { realDeltaMs });
    // UIの実時間進行（時間源が未確定でも呼ぶ。停止中＝タブ非表示のときはここへ来ない）。
    onFrame(realDeltaMs, scheduler.interpolationAlpha);

    schedule();
  }

  function pause(): void {
    if (disposed || paused) {
      return;
    }
    paused = true;
    if (frameHandle !== null) {
      environment.cancelFrame(frameHandle);
      frameHandle = null;
    }
    onPause?.();
  }

  function resume(): void {
    if (disposed || !paused) {
      return;
    }
    paused = false;
    // 実時刻基準をリセットし、復帰後の現在値で時計と処理済み時刻を合わせ直す。
    lastTimeMs = null;
    // 報告位置が有効なときだけ合わせ直し、再同期として数える。
    if (timeSource.isReady() && clock.forceResync(timeSource.positionMs())) {
      scheduler.syncTo(clock.gameTimeMs);
      world.syncTo(clock.gameTimeMs);
      // 復帰直後のフレームで再生開始検出が二重に発火しないよう、直前再生状態を現在値へ即時更新する。
      state.previousPlaying = timeSource.isPlaying();
      state.resyncCount += 1;
    } else {
      // 未確定または無効位置で合わせ直せなかった。直前再生状態を偽にしておき、次の有効な再生フレームで
      // 再生開始検出（手順3）に復帰の強制再同期を持ち越す。これによりタブ復帰時の時刻合わせを取りこぼさない。
      state.previousPlaying = false;
    }
    schedule();
    onResume?.();
  }

  return {
    start(): void {
      // 二重起動を防ぐ（購読とフレーム予約の重複を避けるため冪等にする）。
      if (disposed || started) {
        return;
      }
      started = true;
      unsubscribe = environment.subscribe(pause, resume);
      if (environment.isVisible()) {
        schedule();
      } else {
        // 非表示で起動したら停止状態から始める（表示に戻ったら resume が駆動する）。
        paused = true;
      }
    },

    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      if (frameHandle !== null) {
        environment.cancelFrame(frameHandle);
        frameHandle = null;
      }
      if (unsubscribe !== null) {
        unsubscribe();
        unsubscribe = null;
      }
    },

    state() {
      return {
        gameTimeMs: clock.gameTimeMs,
        stepCount: world.stepCount,
        resyncCount: state.resyncCount,
        overflowCount: state.overflowCount,
        ready: timeSource.isReady(),
        hasClockSample: clock.hasSample,
      };
    },
  };
}
