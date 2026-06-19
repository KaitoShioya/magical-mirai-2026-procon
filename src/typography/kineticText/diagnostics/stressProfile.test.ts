import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  extractCharOnsets,
  uniqueCharsOf,
  buildRealReplayProfile,
  buildMaxLoadProfile,
} from "./stressProfile";
import { computeMaxConcurrent, maxStartsInWindow } from "../layerLimits";

const fakeSongmap = {
  phrases: [
    {
      words: [
        {
          chars: [
            { text: "あ", startTime: 0, endTime: 100 },
            { text: "い", startTime: 200, endTime: 500 },
          ],
        },
      ],
    },
    {
      words: [{ chars: [{ text: "あ", startTime: 600, endTime: 620 }] }],
    },
  ],
};

describe("extractCharOnsets（songmapの木構造から文字の開始時刻列を取り出す）", () => {
  it("phrases→words→chars を辿り、継続時間を求める", () => {
    const onsets = extractCharOnsets(fakeSongmap);
    expect(onsets).toHaveLength(3);
    expect(onsets[0]).toEqual({ char: "あ", startTimeMs: 0, durationMs: 100 });
    expect(onsets[1]).toEqual({ char: "い", startTimeMs: 200, durationMs: 300 });
  });
});

describe("uniqueCharsOf（一意な文字の並び）", () => {
  it("重複を除く", () => {
    const onsets = extractCharOnsets(fakeSongmap);
    expect([...uniqueCharsOf(onsets)].sort()).toEqual(["あ", "い"]);
  });
});

describe("buildRealReplayProfile（実測再現の出現計画）", () => {
  it("開始時刻順の出現と、短音率（継続時間150ミリ秒以下）を返す", () => {
    const onsets = extractCharOnsets(fakeSongmap);
    const profile = buildRealReplayProfile(onsets, 1372);
    expect(profile.total).toBe(3);
    expect(profile.events.map((event) => event.atMs)).toEqual([0, 200, 600]);
    expect(profile.events.every((event) => event.lifetimeMs === 1372)).toBe(true);
    // 継続時間100と20が150以下、300は超える → 2/3。
    expect(profile.shortRatio).toBeCloseTo(2 / 3, 5);
  });
});

describe("buildMaxLoadProfile（最大負荷の出現計画）", () => {
  it("単一層を同時上限まで同時刻で出し、一括層は上限文字数のフレーズにする", () => {
    const profile = buildMaxLoadProfile({ singleLimit: 4, batchedLimit: 6, charSample: "あい" });
    expect(profile.singleEvents).toHaveLength(4);
    expect(profile.singleEvents.every((event) => event.atMs === 0)).toBe(true);
    expect(profile.batchedPhraseLength).toBe(6);
  });
});

describe("実データ検証（docs/analysis/takeover.songmap.json）", () => {
  it("総文字数1157・一意307・短音率約54.5%・残存4拍で同時24", () => {
    const path = fileURLToPath(
      new URL("../../../../docs/analysis/takeover.songmap.json", import.meta.url)
    );
    const songmap = JSON.parse(readFileSync(path, "utf8"));
    const onsets = extractCharOnsets(songmap);
    expect(onsets).toHaveLength(1157);
    expect(uniqueCharsOf(onsets).length).toBe(307);
    const profile = buildRealReplayProfile(onsets, 1372);
    expect(profile.shortRatio).toBeGreaterThan(0.54);
    expect(profile.shortRatio).toBeLessThan(0.55);
    // 表示残存4拍（1拍=60000/175≈342.857ミリ秒、4拍≈1371.4ミリ秒）での同時存在最大。
    const starts = onsets.map((onset) => onset.startTimeMs);
    expect(computeMaxConcurrent(starts, (60000 / 175) * 4)).toBe(24);
    // 受け入れ基準の短時間集中（500ミリ秒12・1秒20・2秒31）。
    expect(maxStartsInWindow(starts, 500)).toBe(12);
    expect(maxStartsInWindow(starts, 1000)).toBe(20);
    expect(maxStartsInWindow(starts, 2000)).toBe(31);
  });
});
