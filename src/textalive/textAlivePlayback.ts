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
import {
  createPlayerMusicMapSource,
  type MusicMapSource,
  type TextAlivePlayerLike,
  type LyricsTransform,
} from "./musicMap";
import type { LyricSourceVideo } from "./lyricsTimeline";

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

/**
 * 楽曲（背景音楽）の再生音量の目標値（TextAlive の IPlayer.volume、範囲0から100の線形振幅）。
 * 採用理由を先に述べる。楽曲の音量が大きすぎてタップ操作音とのバランスが悪いとの実機所見を踏まえ、楽曲を約3デシベル下げる。
 * デシベル差dの線形振幅倍率は10^(d/20)で、マイナス3デシベルは10^(-3/20)≒0.708。既定の100に対し100×0.708≒70.8を整数で71とする。
 * マイナス3デシベルを採るのは、楽曲を主役に保ちながら大きすぎる音量を確実に下げる控えめな低下で、操作音側の+3デシベルと合わせて
 * 操作音を楽曲に対して約6デシベル前に出すためである。
 */
const BGM_PLAYBACK_VOLUME = 71;

export interface TextAlivePlaybackOptions {
  song: Song;
  /**
   * TextAlive アプリトークン。未設定または空文字なら設定エラーにする。
   * 型を string | undefined にする理由を述べる。トークンはビルド時に vite.config.ts の define で注入され、
   * 環境変数が無いときは undefined が注入されるため、実行時に undefined となり得る。
   */
  token: string | undefined;
  /** 歌詞構造への変換（横展開）。「こたえて」のコーラス補正（Issue #90）を実行時の歌詞へ適用するために渡す。
   *  曲ごとに適用可否を切り替えるため、呼び出し側（統括）が現在の曲を見て分岐する関数を渡す。渡さない場合は無変換。
   *  音楽地図ソースの lyricsVideo にだけ作用し、拍・コーラス区間・声量には影響しない。 */
  lyricsTransform?: LyricsTransform;
}

/**
 * 実プレイヤーによる再生を作る。
 * トークンが未設定または空のときはプレイヤーを生成せず設定エラーにする。理由は、トークンはビルド時に注入されるため
 * 実行時の再試行では復旧せず、また API を呼ばないことでライフサイクル由来のエラーを出さないため。
 */
export function createTextAlivePlayback(options: TextAlivePlaybackOptions): Playback {
  const { token, lyricsTransform } = options;
  // 現在読み込む課題曲。題名画面の曲選択で loadSong により別の曲へ差し替える（同一プレイヤーで読み込み直す）。
  let currentSong = options.song;

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
      setVolume() {},
      hasStarted: () => false,
      hasEnded: () => false,
      retry() {},
      // 設定エラーでは曲を読み込めないため、曲の差し替えも何もしない。
      loadSong() {},
      primeAudioPermission() {},
      // 設定エラーでは音楽地図を供給できない。準備完了を常に偽とし、空の値を返す（呼び出し側は isReady で弾く）。
      musicMap: (): MusicMapSource => ({
        isReady: () => false,
        lyricsVideo: () => ({ phrases: [] } as unknown as LyricSourceVideo),
        beatStartTimesMs: () => [],
        chorusRanges: () => [],
        vocalAmplitudeAt: () => 0,
        songEndMs: () => 0,
      }),
      dispose() {},
    };
  }

  // ---- 通常: プレイヤーを生成して結線 ----
  const machine = createLoadStateMachine();
  let started = false;
  let stopped = false;
  // プレイ開始時に、先頭付近での再生を確認してから音量を再生用音量へ戻すための保留状態。
  let volumeRestorePending = false;
  // 利用者のマスター音量倍率（0以上1以下）。基準再生音量 BGM_PLAYBACK_VOLUME へ掛ける。既定は1（基準音量）。
  let masterVolumeFactor = 1;
  // 現在 player.volume が再生音量に復元されている（無音化していない）か。音量つまみの即時反映の可否に使う。
  let volumeRestored = false;
  // 確定の試行照合に使う2つの観測。理由を先に述べる。曲を読み込み直したとき、古い曲の確定通知が新しい曲の
  // 読み込み中に届いて誤って確定するのを、外部ライブラリの挙動に頼らず状態機械側でも防ぐためである。
  // playerTimerReady は再生タイマーが一度でも使えるようになったか（プレイヤーの能力）。一度真になったら戻さない。
  // 戻さない理由を先に述べる。読み込みごとに偽へ戻すと、古い曲の遅延した onTimerReady が偽を真へ戻し、新しい曲の
  // 映像解決と重なって新しい曲のタイマー準備前に誤って確定する余地が生まれる。タイマーはプレイヤー単位の能力として
  // 一度きりの観測にし、曲ごとの確定可否は試行番号付きの映像解決（latestResolvedAttempt）で判断する。
  // latestResolvedAttempt は最後に映像が用意できた試行番号で、createFromSongUrl が返す約束（その呼び出し＝その試行に固有）の
  // 解決時に記録する。確定は「タイマーが使える」かつ「最新の試行の映像が解決済み」のときだけ行う。順序のどちらが先でも
  // 取りこぼさないよう、両方の観測点（onTimerReady と約束の解決）から照合する。
  let playerTimerReady = false;
  let latestResolvedAttempt = -1;

  const mediaElement = document.getElementById(MEDIA_ELEMENT_ID);
  const player = new Player({
    app: { token },
    // 声量・感情は初期化時のみ指定でき、後続のキネティックタイポ（M3）等が必要とするため有効化する。
    vocalAmplitudeEnabled: true,
    valenceArousalEnabled: true,
    ...(mediaElement ? { mediaElement } : {}),
  });

  // 再生用の音量を目標値 BGM_PLAYBACK_VOLUME に定める。採用理由を先に述べる。
  // TextAlive の IPlayer.volume は0〜100の線形振幅で既定は100だが、その既定値は楽曲が大きすぎてタップ操作音との
  // バランスが悪い。本アプリはホスト管理ではなく自前で楽曲を読み込むため、再生音量を明示的に目標値へ定めるのが正しい。
  // プレイヤーの現在値（既定の100）を読むのではなく目標値を用いることで楽曲音量を確実に下げる。
  // この値は、許可確立（primeAudioPermission）とプレイ開始時に0へ無音化したあと、再生開始の観測時に戻す復元処理が用いる。
  // 利用者のマスター音量倍率を掛けた、実際に戻す再生音量を求める。倍率0で無音、1で基準再生音量になる。
  function targetPlaybackVolume(): number {
    return BGM_PLAYBACK_VOLUME * masterVolumeFactor;
  }

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
      player.volume = targetPlaybackVolume();
      volumeRestorePending = false;
      volumeRestored = true;
    }
  }

  const timeSource = createReadyGatedTimeSource(
    { positionMs: currentPositionMs, isPlaying: () => player.isPlaying },
    isReady
  );

  // 「タイマーが使える」かつ「最新試行の映像が解決済み」のときだけ確定する。読み込み中以外では markReady が無視するため、
  // 確定・エラー後に届いた遅延通知は反映されない。
  function settleReady(): void {
    if (playerTimerReady && machine.isLatestAttempt(latestResolvedAttempt)) {
      machine.markReady();
    }
  }

  // 渡された試行番号で同一プレイヤーに楽曲を読み込む。映像準備の成否は試行番号で取り違えを防ぐ。確定は最新試行の
  // 映像解決とタイマー準備が揃ったときだけ行う（settleReady）。
  function runLoad(attempt: number): void {
    player
      .createFromSongUrl(currentSong.songUrl, { video: currentSong.video })
      .then(() => {
        // この試行の映像が用意できた（ライフサイクル上 onTimerReady より前に解決する）。最新試行であれば確定の前提が整う。
        latestResolvedAttempt = attempt;
        settleReady();
      })
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
      // 再生タイマーが使えるようになった（プレイヤーの能力。一度きりの観測として持続させる）。最新試行の映像解決と
      // 揃ったときだけ確定する（古い曲の確定通知を弾く）。
      playerTimerReady = true;
      settleReady();
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
      volumeRestored = false;
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
    setVolume(volumePercent: number) {
      // 0以上100以下へ丸めて倍率（0以上1以下）に直す。非有限は基準（1）へ倒す。
      const clampedPercent = !Number.isFinite(volumePercent)
        ? 100
        : volumePercent < 0
          ? 0
          : volumePercent > 100
            ? 100
            : volumePercent;
      masterVolumeFactor = clampedPercent / 100;
      // 再生音量に復元済み（音漏れ防止の無音化中でない）ときだけ即時反映する。無音化中（許可確立・先頭移動の途中）は
      // 倍率を覚えるだけにし、復元時に targetPlaybackVolume が反映する（途中位置の音漏れを防ぐ）。
      if (volumeRestored) {
        player.volume = targetPlaybackVolume();
      }
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
    loadSong(nextSong) {
      // 別の課題曲を同一プレイヤーで読み込み直す。試行番号を更新して読み込み中へ戻し、新しい曲を読み込む。
      // 時間源は同一プレイヤーの再生位置を読むため有効なまま保たれ、再生開始の先頭移動は beginFromStart が担う。
      currentSong = nextSong;
      runLoad(machine.beginAttempt());
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
    // 音楽地図ソースは TextAlive の Player を裏側に持つ。準備完了（onTimerReady 後）は isReady で判定する。
    // Player の構造は TextAlivePlayerLike を満たすが、外部ライブラリの型との照合を避けるため明示的に写す。
    musicMap: (): MusicMapSource =>
      createPlayerMusicMapSource(player as unknown as TextAlivePlayerLike, isReady, lyricsTransform),
    dispose() {
      player.removeListener(listener);
      player.dispose();
    },
  };
}
