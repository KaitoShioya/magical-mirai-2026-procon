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
  latchStarted,
  SONG_END_MARGIN_MS,
  SONG_END_STOP_TOLERANCE_MS,
  type Playback,
} from "./playback";

/** 音声配置先要素の識別子。index.html で #app の外（body 直下）に置く。 */
const MEDIA_ELEMENT_ID = "audio-media";

/**
 * プレイ開始時に音量を再生用音量へ戻す再生位置の上限（ミリ秒）。
 * 採用理由を先に述べる。許可確立（primeAudioPermission）の無音再生がプレイ進入まで続いていた場合、
 * 先頭への移動（requestMediaSeek(0)）が反映される前は再生位置が途中（最大でウォームアップの長さの
 * およそ5000ミリ秒）にある。その途中位置で音量を戻すと音が漏れる。先頭へ移動した後に数フレーム進んだ程度の
 * 位置を十分に含み、かつおよそ5000ミリ秒の途中位置を確実に下回る区切りとして1000ミリ秒を採り、
 * 再生位置がこの値以下になってから音量を戻す。
 */
const VOLUME_RESTORE_MAX_POSITION_MS = 1000;

export interface TextAlivePlaybackOptions {
  song: Song;
  /**
   * TextAlive アプリトークン。未設定または空文字なら設定エラーにする。
   * 型を string | undefined にする理由を述べる。トークンはビルド時に vite.config.ts の define で注入され、
   * 環境変数が無いときは undefined が注入されるため、実行時に undefined となり得る。
   */
  token: string | undefined;
}

/**
 * 実プレイヤーによる再生を作る。
 * トークンが未設定または空のときはプレイヤーを生成せず設定エラーにする。理由は、トークンはビルド時に注入されるため
 * 実行時の再試行では復旧せず、また API を呼ばないことでライフサイクル由来のエラーを出さないため。
 */
export function createTextAlivePlayback(options: TextAlivePlaybackOptions): Playback {
  const { song, token } = options;

  // ---- トークン未設定: プレイヤーを生成せず設定エラー ----
  if (token === undefined || token.trim() === "") {
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
  // プレイ開始時に、先頭付近での再生を確認してから音量を再生用音量へ戻すための保留状態。
  let volumeRestorePending = false;

  const mediaElement = document.getElementById(MEDIA_ELEMENT_ID);
  const player = new Player({
    app: { token },
    // 声量・感情は初期化時のみ指定でき、後続のキネティックタイポ（M3）等が必要とするため有効化する。
    vocalAmplitudeEnabled: true,
    valenceArousalEnabled: true,
    ...(mediaElement ? { mediaElement } : {}),
  });

  // 再生用の音量をプレイヤー生成の直後に一度だけ捕捉する。採用理由を先に述べる。
  // 自動再生制限の解除（primeAudioPermission）では音量を0にして無音にするため、その0を後から取り込んで
  // 復元すると再生が無音のままになる。これを防ぐため、消音前のこの時点で一度だけ取り込み、以後は更新しない。
  // TextAlive の IPlayer.volume は0〜100の値で既定は100。数値でないか0以下のときは既定の100を用いる。
  const playbackVolume =
    typeof player.volume === "number" && player.volume > 0 ? player.volume : 100;

  const isReady = (): boolean => machine.getState().status === "ready";

  function currentPositionMs(): number {
    // 確定後（onTimerReady 後）のみ engine から呼ばれる契約だが、安全のため未確定時は0を返す。
    return player.timer?.position ?? 0;
  }

  // 現在の再生状態を観測して再生開始の掛け金（started）を更新する。
  // onPlay は「再生中でない状態から再生中へ移る」遷移でのみ発火し、既に再生中のときの requestPlay では
  // 発火しない。題名操作中の許可確立の再生がプレイ進入まで続くと onPlay だけでは開始を捉えられないため、
  // 実再生状態 player.isPlaying からも started を成立させる。
  function observePlaybackStart(): void {
    started = latchStarted(started, player.isPlaying);
    // 保留していた音量復元を、再生中かつ再生位置が先頭付近に達したときに行う。
    // プライムの無音再生が継続していて先頭への移動がまだ反映されていない（途中位置の）あいだは音量を0に保ち、
    // 途中位置の音が漏れない。先頭へ戻ってから有音にする。再生位置の上限の根拠は定数の宣言に記す。
    if (
      volumeRestorePending &&
      player.isPlaying &&
      currentPositionMs() <= VOLUME_RESTORE_MAX_POSITION_MS
    ) {
      player.volume = playbackVolume;
      volumeRestorePending = false;
    }
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
      // 先頭へ戻してから再生を開始する。再生開始は onPlay か、既に再生中の場合は hasStarted の観測で拾う。
      // 音量はここでは0のままにし、先頭付近での再生を確認してから observePlaybackStart が再生用音量へ戻す。
      // 理由を先に述べる。requestMediaSeek の反映は非同期で、戻り値だけでは先頭への移動完了を確認できない。
      // プライムの無音再生が継続していると、音量を同期的に戻すと先頭へ移動し終える前の途中位置の音が漏れ得る。
      // そこで音量復元を保留し、再生位置が先頭付近に達したことを観測してから戻すことで、途中位置の音漏れを防ぐ。
      started = false;
      stopped = false;
      volumeRestorePending = true;
      player.volume = 0;
      player.requestMediaSeek(0);
      player.requestPlay();
    },
    pause() {
      player.requestPause();
    },
    play() {
      player.requestPlay();
    },
    hasStarted() {
      // 現在の再生状態を観測して掛け金を更新したうえで返す（純粋な取得ではなく観測の副作用を持つ）。
      observePlaybackStart();
      return started;
    },
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
      // 自動再生の許可確立には利用者操作中の requestPlay が必要だが、そのままだとウォームアップ中に音が漏れる。
      // そこで先に音量を0にして無音で許可だけを確立する。再生開始→先頭へ戻す→停止 の順。
      // 無害なメッセージがコンソールに出ることがある（docs/runbooks/textalive.md）。
      // 再生用音量への復元はプレイ開始時の beginFromStart が必ず担うため、ここでは0のままにする。
      try {
        player.volume = 0;
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
