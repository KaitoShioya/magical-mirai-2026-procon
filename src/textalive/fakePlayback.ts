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
import { createFakeMusicMapSource, type MusicMapSource } from "./musicMap";
import type { LyricSourceVideo } from "./lyricsTimeline";

/**
 * 擬似再生の楽曲長（ミリ秒）。
 * 採用理由を先に述べる。スモーク検証はフレーム率下限を毎秒5フレーム（1フレーム200ミリ秒）と見込む
 * （scripts/screens-smoke.mjs）。再生開始から数フレームで終了へ到達し、かつ終了の余白
 * （SONG_END_MARGIN_MS）より十分に長い値として800ミリ秒を採る。再生位置は実時間で進むため、
 * フレーム率に依らず再生開始からおよそ680ミリ秒（800 − 120）で終了とみなされる。
 */
const FAKE_DURATION_MS = 800;

/**
 * 擬似再生の音楽地図ソースを作る。被覆・分割・同期の検証が意味を持つ最小データを、擬似再生の楽曲長
 * （FAKE_DURATION_MS = 800ミリ秒）の中に収める。短いフレーズ・1行に収まらない長いフレーズ・英数字混在フレーズの
 * 3つを順に置き、それらを覆うビート列とコーラス区間1つ、一定の声量を返す。
 */
function createFakeMusicMap(): MusicMapSource {
  // フレーズ0（短、0〜200）、フレーズ1（長、200〜520）、フレーズ2（英数字混在、520〜800）。
  function phrase(text: string, startTime: number, perChar: number) {
    const chars = Array.from(text);
    return {
      startTime,
      endTime: startTime + chars.length * perChar,
      text,
      children: [
        {
          startTime,
          endTime: startTime + chars.length * perChar,
          text,
          children: chars.map((ch, i) => ({
            startTime: startTime + i * perChar,
            endTime: startTime + (i + 1) * perChar,
            text: ch,
          })),
        },
      ],
    };
  }
  const lyricsVideo = {
    phrases: [phrase("てすと", 0, 60), phrase("ながいフレーズのれい", 200, 32), phrase("Clap to Beat", 520, 23)],
  } as unknown as LyricSourceVideo;
  const beatStartTimesMs: number[] = [];
  for (let t = 0; t < FAKE_DURATION_MS; t += 100) {
    beatStartTimesMs.push(t);
  }
  return createFakeMusicMapSource({
    lyricsVideo,
    beatStartTimesMs,
    chorusRanges: [{ startTimeMs: 0, endTimeMs: 200 }],
    constantVocalAmplitude: 50,
    songEndMs: FAKE_DURATION_MS,
  });
}

/** 擬似再生を作る。状態は常に確定（読み込み待ちは無い）。 */
export function createFakePlayback(): Playback {
  const readyState: PlaybackState = { status: "ready" };
  const fakeMusicMap = createFakeMusicMap();

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
    // 擬似再生は音声を持たないため、音量設定は何もしない（診断・スモークでの結線整合のためにだけ用意する）。
    setVolume() {},
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
    musicMap: () => fakeMusicMap,
    dispose() {
      playing = false;
    },
  };
}
