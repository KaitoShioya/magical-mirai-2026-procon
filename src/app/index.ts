// アプリ統括。画面状態の有限状態機械を組み立てて起動し、エンジンの固定時間刻みループで毎フレーム更新を駆動する。
// TextAlive の再生（src/textalive）を時間源として engine へ供給し、楽曲ロード失敗の導線（src/app/overlay）と
// 楽曲終了によるプレイ→結果遷移、タブ離脱時の楽曲停止・再開を結ぶ（Issue #4）。

import { DEFAULT_SONG_KEY, findSong } from "../config/songs";
import { createClock, createLoop, createScheduler, createWorld } from "../engine";
import {
  createPlayScreen,
  createResultScreen,
  createRetryScreen,
  createScreenMachine,
  createTitleScreen,
  createWarmupScreen,
} from "../screens";
import type { ScreenContext, ScreenFactory, ScreenKey } from "../screens";
import { createFakePlayback, createTextAlivePlayback, type Playback } from "../textalive";
import { createOverlays } from "./overlay";

/** 統括の外部契約。後始末のみを公開する。 */
export interface App {
  dispose(): void;
}

/**
 * プレイ進入後に再生開始の成立を待つ上限（ミリ秒）。
 * 採用理由を先に述べる。再生開始の通知は再生位置更新の間隔（約50ミリ秒）に依存するため、その数回ぶんを
 * 超え、かつ操作の反応が遅く感じない範囲として400ミリ秒を、再生開始の成立を待つ上限とする。
 * これを超えても再生が始まらなければ「触れて再生」表示を出す。★暫定（実機で調整する）。
 */
const PLAYBACK_START_TIMEOUT_MS = 400;

/**
 * アプリを生成し、初期状態 title で起動して毎フレーム駆動を開始する。
 * 呼び出し側は別途 start を呼ばない。返り値は後始末用の dispose のみを持つ。
 * options.diagnostics が真のとき、検証用の状態アクセサを取り付け、トークン非依存の擬似再生を用いる。
 */
export function createApp(root: HTMLElement, options: { diagnostics: boolean }): App {
  const song = findSong(DEFAULT_SONG_KEY);

  // 診断モード（?smoke=1）はトークン非依存の擬似再生、通常はトークンで実プレイヤーを使う。
  const playback: Playback = options.diagnostics
    ? createFakePlayback()
    : createTextAlivePlayback({ song, token: import.meta.env.VITE_TEXTALIVE_TOKEN });

  const overlays = createOverlays();
  const renderOverlays = (state = playback.getState()): void => {
    overlays.render(state, { onRetry: () => playback.retry() });
    // 確定前（読み込み中・エラー）は画面表示領域を操作不能にする。理由を先に述べる。
    // 受け入れ基準「onTimerReady後にUIが有効化」を、覆い隠すポインタの遮断だけでなく、
    // キーボード操作や焦点移動に対しても満たすため、確定するまで背面の操作を inert 属性で塞ぐ。
    if (state.status === "ready") {
      root.removeAttribute("inert");
    } else {
      root.setAttribute("inert", "");
    }
  };
  const unsubscribe = playback.subscribe(renderOverlays);
  renderOverlays();

  const factories: Record<ScreenKey, ScreenFactory> = {
    title: createTitleScreen,
    warmup: createWarmupScreen,
    play: createPlayScreen,
    result: createResultScreen,
    retry: createRetryScreen,
  };

  const machine = createScreenMachine(root, factories);

  // プレイ進行中だけ、タブ離脱時の楽曲停止・再開と、楽曲終了・再生開始の観測を行う。
  let inPlayPhase = false;
  // 再生開始の成立を待つ累積時間と、「触れて再生」表示中かどうか。
  let playStartElapsedMs = 0;
  let tapToPlayShown = false;

  function enterPlay(): void {
    inPlayPhase = true;
    playStartElapsedMs = 0;
    tapToPlayShown = false;
    overlays.hideTapToPlay();
    playback.beginFromStart();
  }

  const context: ScreenContext = {
    songTitle: song.title,
    requestTransition: (to: ScreenKey): void => {
      // 「はじめる」の操作の最中（題名→ウォームアップ）に音声再生の許可を最善努力で確立する。
      if (to === "warmup") {
        playback.primeAudioPermission();
      }
      machine.requestTransition(to);
      // ウォームアップ→プレイの遷移が成立した後に、先頭から再生を開始する。
      if (to === "play") {
        enterPlay();
      }
    },
  };

  machine.start("title", context);

  // 毎フレームのプレイ進行の観測（再生開始の成立確認・楽曲終了）。
  function tickPlay(realDeltaMs: number): void {
    if (!inPlayPhase) {
      return;
    }
    // 再生開始の成立確認。一定時間内に始まらなければ「触れて再生」表示を出す。
    if (!playback.hasStarted()) {
      playStartElapsedMs += realDeltaMs;
      if (playStartElapsedMs >= PLAYBACK_START_TIMEOUT_MS && !tapToPlayShown) {
        tapToPlayShown = true;
        overlays.showTapToPlay(() => playback.play());
      }
    } else if (tapToPlayShown) {
      tapToPlayShown = false;
      overlays.hideTapToPlay();
    }
    // 楽曲終了でプレイ→結果へ一度だけ遷移する。
    if (playback.hasEnded()) {
      inPlayPhase = false;
      overlays.hideTapToPlay();
      machine.requestTransition("result");
    }
  }

  // エンジンの固定時間刻みループ。判定・得点は再生位置由来のゲームの時計で進め、UIは実経過ミリ秒で進める。
  const world = createWorld();
  const clock = createClock();
  const scheduler = createScheduler();
  const loop = createLoop({
    timeSource: playback.timeSource,
    clock,
    scheduler,
    world,
    onSimulationStep: (stepEndGameTimeMs: number): void => {
      world.step(stepEndGameTimeMs);
    },
    onFrame: (realDeltaMs: number): void => {
      machine.update(realDeltaMs);
      tickPlay(realDeltaMs);
    },
    // タブ非表示・ページ退避で楽曲を止め、復帰で再開する（プレイ進行中のみ）。
    // 再開時の3-2-1カウントインは設けない暫定挙動であり、Issue #112 がカウントインへ差し替える。
    onPause: (): void => {
      if (inPlayPhase) {
        playback.pause();
      }
    },
    onResume: (): void => {
      if (inPlayPhase) {
        playback.play();
      }
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
      unsubscribe();
      overlays.dispose();
      playback.dispose();
      // 確定前に破棄された場合に備え、renderOverlays が付けた inert 属性を外す。
      root.removeAttribute("inert");
      if (options.diagnostics) {
        delete window.__screenHistory;
        delete window.__engineState;
      }
    },
  };
}
