// 診断モード（URLに ?smoke=1）用の擬似再生。
// トークン・ネットワーク・TextAlive 実体に依存せず決定的に動く。これによりスモーク検証は
// トークン無しで「題名→ウォームアップ→プレイ→（楽曲終了の自動検知で）結果」まで到達できる。

import {
  createReadyGatedTimeSource,
  isSongEnded,
  SONG_END_MARGIN_MS,
  SONG_END_STOP_TOLERANCE_MS,
  type Playback,
  type PlaybackState,
} from "./playback";

/**
 * 擬似再生の楽曲長（ミリ秒）。
 * 採用理由を先に述べる。スモーク検証はフレーム率下限を毎秒5フレーム（1フレーム200ミリ秒）と見込む
 * （scripts/screens-smoke.mjs）。再生開始から数フレームで終了へ到達し、かつ終了の余白
 * （SONG_END_MARGIN_MS）より十分に長い値として800ミリ秒を採る。再生位置は実時間で進むため、
 * フレーム率に依らず再生開始からおよそ680ミリ秒（800 − 120）で終了とみなされる。
 */
const FAKE_DURATION_MS = 800;

/** 擬似再生を作る。状態は常に確定（読み込み待ちは無い）。 */
export function createFakePlayback(): Playback {
  const readyState: PlaybackState = { status: "ready" };

  let started = false;
  let playing = false;
  // 再生位置は「停止までに積んだぶん」と「今回再生してからの実経過」の和で表す。
  let accumulatedMs = 0;
  let resumeEpochMs = 0;

  function now(): number {
    return performance.now();
  }

  function positionMs(): number {
    if (!started) {
      return 0;
    }
    const raw = playing ? accumulatedMs + (now() - resumeEpochMs) : accumulatedMs;
    return Math.min(raw, FAKE_DURATION_MS);
  }

  const timeSource = createReadyGatedTimeSource(
    { positionMs, isPlaying: () => playing },
    () => true
  );

  return {
    timeSource,
    getState: () => readyState,
    subscribe(listener) {
      // 状態は不変のため、購読時に一度だけ確定を通知する。
      listener(readyState);
      return () => {};
    },
    beginFromStart() {
      started = true;
      playing = true;
      accumulatedMs = 0;
      resumeEpochMs = now();
    },
    pause() {
      if (!playing) {
        return;
      }
      accumulatedMs += now() - resumeEpochMs;
      playing = false;
    },
    play() {
      if (playing) {
        return;
      }
      resumeEpochMs = now();
      playing = true;
    },
    hasStarted: () => started,
    hasEnded() {
      return isSongEnded({
        ready: true,
        playStarted: started,
        positionMs: positionMs(),
        durationMs: FAKE_DURATION_MS,
        stopped: false,
        endMarginMs: SONG_END_MARGIN_MS,
        stopToleranceMs: SONG_END_STOP_TOLERANCE_MS,
      });
    },
    retry() {
      // 擬似再生は失敗しないため、再試行で行うことはない。
    },
    primeAudioPermission() {
      // 擬似再生は実際の音声を持たないため、許可の確立は不要。
    },
    dispose() {
      playing = false;
    },
  };
}
