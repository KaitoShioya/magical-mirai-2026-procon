import { describe, expect, it } from "vitest";
import {
  generateDensityPlan,
  countTargetNotes,
  DEFAULT_DENSITY_OPTIONS,
  type DensityInput,
} from "./density";
import type { Showcase } from "../schema/profileSchema";

// 合成入力を組み立てる補助。拍は等間隔（既定1000ミリ秒刻み）で並べる。
function makeBeats(count: number, stepMs = 1000) {
  return Array.from({ length: count }, (_, i) => ({
    index: i,
    startMs: i * stepMs,
    endMs: i * stepMs + stepMs,
  }));
}

// 歌詞文字の開始時刻を等間隔で詰める（谷を作らないため一様にする）。
function uniformLyrics(durationMs: number, stepMs = 500) {
  const out: number[] = [];
  for (let t = 0; t < durationMs; t += stepMs) out.push(t);
  return out;
}

function showcase(
  index: number,
  startTimeMs: number,
  endTimeMs: number,
  weight: number,
  isClimax: boolean,
): Showcase {
  return { index, startTimeMs, endTimeMs, weight, isClimax };
}

describe("譜面密度設計（合成入力の単体テスト）", () => {
  it("区間が曲全体を0から切れ目なく重複なく覆う", () => {
    const input: DensityInput = {
      durationMs: 16000,
      beats: makeBeats(16),
      chorusSegments: [{ startMs: 4000, endMs: 8000 }],
      lyricCharOnsetsMs: uniformLyrics(16000),
      showcases: [],
      climaxAnchorMs: 6000,
    };
    const plan = generateDensityPlan(input);
    expect(plan.regions[0].startMs).toBe(0);
    expect(plan.regions[plan.regions.length - 1].endMs).toBe(16000);
    for (let i = 1; i < plan.regions.length; i++) {
      expect(plan.regions[i].startMs).toBe(plan.regions[i - 1].endMs);
    }
  });

  it("サビの目標密度が非サビ基本の目標密度のちょうど2倍", () => {
    const input: DensityInput = {
      durationMs: 16000,
      beats: makeBeats(16),
      chorusSegments: [{ startMs: 4000, endMs: 8000 }],
      lyricCharOnsetsMs: uniformLyrics(16000),
      showcases: [],
      climaxAnchorMs: 6000,
    };
    const plan = generateDensityPlan(input);
    const chorus = plan.regions.find((r) => r.className === "chorus");
    const base = plan.regions.find((r) => r.className === "base");
    expect(chorus).toBeDefined();
    expect(base).toBeDefined();
    expect(chorus!.targetDensityPerBeat).toBe(2 * base!.targetDensityPerBeat);
    // サビ区間の境界が音楽地図の時刻と一致する。
    expect(chorus!.startMs).toBe(4000);
    expect(chorus!.endMs).toBe(8000);
  });

  it("拍の所属判定は厳密な右半開比較（サビ終端の拍は非サビ）", () => {
    const input: DensityInput = {
      durationMs: 16000,
      beats: makeBeats(16),
      chorusSegments: [{ startMs: 4000, endMs: 8000 }],
      lyricCharOnsetsMs: uniformLyrics(16000),
      showcases: [],
      climaxAnchorMs: 6000,
    };
    const plan = generateDensityPlan(input);
    const beatAt4000 = plan.beats.find((b) => b.startMs === 4000)!;
    const beatAt8000 = plan.beats.find((b) => b.startMs === 8000)!;
    expect(beatAt4000.className).toBe("chorus");
    expect(beatAt8000.className).toBe("base");
  });

  it("歌詞密度の谷が休符分類（目標密度0）になる", () => {
    // 窓を4000ミリ秒にし、[8000,12000) だけ文字を置かず谷にする。
    const onsets: number[] = [];
    for (const [lo, hi] of [
      [0, 4000],
      [4000, 8000],
      [12000, 16000],
    ]) {
      for (let t = lo; t < hi; t += 250) onsets.push(t);
    }
    const input: DensityInput = {
      durationMs: 16000,
      beats: makeBeats(16),
      chorusSegments: [],
      lyricCharOnsetsMs: onsets,
      showcases: [],
      climaxAnchorMs: 6000,
    };
    const plan = generateDensityPlan(input, {
      ...DEFAULT_DENSITY_OPTIONS,
      lyricWindowMs: 4000,
    });
    const restBeats = plan.beats.filter((b) => b.className === "rest");
    expect(restBeats.map((b) => b.startMs).sort((a, b) => a - b)).toEqual([
      8000, 9000, 10000, 11000,
    ]);
    const restRegion = plan.regions.find((r) => r.className === "rest")!;
    expect(restRegion.targetDensityPerBeat).toBe(0);
  });

  it("見せ場直前の非サビ助走が溜め分類になり、最小2拍未満では溜めを作らない", () => {
    const input: DensityInput = {
      durationMs: 16000,
      beats: makeBeats(16),
      chorusSegments: [],
      lyricCharOnsetsMs: uniformLyrics(16000),
      showcases: [showcase(0, 12000, 14000, 1.0, true)],
      climaxAnchorMs: 13000,
    };
    const plan = generateDensityPlan(input);
    // 直前1小節（4拍）= [8000,12000) の拍8,9,10,11 が溜めになる。
    const buildupBeats = plan.beats
      .filter((b) => b.className === "buildup")
      .map((b) => b.startMs)
      .sort((a, b) => a - b);
    expect(buildupBeats).toEqual([8000, 9000, 10000, 11000]);
    const buildup = plan.regions.find((r) => r.className === "buildup")!;
    expect(buildup.targetDensityPerBeat).toBeLessThan(0.5);
  });

  it("直前の非サビ拍が最小2拍未満の見せ場には溜めを作らない", () => {
    // 見せ場の開始を1000ミリ秒に置くと、直前1小節の窓は曲頭で切り詰められ拍0の1拍だけになる。
    const input: DensityInput = {
      durationMs: 16000,
      beats: makeBeats(16),
      chorusSegments: [],
      lyricCharOnsetsMs: uniformLyrics(16000),
      showcases: [showcase(0, 1000, 3000, 1.0, true)],
      climaxAnchorMs: 2000,
    };
    const plan = generateDensityPlan(input);
    expect(plan.beats.filter((b) => b.className === "buildup")).toHaveLength(0);
  });

  it("クライマックス窓がサビの一部だけに重なるとき、重なり区間のみ86ミリ秒", () => {
    // サビ[4000,12000)の内側にクライマックス窓[6000,10000)を置く合成入力。窓の縁が境界になり、サビは
    // 3区間に割れる。重なる中央[6000,10000)だけが86ミリ秒、前後[4000,6000)と[10000,12000)は171ミリ秒。
    const input: DensityInput = {
      durationMs: 16000,
      beats: makeBeats(16),
      chorusSegments: [{ startMs: 4000, endMs: 12000 }],
      lyricCharOnsetsMs: uniformLyrics(16000),
      showcases: [showcase(0, 6000, 10000, 1.0, true)],
      climaxAnchorMs: 8000,
    };
    const plan = generateDensityPlan(input);
    const chorusRegions = plan.regions.filter((r) => r.className === "chorus");
    const region86 = chorusRegions.filter((r) => r.minIntervalMs === 86);
    expect(region86).toHaveLength(1);
    expect(region86[0]!.startMs).toBe(6000);
    expect(region86[0]!.endMs).toBe(10000);
    const region171 = chorusRegions.filter((r) => r.minIntervalMs === 171);
    expect(region171.map((r) => [r.startMs, r.endMs])).toEqual([
      [4000, 6000],
      [10000, 12000],
    ]);
  });

  it("全見せ場の核中心がサンプル時刻に含まれる", () => {
    const showcases = [
      showcase(0, 4000, 8000, 1.0, true),
      showcase(1, 9000, 11000, 0.5, false),
      showcase(2, 13000, 15000, 0.7, false),
    ];
    const input: DensityInput = {
      durationMs: 16000,
      beats: makeBeats(16),
      chorusSegments: [{ startMs: 4000, endMs: 8000 }],
      lyricCharOnsetsMs: uniformLyrics(16000),
      showcases,
      climaxAnchorMs: 6000,
    };
    const plan = generateDensityPlan(input);
    const sampleTimes = new Set(plan.selectionSignal.samples.map((s) => s.timeMs));
    for (const s of showcases) {
      const centerMs = s.isClimax ? input.climaxAnchorMs : (s.startTimeMs + s.endTimeMs) / 2;
      expect(sampleTimes.has(centerMs)).toBe(true);
    }
  });

  it("選択強調信号は0以上1以下で、クライマックス代表時刻が明示サンプルかつ唯一最大", () => {
    const input: DensityInput = {
      durationMs: 16000,
      beats: makeBeats(16),
      chorusSegments: [{ startMs: 4000, endMs: 8000 }],
      lyricCharOnsetsMs: uniformLyrics(16000),
      showcases: [
        showcase(0, 4000, 8000, 1.0, true),
        showcase(1, 10000, 12000, 0.5, false),
      ],
      climaxAnchorMs: 6000,
    };
    const plan = generateDensityPlan(input);
    const samples = plan.selectionSignal.samples;
    for (const s of samples) {
      expect(s.value).toBeGreaterThanOrEqual(0);
      expect(s.value).toBeLessThanOrEqual(1);
    }
    const anchor = samples.find((s) => s.timeMs === 6000);
    expect(anchor).toBeDefined();
    const maxValue = Math.max(...samples.map((s) => s.value));
    expect(anchor!.value).toBe(maxValue);
    expect(samples.filter((s) => s.value === maxValue)).toHaveLength(1);
  });

  it("同じ入力に同じ密度プランを返す（決定論）", () => {
    const input: DensityInput = {
      durationMs: 16000,
      beats: makeBeats(16),
      chorusSegments: [{ startMs: 4000, endMs: 8000 }],
      lyricCharOnsetsMs: uniformLyrics(16000),
      showcases: [showcase(0, 4000, 8000, 1.0, true)],
      climaxAnchorMs: 6000,
    };
    expect(generateDensityPlan(input)).toEqual(generateDensityPlan(input));
  });

  it("骨格計数はサビ拍×1＋非サビ拍×0.5、実効と区間別割当の合計が一致", () => {
    const input: DensityInput = {
      durationMs: 16000,
      beats: makeBeats(16),
      chorusSegments: [{ startMs: 4000, endMs: 8000 }],
      lyricCharOnsetsMs: uniformLyrics(16000),
      showcases: [],
      climaxAnchorMs: 6000,
    };
    const plan = generateDensityPlan(input);
    const summary = countTargetNotes(plan);
    // サビ4拍×1.0 + 非サビ12拍×0.5 = 10。
    expect(summary.skeleton).toBe(10);
    const regionSum = summary.byRegion.reduce((acc, r) => acc + r.targetNotes, 0);
    expect(regionSum).toBe(summary.effective);
    const classSum =
      summary.byClass.chorus +
      summary.byClass.base +
      summary.byClass.rest +
      summary.byClass.buildup;
    expect(classSum).toBe(summary.effective);
  });
});
