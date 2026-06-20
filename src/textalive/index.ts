// textalive サブシステムの公開窓口。統括（src/app）が再生抽象を生成するために用いる。
// 純粋ロジック（playback.ts）は内部実装であり、外部へは再生抽象とその生成関数だけを公開する。

export type { Playback, PlaybackState } from "./playback";
export { createTextAlivePlayback } from "./textAlivePlayback";
export type { TextAlivePlaybackOptions } from "./textAlivePlayback";
export { createFakePlayback } from "./fakePlayback";

// 歌詞タイムライン橋渡し（Issue #133）。本編結線（#59）がサブシステム境界越しに利用する。
export {
  buildLyricsTimeline,
  phraseAt,
  wordAt,
  charAt,
  findLyricsTimelineIssues,
} from "./lyricsTimeline";
export type {
  LyricSourceChar,
  LyricSourceWord,
  LyricSourcePhrase,
  LyricSourceVideo,
  LyricCharUnit,
  LyricWordUnit,
  LyricPhraseUnit,
  LyricsTimeline,
  LyricsTimelineIssue,
} from "./lyricsTimeline";
