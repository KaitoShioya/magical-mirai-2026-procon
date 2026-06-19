// TextAlive Player の生成・ライフサイクル配線・楽曲ロード失敗導線。
// ライフサイクルの順序: onAppReady → createFromSongUrl → onVideoReady → onTimerReady。
// onTimerReady の後に再生位置（player.timer.position）が取得できる。
// 依存規則: tools を import しない。判定・得点の論理を持たない（時刻は値として供給するのみ）。

import { Player, type IPlayerApp, type PlayerListener } from "textalive-app-api";
import type { Song } from "../config/songs";
import {
  createLoadStateMachine,
  createReadyGatedTimeSource,
  isSongEnded,
  SONG_END_MARGIN_MS,
  SONG_END_STOP_TOLERANCE_MS,
  type Playback,
} from "./playback";

/** 音声配置先要素の識別子。index.html で #app の外（body 直下）に置く。 */
const MEDIA_ELEMENT_ID = "audio-media";

export interface TextAlivePlaybackOptions {
  song: Song;
  /** TextAlive アプリトークン。空文字なら設定エラーにする。 */
  token: string;
}

/**
 * 実プレイヤーによる再生を作る。
 * トークンが空のときはプレイヤーを生成せず設定エラーにする。理由は、トークンはビルド時に注入されるため
 * 実行時の再試行では復旧せず、また API を呼ばないことでライフサイクル由来のエラーを出さないため。
 */
export function createTextAlivePlayback(options: TextAlivePlaybackOptions): Playback {
  const { song, token } = options;

  // ---- トークン未設定: プレイヤーを生成せず設定エラー ----
  if (token.trim() === "") {
    const machine = createLoadStateMachine({
      status: "error",
      kind: "config",
      message: "TextAlive のアプリトークンが設定されていません。",
    });
    const timeSource = createReadyGatedTimeSource(
      { positionMs: () => 0, isPlaying: () => false },
      () => false
    );
    return {
      timeSource,
      getState: machine.getState,
      subscribe: machine.subscribe,
      beginFromStart() {},
      pause() {},
      play() {},
      hasStarted: () => false,
      hasEnded: () => false,
      retry() {},
      primeAudioPermission() {},
      dispose() {},
    };
  }

  // ---- 通常: プレイヤーを生成して結線 ----
  const machine = createLoadStateMachine();
  let started = false;
  let stopped = false;

  const mediaElement = document.getElementById(MEDIA_ELEMENT_ID);
  const player = new Player({
    app: { token },
    // 声量・感情は初期化時のみ指定でき、後続のキネティックタイポ（M3）等が必要とするため有効化する。
    vocalAmplitudeEnabled: true,
    valenceArousalEnabled: true,
    ...(mediaElement ? { mediaElement } : {}),
  });

  const isReady = (): boolean => machine.getState().status === "ready";

  function currentPositionMs(): number {
    // 確定後（onTimerReady 後）のみ engine から呼ばれる契約だが、安全のため未確定時は0を返す。
    return player.timer?.position ?? 0;
  }

  const timeSource = createReadyGatedTimeSource(
    { positionMs: currentPositionMs, isPlaying: () => player.isPlaying },
    isReady
  );

  // 渡された試行番号で同一プレイヤーに楽曲を読み込む。読み込み失敗の遅延結果は試行番号で取り違えを防ぐ。
  function runLoad(attempt: number): void {
    player
      .createFromSongUrl(song.songUrl, { video: song.video })
      .catch((error: unknown) => {
        if (machine.isLatestAttempt(attempt)) {
          machine.markLoadError(error instanceof Error ? error.message : String(error));
        }
      });
  }

  // ライフサイクル用コールバックは試行番号を引数に持たないが、読み込みは同時に1つしか進行しない
  // （最初の読み込みは onAppReady で1回、再試行は読み込み失敗の状態からのみ。beginRetryAttempt が保証する）。
  // 加えて、確定・読み込み失敗は machine が読み込み中のときだけ反映する。読み込み失敗で終わった試行は
  // その後 onTimerReady を発火させず、onAppLoad はサーバ接続時の一度きりの通知であるため、
  // 古い試行の遅延通知が新しい試行へ混ざることはない。
  const listener: PlayerListener = {
    onAppReady(app: IPlayerApp) {
      // ホスト管理でないときだけ自分で楽曲をロードする（docs/support-page.md の作法）。
      if (!app.managed) {
        runLoad(machine.beginAttempt());
      }
    },
    onTimerReady() {
      // 読み込み中のときだけ確定にする。
      machine.markReady();
    },
    onPlay() {
      started = true;
    },
    onStop() {
      // 本Issueのプレイ中は requestStop を呼ばないため、再生開始後の停止は自然終了の補助信号になる。
      if (started) {
        stopped = true;
      }
    },
    onAppLoad(_app: IPlayerApp, error?: string) {
      // サーバ接続時の通知。エラーがあれば読み込み中のときだけ読み込み失敗にする。
      if (error) {
        machine.markLoadError(error);
      }
    },
  };
  player.addListener(listener);

  return {
    timeSource,
    getState: machine.getState,
    subscribe: machine.subscribe,
    beginFromStart() {
      // 先頭へ戻してから再生を開始する。再生開始は onPlay で started=true になる。
      started = false;
      stopped = false;
      player.requestMediaSeek(0);
      player.requestPlay();
    },
    pause() {
      player.requestPause();
    },
    play() {
      player.requestPlay();
    },
    hasStarted: () => started,
    hasEnded() {
      return isSongEnded({
        ready: isReady(),
        playStarted: started,
        positionMs: currentPositionMs(),
        durationMs: player.video?.duration ?? 0,
        stopped,
        endMarginMs: SONG_END_MARGIN_MS,
        stopToleranceMs: SONG_END_STOP_TOLERANCE_MS,
      });
    },
    retry() {
      // 読み込み失敗の状態のときだけ再ロードする。読み込み中・確定・設定エラーでは何もしない。
      const attempt = machine.beginRetryAttempt();
      if (attempt !== null) {
        runLoad(attempt);
      }
    },
    primeAudioPermission() {
      // 題名の操作の最中に音声再生の許可を確立する最善努力。
      // 再生開始→先頭へ戻す→停止 の順。無害なメッセージがコンソールに出ることがある（docs/runbooks/textalive.md）。
      // 音漏れ対策の音量一時0化は実機確認のうえ採否を決めるため、ここでは行わない。
      try {
        player.requestPlay();
        player.requestMediaSeek(0);
        player.requestPause();
      } catch {
        // 許可の確立に失敗しても「触れて再生」表示が再生開始を担うため、ここでは握りつぶす。
      }
    },
    dispose() {
      player.removeListener(listener);
      player.dispose();
    },
  };
}
