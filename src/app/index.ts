// アプリ統括。画面状態の有限状態機械を組み立てて起動し、毎フレーム更新を駆動する。
// 本Issue（#2）では TextAlive とエンジンは未結線。曲名の解決と画面遷移の結線のみを行う。
//   TextAlive の起動とロード失敗導線 → Issue #4
//   ゲームループ（固定時間刻み）への置き換え → Issue #3

import { DEFAULT_SONG_KEY, findSong } from "../config/songs";
import {
  createPlayScreen,
  createResultScreen,
  createRetryScreen,
  createScreenMachine,
  createTitleScreen,
  createWarmupScreen,
} from "../screens";
import type { ScreenContext, ScreenFactory, ScreenKey } from "../screens";

/**
 * 毎フレームの時間差の上限（ミリ秒）。
 * 毎秒60フレームでは1フレームが約16.7ミリ秒であり、100ミリ秒は約6フレーム分にあたる。
 * 背面化からの復帰や負荷で時間差が数秒に跳ねると、ウォームアップの累積が一気に進み表示を飛ばす。
 * 約6フレーム分を上限とすれば、軽微な遅延は吸収しつつ数秒の飛びは防げる。
 * これは描画合図駆動のUI進行用の値であり、判定・得点には使わない。
 */
const FRAME_DELTA_CLAMP_MS = 100;

/** 統括の外部契約。後始末のみを公開する。 */
export interface App {
  dispose(): void;
}

/**
 * アプリを生成し、初期状態 title で起動して毎フレーム駆動を開始する。
 * 呼び出し側は別途 start を呼ばない。返り値は後始末用の dispose のみを持つ。
 * options.diagnostics が真のときだけ、検証用の状態履歴アクセサ window.__screenHistory を取り付ける。
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

  // 暫定の毎フレーム駆動。Issue #3 でエンジンの固定時間刻みループ結線に置き換える。
  // UI進行のみを刻み、判定・得点には使わない。
  let frameHandle: number | null = null;
  let lastTimestamp: number | null = null;

  const tick = (timestamp: number): void => {
    if (lastTimestamp === null) {
      lastTimestamp = timestamp;
    }
    const rawDeltaMs = timestamp - lastTimestamp;
    lastTimestamp = timestamp;
    const deltaMs = Math.min(rawDeltaMs, FRAME_DELTA_CLAMP_MS);
    machine.update(deltaMs);
    frameHandle = requestAnimationFrame(tick);
  };
  frameHandle = requestAnimationFrame(tick);

  // 診断モード時のみ、状態履歴の読み取り専用アクセサを取り付ける（取り付けと削除を統括に一本化）。
  if (options.diagnostics) {
    window.__screenHistory = (): readonly string[] => machine.history();
  }

  return {
    dispose(): void {
      if (frameHandle !== null) {
        cancelAnimationFrame(frameHandle);
        frameHandle = null;
      }
      machine.dispose();
      if (options.diagnostics) {
        delete window.__screenHistory;
      }
    },
  };
}
