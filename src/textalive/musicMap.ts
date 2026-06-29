// 音楽地図ソース（Issue #33）。
//
// 役割: 表示粒度プランの組み立てに要する音楽データ（歌詞・ビート開始時刻・コーラス区間・声量・曲長）を、
// 読取専用の窓口として供給する。実再生は TextAlive の Player を裏側に持ち、診断・テストは決定的な擬似データを返す。
// 再生抽象 Playback の責務（再生位置と状態）とは別の窓口として切り出す。これにより、将来 Issue #46 が生成した
// 曲プロファイルから取得元を実装し直すときも、同じ窓口を満たすだけで差し替えられる。
//
// 依存の向き: 本ファイルは typography（表示粒度の型）を import しない。GranularityInput の組み立て（声量曲線の
// 標本化など typography の型を要する処理）は、この窓口を入力に取る typography 層・結線層で行う。

import type { LyricSourceVideo } from "./lyricsTimeline";

/** 区間（コーラスなど）の時間範囲。 */
export interface MusicMapRange {
  readonly startTimeMs: number;
  readonly endTimeMs: number;
}

/** 音楽データの読取窓口。準備完了の前は有効な値を返さない（isReady で確認してから読む）。 */
export interface MusicMapSource {
  /** 準備完了（歌詞・音楽地図・再生タイマーが揃った）か。 */
  isReady(): boolean;
  /** 歌詞構造（buildLyricsTimeline へ渡す形）。 */
  lyricsVideo(): LyricSourceVideo;
  /** ビート開始時刻の昇順配列（ミリ秒）。 */
  beatStartTimesMs(): readonly number[];
  /** コーラス区間の昇順配列。 */
  chorusRanges(): readonly MusicMapRange[];
  /** 指定時刻の声量。 */
  vocalAmplitudeAt(timeMs: number): number;
  /** 曲の終了時刻（ミリ秒）。 */
  songEndMs(): number;
}

// ---- TextAlive の Player を裏側に持つ実装 ----

/** 文字（TextAlive の IChar が構造的に満たす最小形）。 */
interface RawChar {
  readonly startTime: number;
  readonly endTime: number;
  readonly text: string;
}
/** 単語（IWord）。children は文字。 */
interface RawWord {
  readonly startTime: number;
  readonly endTime: number;
  readonly text: string;
  readonly children: readonly RawChar[];
}
/** フレーズ（IPhrase）。children は単語、next は次フレーズ。 */
interface RawPhrase {
  readonly startTime: number;
  readonly endTime: number;
  readonly text: string;
  readonly children: readonly RawWord[];
  readonly next: RawPhrase | null;
}
/** 映像（IVideo）。firstPhrase から next で辿る。duration は曲長（ミリ秒）。 */
interface RawVideo {
  readonly firstPhrase: RawPhrase | null;
  readonly duration: number;
}
/** Player のうち本ソースが使う最小形（TextAlive の Player が構造的に満たす）。 */
export interface TextAlivePlayerLike {
  getBeats(): readonly { readonly startTime: number }[];
  getChoruses(): readonly { readonly startTime: number; readonly endTime: number }[];
  getVocalAmplitude(timeMs: number): number;
  readonly video: RawVideo;
}

/** firstPhrase から next で辿り、children で単語・文字を取り、歌詞構造を作る（word.next・char.next は使わない）。 */
function buildLyricsVideoFromPlayer(video: RawVideo): LyricSourceVideo {
  const phrases: {
    startTime: number;
    endTime: number;
    text: string;
    children: { startTime: number; endTime: number; text: string; children: RawChar[] }[];
  }[] = [];
  let phrase = video.firstPhrase;
  while (phrase) {
    const children = phrase.children.map((word) => ({
      startTime: word.startTime,
      endTime: word.endTime,
      text: word.text,
      children: word.children.map((ch) => ({ startTime: ch.startTime, endTime: ch.endTime, text: ch.text })),
    }));
    phrases.push({ startTime: phrase.startTime, endTime: phrase.endTime, text: phrase.text, children });
    phrase = phrase.next;
  }
  return { phrases } as unknown as LyricSourceVideo;
}

/** 歌詞構造への曲固有の変換（横展開）。「こたえて」はコーラス補正（Issue #90）をここで適用する。変換を渡さない曲は無変換。 */
export type LyricsTransform = (video: LyricSourceVideo) => LyricSourceVideo;

/**
 * TextAlive の Player を裏側に持つ音楽地図ソースを作る。isReady は外（再生抽象 Playback の準備完了状態）から渡す。
 * 準備完了の前に読み取ると不正確な値になるため、呼び出し側は isReady を確認してから読む。
 * lyricsTransform を渡すと、歌詞構造（buildLyricsVideoFromPlayer の結果）へ曲固有の変換を適用してから返す。
 */
export function createPlayerMusicMapSource(
  player: TextAlivePlayerLike,
  isReady: () => boolean,
  lyricsTransform?: LyricsTransform
): MusicMapSource {
  return {
    isReady,
    lyricsVideo: () => {
      const video = buildLyricsVideoFromPlayer(player.video);
      return lyricsTransform ? lyricsTransform(video) : video;
    },
    beatStartTimesMs: () => player.getBeats().map((b) => b.startTime),
    chorusRanges: () =>
      player.getChoruses().map((c) => ({ startTimeMs: c.startTime, endTimeMs: c.endTime })),
    vocalAmplitudeAt: (timeMs) => player.getVocalAmplitude(timeMs),
    songEndMs: () => player.video.duration,
  };
}

// ---- 決定的な擬似実装（診断・テスト用、トークン非依存）----

/** 擬似音楽地図ソースの定義。被覆・分割・同期の検証が意味を持つ最小データを与える。 */
export interface FakeMusicMapSpec {
  readonly lyricsVideo: LyricSourceVideo;
  readonly beatStartTimesMs: readonly number[];
  readonly chorusRanges: readonly MusicMapRange[];
  /** 一定値の声量（曲全体で同じ値を返す）。粒度判定が声量データ有りとして動くよう正の値にする。 */
  readonly constantVocalAmplitude: number;
  readonly songEndMs: number;
}

/** 与えた仕様を返すだけの擬似音楽地図ソース。isReady は常に true。 */
export function createFakeMusicMapSource(spec: FakeMusicMapSpec): MusicMapSource {
  return {
    isReady: () => true,
    lyricsVideo: () => spec.lyricsVideo,
    beatStartTimesMs: () => spec.beatStartTimesMs,
    chorusRanges: () => spec.chorusRanges,
    vocalAmplitudeAt: () => spec.constantVocalAmplitude,
    songEndMs: () => spec.songEndMs,
  };
}
