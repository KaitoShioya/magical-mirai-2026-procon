// アプリ統括。画面状態の有限状態機械を組み立てて起動し、エンジンの固定時間刻みループで毎フレーム更新を駆動する。
// 本Issue（#3）では TextAlive は未結線。時間源は「未確定の仮実装」を注入し、TextAlive 起動とロード失敗導線（Issue #4）が
// player.timer.position を読む実装へ差し替える。

import { DEFAULT_SONG_KEY, findSong } from "../config/songs";
import {
  createClock,
  createLoop,
  createScheduler,
  createWorld,
  type TimeSource,
} from "../engine";
import {
  createPlayScreen,
  createResultScreen,
  createRetryScreen,
  createScreenMachine,
  createTitleScreen,
  createWarmupScreen,
} from "../screens";
import type { ScreenContext, ScreenFactory, ScreenKey } from "../screens";

/** 統括の外部契約。後始末のみを公開する。 */
export interface App {
  dispose(): void;
}

/**
 * 時間源の仮実装（M0）。TextAlive 未結線のため、再生位置は無く、再生中でも、確定でもない。
 * これにより engine の時計は進まず（world は止まったまま）、UIは実時間で従来どおり進む。
 * Issue #4 が player.timer.position / player.isPlaying を読む実装へ差し替える。
 */
const PLACEHOLDER_TIME_SOURCE: TimeSource = {
  positionMs: () => 0,
  isPlaying: () => false,
  isReady: () => false,
};

/**
 * アプリを生成し、初期状態 title で起動して毎フレーム駆動を開始する。
 * 呼び出し側は別途 start を呼ばない。返り値は後始末用の dispose のみを持つ。
 * options.diagnostics が真のときだけ、検証用の状態履歴アクセサ window.__screenHistory と
 * エンジン状態アクセサ window.__engineState を取り付ける。
 */
export function createApp(root: HTMLElement, options: { diagnostics: boolean }): App {
  const songTitle = findSong(DEFAULT_SONG_KEY).title;

  const factories: Record<ScreenKey, ScreenFactory> = {
    title: createTitleScreen,
    warmup: createWarmupScreen,
    play: createPlayScreen,
    result: createResultScreen,
    retry: createRetryScreen,
  };

  const machine = createScreenMachine(root, factories);

  const context: ScreenContext = {
    songTitle,
    requestTransition: (to: ScreenKey): void => {
      machine.requestTransition(to);
    },
  };

  machine.start("title", context);

  // エンジンの固定時間刻みループ。判定・得点はゲームの時計（時間源由来）で進め、UIは onFrame の実経過ミリ秒で進める。
  const world = createWorld();
  const clock = createClock();
  const scheduler = createScheduler();
  const loop = createLoop({
    timeSource: PLACEHOLDER_TIME_SOURCE,
    clock,
    scheduler,
    world,
    onSimulationStep: (stepEndGameTimeMs: number): void => {
      world.step(stepEndGameTimeMs);
    },
    onFrame: (realDeltaMs: number): void => {
      machine.update(realDeltaMs);
    },
  });
  loop.start();

  // 診断モード時のみ、読み取り専用アクセサを取り付ける（取り付けと削除を統括に一本化）。
  if (options.diagnostics) {
    window.__screenHistory = (): readonly string[] => machine.history();
    window.__engineState = () => loop.state();
  }

  return {
    dispose(): void {
      loop.dispose();
      machine.dispose();
      if (options.diagnostics) {
        delete window.__screenHistory;
        delete window.__engineState;
      }
    },
  };
}
