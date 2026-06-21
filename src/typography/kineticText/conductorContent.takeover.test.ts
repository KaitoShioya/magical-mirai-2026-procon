// TAKEOVER 実データによる読ませる役の被覆検証（Issue #33）。
// docs/analysis/takeover.songmap.json（実音楽地図ダンプ）から音楽地図ソースを作り、駆動部の内容を組み立て、
// 空のタイポ譜面（既定配置に委ねる）でも全90フレーズの発声中に読ませる役が切れ目なく存在することを固定する。
// これにより、擬似2フレーズだけでなく実データの全フレーズで被覆が成り立つことを自動で確かめる。

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { prepareConductorContent } from "./conductorContent";
import { findReadingCoverageGaps } from "./readingLayout";
import { createEffectRegistry } from "./effectElement";
import { charSmash } from "./effects/charSmash";
import { createFakeMusicMapSource } from "../../textalive/musicMap";
import type { LyricSourceVideo } from "../../textalive/lyricsTimeline";
import {
  takeoverTypographyChart,
  TAKEOVER_DEFAULT_READING_PIXEL_HEIGHT,
  TAKEOVER_DEFAULT_READING_REGION,
} from "../../profiles/takeover/typographyChart";

// 実音楽地図ダンプを読む。テストファイルからの相対で repo 直下の docs を指す（作業ディレクトリに依存しない）。
interface SongmapChar { startTime: number; endTime: number; text: string }
interface SongmapWord { startTime: number; endTime: number; text: string; chars: SongmapChar[] }
interface SongmapPhrase { startTime: number; endTime: number; text: string; words: SongmapWord[] }
interface Songmap {
  song: { duration: number };
  beats: { startTime: number }[];
  segments: { startTime: number; endTime: number }[];
  phrases: SongmapPhrase[];
}

const songmapUrl = new URL("../../../docs/analysis/takeover.songmap.json", import.meta.url);
const songmap = JSON.parse(readFileSync(songmapUrl, "utf8")) as Songmap;

// songmap は words/chars の鍵を持つ。歌詞構造（buildLyricsTimeline が読む children の鍵）へ写す。
const lyricsVideo = {
  phrases: songmap.phrases.map((phrase) => ({
    startTime: phrase.startTime,
    endTime: phrase.endTime,
    text: phrase.text,
    children: phrase.words.map((word) => ({
      startTime: word.startTime,
      endTime: word.endTime,
      text: word.text,
      children: word.chars.map((ch) => ({ startTime: ch.startTime, endTime: ch.endTime, text: ch.text })),
    })),
  })),
} as unknown as LyricSourceVideo;

const source = createFakeMusicMapSource({
  lyricsVideo,
  beatStartTimesMs: songmap.beats.map((b) => b.startTime),
  chorusRanges: songmap.segments.map((s) => ({ startTimeMs: s.startTime, endTimeMs: s.endTime })),
  // 被覆は声量に依らないため一定値とする（声量は粒度判定に影響するが被覆の成否は変えない）。
  constantVocalAmplitude: 50,
  songEndMs: songmap.song.duration,
});

function buildContent(viewportPixelWidth: number, viewportPixelHeight: number) {
  const registry = createEffectRegistry();
  registry.register(charSmash);
  return prepareConductorContent({
    source,
    registry,
    chart: takeoverTypographyChart,
    emotionAvailable: false,
    viewportPixelWidth,
    viewportPixelHeight,
    defaultReadingUnit: "phrase",
    defaultReadingPixelHeight: TAKEOVER_DEFAULT_READING_PIXEL_HEIGHT,
    defaultReadingRegion: TAKEOVER_DEFAULT_READING_REGION,
  });
}

describe("TAKEOVER 実データの読ませる役の被覆", () => {
  it("歌詞タイムラインが既知の規模（90フレーズ・1157字）になる", () => {
    const content = buildContent(1170, 2532);
    expect(content.timeline.phraseCount).toBe(90);
    expect(content.timeline.charCount).toBe(1157);
  });

  it("一般的な縦長スマートフォンの画面で全フレーズが切れ目なく被覆される", () => {
    // 390×844 を画素密度3とみなした 1170×2532。
    const content = buildContent(1170, 2532);
    const gaps = findReadingCoverageGaps(content.timeline, content.spansByPhrase, songmap.song.duration);
    expect(gaps).toEqual([]);
  });

  it("狭い画面で長フレーズの分割が多発しても被覆に隙間が無い", () => {
    const content = buildContent(320, 600);
    const gaps = findReadingCoverageGaps(content.timeline, content.spansByPhrase, songmap.song.duration);
    expect(gaps).toEqual([]);
  });
});
