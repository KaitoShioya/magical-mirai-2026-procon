import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { generateShowcases, selectNonChorusPeaks } from "./showcases";
import { DEFAULT_SHOWCASE_OPTIONS, type ShowcaseInput } from "./types";
import { validateProfile } from "../schema/validateProfile";
import { minimalValidProfile } from "../schema/fixtures/minimalValidProfile";
import type { SongProfile } from "../schema/profileSchema";

// 実データ（TAKEOVERの音楽地図ダンプ）を素のデータファイルとして読む。src/tools/ への import は一切しない
// （profiles から tools への依存禁止に抵触しない）。songmap → ShowcaseInput の変換はテスト側で行い、
// 生成関数を songmap の形から切り離す。これは #45 の生成スクリプトが行う変換と同じである。
const songmapPath = fileURLToPath(new URL("../../../docs/analysis/takeover.songmap.json", import.meta.url));
const songmap = JSON.parse(readFileSync(songmapPath, "utf8")) as {
  song: { duration: number };
  amplitudeStep: number;
  amplitudeCurve: number[];
  segments: { startTime: number; endTime: number; isChorus: boolean }[];
  beats: { startTime: number }[];
  phrases: { words: { chars: { startTime: number }[] }[] }[];
};

function toShowcaseInput(): ShowcaseInput {
  const lyricCharOnsetsMs: number[] = [];
  for (const phrase of songmap.phrases) {
    for (const word of phrase.words) {
      for (const char of word.chars) {
        lyricCharOnsetsMs.push(char.startTime);
      }
    }
  }
  return {
    durationMs: songmap.song.duration,
    amplitudeCurve: songmap.amplitudeCurve,
    amplitudeStepMs: songmap.amplitudeStep,
    lyricCharOnsetsMs,
    chorusSegments: songmap.segments
      .filter((s) => s.isChorus)
      .map((s) => ({ startMs: s.startTime, endMs: s.endTime })),
    beatsMs: songmap.beats.map((b) => b.startTime),
  };
}

// 既定オプションの値を参照してマジックナンバー化を避ける（既定値が変わってもテストが追従する）。
const CLIMAX_ANCHOR_MS = DEFAULT_SHOWCASE_OPTIONS.climaxAnchorMs;
const CLIMAX_GUARD_MS = DEFAULT_SHOWCASE_OPTIONS.climaxGuardMs;
const PEAK_CONFIDENCE_RATIO = DEFAULT_SHOWCASE_OPTIONS.peakConfidenceRatio;
const TOLERANCE_MS = 1;
const chorusSegments = songmap.segments.filter((s) => s.isChorus);

function isInsideAnyChorus(timeMs: number): boolean {
  return chorusSegments.some((s) => timeMs >= s.startTime && timeMs < s.endTime);
}
function matchesChorusStart(startTimeMs: number): { startTime: number; endTime: number } | undefined {
  return chorusSegments.find((s) => Math.abs(s.startTime - startTimeMs) <= TOLERANCE_MS);
}

describe("見せ場マップ自動生成 実データ検証（Issue #41 受け入れ基準）", () => {
  const input = toShowcaseInput();
  const showcases = generateShowcases(input);

  it("達成基準1: 見せ場がちょうど6個", () => {
    expect(showcases).toHaveLength(6);
  });

  it("達成基準2: 3つの chorus 区間が見せ場として現れ開始が一致、非climax chorus は終端も一致", () => {
    for (const seg of chorusSegments) {
      const matched = showcases.find((s) => Math.abs(s.startTimeMs - seg.startTime) <= TOLERANCE_MS);
      expect(matched, `chorus開始 ${seg.startTime}ms に対応する見せ場`).toBeDefined();
      if (!matched!.isClimax) {
        expect(Math.abs(matched!.endTimeMs - seg.endTime)).toBeLessThanOrEqual(TOLERANCE_MS);
      }
    }
  });

  it("達成基準3: climax は1つで最終chorus由来・終端189秒以上・weight1.0で厳密に最大", () => {
    const climaxes = showcases.filter((s) => s.isClimax);
    expect(climaxes).toHaveLength(1);
    const climax = climaxes[0];
    // 最終 chorus（開始165674.6ms）に対応する。
    const lastChorus = chorusSegments[chorusSegments.length - 1];
    expect(Math.abs(climax.startTimeMs - lastChorus.startTime)).toBeLessThanOrEqual(TOLERANCE_MS);
    expect(climax.endTimeMs).toBeGreaterThanOrEqual(CLIMAX_ANCHOR_MS);
    expect(climax.weight).toBe(1.0);
    for (const s of showcases) {
      if (!s.isClimax) expect(s.weight).toBeLessThan(climax.weight);
    }
  });

  it("達成基準4: 非chorus3点は chorus 外かつ climax ガード外・互いに20秒以上・各信頼比0.6以上（約25/63/138秒、約193秒は除外）", () => {
    const peaks = selectNonChorusPeaks(input);
    expect(peaks).toHaveLength(3);

    const lastChorus = chorusSegments[chorusSegments.length - 1];
    const guardLow = lastChorus.startTime - CLIMAX_GUARD_MS;
    const guardHigh = CLIMAX_ANCHOR_MS + CLIMAX_GUARD_MS; // climax 窓は終端が189000まで延長される
    for (const p of peaks) {
      expect(isInsideAnyChorus(p.timeMs), `${p.timeMs}ms が chorus 外`).toBe(false);
      const inGuard = p.timeMs >= guardLow && p.timeMs <= guardHigh;
      expect(inGuard, `${p.timeMs}ms が climax ガード外`).toBe(false);
      expect(p.compositeRatio).toBeGreaterThanOrEqual(PEAK_CONFIDENCE_RATIO);
    }
    // 互いに20秒以上離れている。
    const times = peaks.map((p) => p.timeMs).sort((a, b) => a - b);
    for (let i = 1; i < times.length; i++) {
      expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(20000);
    }
    // 約25/63/138秒に位置し、約193秒は含まれない。
    const near = (t: number, target: number) => Math.abs(t - target) <= 3000;
    expect(times.some((t) => near(t, 25000))).toBe(true);
    expect(times.some((t) => near(t, 63000))).toBe(true);
    expect(times.some((t) => near(t, 138000))).toBe(true);
    expect(times.some((t) => near(t, 193000))).toBe(false);
  });

  it("達成基準5: 生成した showcases が validateProfile の見せ場規則に適合する（showcases 経路のエラーが0件）", () => {
    // 本基準が確かめるのは「生成した見せ場が validateProfile の見せ場規則（非空・index非負整数・時刻有限・
    // 昇順かつ非重複・[0,durationMs]内・weight0〜1・isClimaxちょうど1つ）を満たすこと」に限る。
    // minimalValidProfile は曲長4000 msの実例のため、曲長を実データの237250 msへ替えると他フィールド
    //（chords・slots・lyricDensity 等の被覆）が曲長を覆わず result.ok は false になる。それらは本Issueの
    // 範囲外（#46がTAKEOVERの全フィールドを生成する）なので、ここでは showcases から始まる path の
    // エラーだけを抽出して0件であることを確かめる。result.ok 全体の合格は #46 の責務とする。
    const profile = structuredClone(minimalValidProfile) as SongProfile;
    profile.song.durationMs = input.durationMs;
    profile.showcases = showcases;
    const result = validateProfile(profile);
    const errors = result.ok ? [] : result.errors;
    const showcaseErrors = errors.filter((e) => e.path.startsWith("showcases"));
    expect(showcaseErrors).toEqual([]);
  });

  it("全 weight が0以上1以下", () => {
    for (const s of showcases) {
      expect(s.weight).toBeGreaterThanOrEqual(0);
      expect(s.weight).toBeLessThanOrEqual(1);
    }
  });

  it("決定論: 同じ入力で同じ結果", () => {
    expect(generateShowcases(toShowcaseInput())).toEqual(showcases);
  });
});
