import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { generateDensityPlan, countTargetNotes, type DensityInput } from "./density";
import { generateShowcases } from "./showcases";
import { DEFAULT_SHOWCASE_OPTIONS } from "./types";
import {
  toShowcaseInput,
  toDensityBeats,
  toChorusSegments,
  toLyricCharOnsetsMs,
  type RawSongmap,
} from "./songmapAdapters";

// 実データ（TAKEOVERの音楽地図ダンプ）を素のデータファイルとして読む。src/tools への import はしない。
// songmap → 各入力への変換は共有アダプタ songmapAdapters を使い、生成本体（#45 の buildProfile）と同じ変換でテストする。
const songmapPath = fileURLToPath(new URL("../../../docs/analysis/takeover.songmap.json", import.meta.url));
const songmap = JSON.parse(readFileSync(songmapPath, "utf8")) as RawSongmap;

const TOLERANCE_MS = 1;

// 密度入力は見せ場とクライマックス代表時刻を含むため共有アダプタ1つでは作れない。共有の各変換を組み合わせて作る。
function toDensityInput(): DensityInput {
  return {
    durationMs: songmap.song.duration,
    beats: toDensityBeats(songmap),
    chorusSegments: toChorusSegments(songmap),
    lyricCharOnsetsMs: toLyricCharOnsetsMs(songmap),
    showcases: generateShowcases(toShowcaseInput(songmap)),
    climaxAnchorMs: DEFAULT_SHOWCASE_OPTIONS.climaxAnchorMs,
  };
}

const chorusSegments = songmap.segments.filter((s) => s.isChorus);

describe("譜面密度設計 実データ検証（Issue #43 受け入れ基準）", () => {
  const input = toDensityInput();
  const plan = generateDensityPlan(input);

  it("達成基準1: 区間が曲全体を0から切れ目なく重複なく覆う", () => {
    expect(plan.regions[0]!.startMs).toBe(0);
    expect(plan.regions[plan.regions.length - 1]!.endMs).toBe(input.durationMs);
    for (let i = 1; i < plan.regions.length; i++) {
      expect(plan.regions[i]!.startMs).toBe(plan.regions[i - 1]!.endMs);
    }
  });

  it("達成基準2: サビの目標密度が非サビ基本の2倍", () => {
    const chorus = plan.regions.find((r) => r.className === "chorus")!;
    const base = plan.regions.find((r) => r.className === "base")!;
    expect(chorus.targetDensityPerBeat).toBe(2 * base.targetDensityPerBeat);
  });

  it("達成基準3: 3つのサビ区間が現れ境界が音楽地図と一致、合計192拍", () => {
    const chorusRegions = plan.regions.filter((r) => r.className === "chorus");
    expect(chorusRegions).toHaveLength(3);
    for (const seg of chorusSegments) {
      const matched = chorusRegions.find(
        (r) =>
          Math.abs(r.startMs - seg.startTime) <= TOLERANCE_MS &&
          Math.abs(r.endMs - seg.endTime) <= TOLERANCE_MS,
      );
      expect(matched, `サビ区間 ${seg.startTime}-${seg.endTime} に対応する区間`).toBeDefined();
    }
    const chorusBeats = plan.beats.filter((b) => b.className === "chorus");
    expect(chorusBeats).toHaveLength(192);
  });

  it("達成基準4: 第2サビ終端直後と200-220秒が休符、サビ終端より前はサビ", () => {
    const secondChorusEnd = chorusSegments[1]!.endTime; // 111000.2
    // 第2サビ終端より前（110-111秒）はサビ、終端直後（111秒台）は休符。
    const beatBeforeEnd = plan.beats.find(
      (b) => b.startMs >= 110000 && b.startMs < secondChorusEnd,
    )!;
    expect(beatBeforeEnd.className).toBe("chorus");
    const beatAfterEnd = plan.beats.find(
      (b) => b.startMs >= secondChorusEnd && b.startMs < 120000,
    )!;
    expect(beatAfterEnd.className).toBe("rest");
    // 200-220秒は休符。
    const outroBeats = plan.beats.filter((b) => b.startMs >= 200000 && b.startMs < 220000);
    expect(outroBeats.length).toBeGreaterThan(0);
    for (const b of outroBeats) expect(b.className).toBe("rest");
    // 200-210秒と210-220秒が1つの休符区間に合併する。
    const restRegion = plan.regions.find(
      (r) => r.className === "rest" && r.startMs <= 200000 && r.endMs >= 220000,
    );
    expect(restRegion, "200000-220000を覆う1つの休符区間").toBeDefined();
  });

  it("達成基準5: 溜めは非サビ拍にのみ生じ、サビと重ならず、最後の見せ場より後には生じない", () => {
    const buildupBeats = plan.beats.filter((b) => b.className === "buildup");
    expect(buildupBeats.length).toBeGreaterThan(0);
    // 溜めの拍はすべて非サビ（サビ区間の内側に無い）。
    for (const b of buildupBeats) {
      const insideChorus = chorusSegments.some(
        (s) => b.startMs >= s.startTime && b.startMs < s.endTime,
      );
      expect(insideChorus).toBe(false);
    }
    // 最後の見せ場（クライマックス、約165.7秒のサビ開始）より後に溜めは生じない。
    const lastShowcaseStart = Math.max(...input.showcases.map((s) => s.startTimeMs));
    for (const b of buildupBeats) expect(b.startMs).toBeLessThan(lastShowcaseStart);
  });

  it("達成基準6: 骨格434、実効が340-676かつ約387、休符0カウント・溜め密度0.25", () => {
    const summary = countTargetNotes(plan);
    expect(summary.skeleton).toBe(434);
    expect(summary.effective).toBeGreaterThanOrEqual(340);
    expect(summary.effective).toBeLessThanOrEqual(676);
    expect(summary.effective).toBe(387);
    // 休符は0カウント。
    expect(summary.byClass.rest).toBe(0);
    // 溜め区間の目標密度は0.25。
    const buildup = plan.regions.find((r) => r.className === "buildup");
    expect(buildup?.targetDensityPerBeat).toBe(0.25);
    // 区間別割当の合計が実効と一致。
    const regionSum = summary.byRegion.reduce((acc, r) => acc + r.targetNotes, 0);
    expect(regionSum).toBe(summary.effective);
  });

  it("達成基準8: 選択強調信号が0-1で、189000ミリ秒の明示サンプルが唯一最大", () => {
    const samples = plan.selectionSignal.samples;
    for (const s of samples) {
      expect(s.value).toBeGreaterThanOrEqual(0);
      expect(s.value).toBeLessThanOrEqual(1);
    }
    const anchor = samples.find((s) => s.timeMs === DEFAULT_SHOWCASE_OPTIONS.climaxAnchorMs);
    expect(anchor).toBeDefined();
    const maxValue = Math.max(...samples.map((s) => s.value));
    expect(anchor!.value).toBe(maxValue);
    expect(samples.filter((s) => s.value === maxValue)).toHaveLength(1);
  });

  it("達成基準9: クライマックス見せ場とサビの重なる区間は86ミリ秒、その他は171ミリ秒", () => {
    const climax = input.showcases.find((s) => s.isClimax)!;
    for (const r of plan.regions) {
      const overlapsClimax = r.startMs < climax.endTimeMs && r.endMs > climax.startTimeMs;
      if (r.className === "chorus" && overlapsClimax) {
        expect(r.minIntervalMs).toBe(86);
      } else {
        expect(r.minIntervalMs).toBe(171);
      }
    }
  });

  it("決定論: 同じ入力で同じ密度プラン", () => {
    expect(generateDensityPlan(toDensityInput())).toEqual(plan);
  });
});
