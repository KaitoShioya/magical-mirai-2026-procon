// 音楽地図ソース（Issue #33）の単体テスト。
// 実プレイヤー擬似からの歌詞走査・ビート・コーラス・曲長の取得と、決定的な擬似ソースを固定する。

import { describe, it, expect } from "vitest";
import {
  createPlayerMusicMapSource,
  createFakeMusicMapSource,
  type TextAlivePlayerLike,
} from "./musicMap";
import { buildLyricsTimeline } from "./lyricsTimeline";
import type { LyricSourceVideo } from "./lyricsTimeline";

function makeChar(t0: number, t1: number, text: string) {
  return { startTime: t0, endTime: t1, text };
}

function fakePlayer(): TextAlivePlayerLike {
  const p1 = {
    startTime: 1000,
    endTime: 1200,
    text: "うえ",
    children: [
      { startTime: 1000, endTime: 1200, text: "うえ", children: [makeChar(1000, 1100, "う"), makeChar(1100, 1200, "え")] },
    ],
    next: null,
  };
  const p0 = {
    startTime: 0,
    endTime: 200,
    text: "あい",
    children: [
      { startTime: 0, endTime: 200, text: "あい", children: [makeChar(0, 100, "あ"), makeChar(100, 200, "い")] },
    ],
    next: p1,
  };
  return {
    getBeats: () => [{ startTime: 0 }, { startTime: 343 }, { startTime: 686 }],
    getChoruses: () => [{ startTime: 0, endTime: 200 }],
    getVocalAmplitude: (t: number) => (t < 200 ? 50 : 10),
    video: { firstPhrase: p0, duration: 1300 },
  };
}

describe("createPlayerMusicMapSource 実プレイヤーからの取得", () => {
  const source = createPlayerMusicMapSource(fakePlayer(), () => true);

  it("ビート開始時刻を昇順配列で返す", () => {
    expect(source.beatStartTimesMs()).toEqual([0, 343, 686]);
  });

  it("コーラス区間を時間範囲で返す", () => {
    expect(source.chorusRanges()).toEqual([{ startTimeMs: 0, endTimeMs: 200 }]);
  });

  it("曲長を映像の duration から返す", () => {
    expect(source.songEndMs()).toBe(1300);
  });

  it("声量を指定時刻で返す", () => {
    expect(source.vocalAmplitudeAt(50)).toBe(50);
    expect(source.vocalAmplitudeAt(500)).toBe(10);
  });

  it("歌詞構造は next で辿った全フレーズを含み、buildLyricsTimeline で消費できる", () => {
    const timeline = buildLyricsTimeline(source.lyricsVideo());
    expect(timeline.phraseCount).toBe(2);
    expect(timeline.charCount).toBe(4);
    expect(timeline.phrases[0].text).toBe("あい");
    expect(timeline.phrases[1].text).toBe("うえ");
  });
});

describe("createFakeMusicMapSource 擬似ソース", () => {
  const lyricsVideo = {
    phrases: [
      { startTime: 0, endTime: 100, text: "あ", children: [{ startTime: 0, endTime: 100, text: "あ", children: [{ startTime: 0, endTime: 100, text: "あ" }] }] },
    ],
  } as unknown as LyricSourceVideo;

  const source = createFakeMusicMapSource({
    lyricsVideo,
    beatStartTimesMs: [0, 100],
    chorusRanges: [{ startTimeMs: 0, endTimeMs: 100 }],
    constantVocalAmplitude: 42,
    songEndMs: 100,
  });

  it("準備完了は常に真", () => {
    expect(source.isReady()).toBe(true);
  });

  it("与えた仕様をそのまま返す", () => {
    expect(source.beatStartTimesMs()).toEqual([0, 100]);
    expect(source.chorusRanges()).toEqual([{ startTimeMs: 0, endTimeMs: 100 }]);
    expect(source.vocalAmplitudeAt(0)).toBe(42);
    expect(source.vocalAmplitudeAt(999)).toBe(42);
    expect(source.songEndMs()).toBe(100);
  });
});
