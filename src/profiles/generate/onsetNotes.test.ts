import { describe, expect, it } from "vitest";
import {
  DEFAULT_ONSET_OPTIONS,
  generateOnsetNotes,
  type OnsetBeat,
  type OnsetInput,
} from "./onsetNotes";
import type { ChorusSegment } from "./types";

// 拍を等間隔で組み立てる補助。index は0始まりの連番、開始時刻は stepMs 刻み。position は1..4 を循環、lengthInBar=4。
function beatsEvery(count: number, stepMs: number, firstMs = 0): OnsetBeat[] {
  const out: OnsetBeat[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      index: i,
      startTimeMs: firstMs + i * stepMs,
      position: (i % 4) + 1,
      lengthInBar: 4,
    });
  }
  return out;
}

/** 1区間で曲全体を覆う最小の入力を作る補助。区間別目標数とサビ区間を引数で与える。 */
function singleRegionInput(
  beats: OnsetBeat[],
  className: OnsetInput["regions"][number]["className"],
  targetNotes: number,
  chorusSegments: ChorusSegment[] = [],
): OnsetInput {
  const endMs = beats.length > 0 ? beats[beats.length - 1].startTimeMs + 1000 : 1000;
  return {
    beats,
    chorusSegments,
    regions: [{ startMs: 0, endMs, className }],
    regionTargets: [{ regionIndex: 0, targetNotes }],
    chordChangeTimesMs: [],
    lyricCharOnsetsMs: [],
    loudness: { stepMs: 100, maxAmplitude: 1, values: [] },
    selectionSignal: { stepMs: 1000, samples: [] },
  };
}

describe("generateOnsetNotes（密度プラン・強調選別、Issue #38 再設計）", () => {
  it("区間別目標数だけ拍を選び、出力は拍索引昇順", () => {
    // 8拍の基本区間で目標4ノーツ。強拍（position=1）優先で選ばれ、出力は拍索引昇順になる。
    const beats = beatsEvery(8, 343);
    const notes = generateOnsetNotes(singleRegionInput(beats, "base", 4));
    expect(notes).toHaveLength(4);
    const idxs = notes.map((n) => n.beatIndex);
    expect([...idxs].sort((a, b) => a - b)).toEqual(idxs); // 昇順。
  });

  it("休符区間（目標0）には何も置かない", () => {
    const beats = beatsEvery(8, 343);
    const notes = generateOnsetNotes(singleRegionInput(beats, "rest", 0));
    expect(notes).toHaveLength(0);
  });

  it("強拍（小節頭 position=1）が弱拍より優先して選ばれる", () => {
    // 4拍1小節を2小節。目標2なら、各小節の強拍（index 0 と 4、position=1）が最高スコアで選ばれる。
    const beats = beatsEvery(8, 343);
    const notes = generateOnsetNotes(singleRegionInput(beats, "base", 2));
    expect(notes.map((n) => n.beatIndex).sort((a, b) => a - b)).toEqual([0, 4]);
  });

  it("サビ3反復は同一の相対拍位置（beatOffset）集合を選ぶ（基準G・多様性逓減の前提）", () => {
    // 3つの同型サビ（各8拍、目標4）を離して並べ、各サビで同じ相対拍位置が選ばれることを確認する。
    const stride = 343;
    const beats: OnsetBeat[] = [];
    const chorusSegments: ChorusSegment[] = [];
    const regions: OnsetInput["regions"] = [];
    const regionTargets: OnsetInput["regionTargets"] = [];
    let idx = 0;
    for (let c = 0; c < 3; c++) {
      const baseMs = c * 100000;
      const startMs = baseMs;
      for (let j = 0; j < 8; j++) {
        beats.push({ index: idx++, startTimeMs: baseMs + j * stride, position: (j % 4) + 1, lengthInBar: 4 });
      }
      const endMs = baseMs + 8 * stride;
      chorusSegments.push({ startMs, endMs });
      regions.push({ startMs, endMs, className: "chorus" });
      regionTargets.push({ regionIndex: c, targetNotes: 4 });
    }
    const input: OnsetInput = {
      beats,
      chorusSegments,
      regions,
      regionTargets,
      chordChangeTimesMs: [],
      lyricCharOnsetsMs: [],
      loudness: { stepMs: 100, maxAmplitude: 1, values: [] },
      selectionSignal: { stepMs: 1000, samples: [] },
    };
    const notes = generateOnsetNotes(input);
    expect(notes).toHaveLength(12);
    // 各サビの先頭拍 index を anchor に、相対 offset 集合を作る。
    const offsetsByChorus: number[][] = [[], [], []];
    for (const c of [0, 1, 2]) {
      const cNotes = notes.filter((n) => n.timeMs >= c * 100000 && n.timeMs < c * 100000 + 8 * stride);
      const anchor = cNotes[0].beatIndex;
      offsetsByChorus[c] = cNotes.map((n) => n.beatIndex - anchor).sort((a, b) => a - b);
    }
    expect(offsetsByChorus[1]).toEqual(offsetsByChorus[0]);
    expect(offsetsByChorus[2]).toEqual(offsetsByChorus[0]);
  });

  it("サビ区間内のノーツは sectionKind が chorus、それ以外は nonChorus", () => {
    const beats = beatsEvery(8, 100);
    const input = singleRegionInput(beats, "chorus", 4, [{ startMs: 0, endMs: 800 }]);
    const notes = generateOnsetNotes(input);
    expect(notes.every((n) => n.sectionKind === "chorus")).toBe(true);
  });

  it("拍が空のとき、空配列を返す", () => {
    const input: OnsetInput = {
      beats: [],
      chorusSegments: [],
      regions: [],
      regionTargets: [],
      chordChangeTimesMs: [],
      lyricCharOnsetsMs: [],
      loudness: { stepMs: 100, maxAmplitude: 1, values: [] },
      selectionSignal: { stepMs: 1000, samples: [] },
    };
    expect(generateOnsetNotes(input)).toEqual([]);
  });

  it("id は固定4桁ゼロ埋めの選択順連番で、一意である", () => {
    const beats = beatsEvery(8, 100);
    const notes = generateOnsetNotes(singleRegionInput(beats, "base", 3));
    expect(notes.map((n) => n.id)).toEqual(["note-0000", "note-0001", "note-0002"]);
    expect(new Set(notes.map((n) => n.id)).size).toBe(notes.length);
  });

  it("接頭辞のオプション上書きが効く", () => {
    const beats = beatsEvery(4, 100);
    const notes = generateOnsetNotes(singleRegionInput(beats, "base", 1), { idPrefix: "n_" });
    expect(notes[0].id).toBe("n_0000");
  });

  it("同じ入力に対し常に同じ出力を返す（決定論）", () => {
    const beats = beatsEvery(16, 100);
    const input = singleRegionInput(beats, "base", 6);
    expect(generateOnsetNotes(input)).toEqual(generateOnsetNotes(input));
  });

  it("既定オプションの重みは強拍とコード変化を最重視する", () => {
    expect(DEFAULT_ONSET_OPTIONS.beatPositionWeight).toBeGreaterThan(0);
    expect(DEFAULT_ONSET_OPTIONS.chordChangeWeight).toBeGreaterThan(0);
    expect(DEFAULT_ONSET_OPTIONS.beatPositionWeight).toBeGreaterThanOrEqual(
      DEFAULT_ONSET_OPTIONS.showcaseWeight,
    );
  });
});
