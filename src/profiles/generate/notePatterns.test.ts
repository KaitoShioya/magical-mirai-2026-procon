import { describe, expect, it } from "vitest";
import {
  applyNotePatterns,
  sampleContour,
  DEFAULT_NOTE_PATTERN_OPTIONS,
  type NotePatternInput,
  type NotePatternOptions,
} from "./notePatterns";
import type { OnsetNote } from "./onsetNotes";
import type { ChordToneSlotRegion, LoudnessCurve, EmotionCurve } from "../schema/profileSchema";

// テストの作り方の前提を先に述べる。勢い値を一意に制御するため、声量の重みを1・感情の重みを0にして勢い値を
// 正規化声量だけに依存させる。声量曲線の刻みを100ミリ秒、最大値を1にし、ノーツを100ミリ秒間隔で置くと、
// k番目のノーツ（時刻 k×100ミリ秒）の勢い値は values[k] に等しくなり、テストで与えた配列がそのまま勢い値の列になる。
// 刻みを区間探索の許容差1ミリ秒より十分大きい100ミリ秒にする理由は、隣接ノーツが許容差で隣の和音区間へ
// 取り込まれるのを防ぐためである。感情曲線は最低限の1点だけ持たせるが重み0のため勢い値に寄与しない。

/** ノーツとサンプルの間隔（ミリ秒）。区間探索の許容差1ミリ秒より十分大きくする。 */
const TIME_STEP_MS = 100;

/** 声量の重みのみを使う（勢い値＝正規化声量）。 */
const LOUDNESS_ONLY: NotePatternOptions = { loudnessWeight: 1, emotionWeight: 0, flatEpsilon: 0.02 };

/** 重み0のため勢い値に寄与しない最小の感情曲線。 */
const EMOTION_ZERO: EmotionCurve = {
  stepMs: 1000,
  points: [{ tMs: 0, valence: 0, arousal: 0 }],
  median: { valence: 0, arousal: 0 },
};

function onset(id: string, timeMs: number, beatIndex: number): OnsetNote {
  return { id, timeMs, beatIndex, sectionKind: "nonChorus" };
}

/** 刻み100ミリ秒・最大値1の声量曲線。時刻 k×100ミリ秒の正規化声量は values[k] に等しい。 */
function loudnessFrom(values: number[]): LoudnessCurve {
  return { stepMs: TIME_STEP_MS, maxAmplitude: 1, values };
}

/** 指定した境界からスロット区間列を作る。pitches はMIDI昇順のダミー（#39は音高値を読まない）。 */
function slotsFrom(boundaries: number[], slotCount = 7): ChordToneSlotRegion[] {
  const regions: ChordToneSlotRegion[] = [];
  for (let i = 0; i + 1 < boundaries.length; i++) {
    regions.push({
      startTimeMs: boundaries[i],
      endTimeMs: boundaries[i + 1],
      chordName: "Fm",
      pitches: Array.from({ length: slotCount }, (_, k) => 60 + k),
    });
  }
  return regions;
}

/** 時刻 0,100,200,… ミリ秒に1個ずつノーツを置き、単一区間で曲全域を被覆させる入力を作る。 */
function singleRegionInput(values: number[]): NotePatternInput {
  return {
    notes: values.map((_, i) => onset(`note-${i}`, i * TIME_STEP_MS, i)),
    slots: slotsFrom([0, values.length * TIME_STEP_MS]),
    loudness: loudnessFrom(values),
    emotion: EMOTION_ZERO,
  };
}

describe("applyNotePatterns（譜面パターン適用、Issue #39）", () => {
  it("勢い値が単調増加するとき、同一区間内で slotIndex が非減少になり pattern が ascending になる", () => {
    const result = applyNotePatterns(singleRegionInput([0.1, 0.3, 0.5, 0.7, 0.9]), LOUDNESS_ONLY);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].slotIndex).toBeGreaterThanOrEqual(result[i - 1].slotIndex);
    }
    expect(result.map((n) => n.pattern)).toEqual([
      "ascending",
      "ascending",
      "ascending",
      "ascending",
      "ascending",
    ]);
  });

  it("勢い値が単調減少するとき、同一区間内で slotIndex が非増加になり pattern が descending になる", () => {
    const result = applyNotePatterns(singleRegionInput([0.9, 0.7, 0.5, 0.3, 0.1]), LOUDNESS_ONLY);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].slotIndex).toBeLessThanOrEqual(result[i - 1].slotIndex);
    }
    expect(result.every((n) => n.pattern === "descending")).toBe(true);
  });

  it("勢い値が平坦なとき、slotIndex が一定になり pattern が sameTone になる", () => {
    const result = applyNotePatterns(singleRegionInput([0.5, 0.5, 0.5, 0.5]), LOUDNESS_ONLY);
    expect(new Set(result.map((n) => n.slotIndex)).size).toBe(1);
    expect(result.every((n) => n.pattern === "sameTone")).toBe(true);
  });

  it("勢い値が上がり続けても slotIndex は天井で頭打ちになり、頭打ちの箇所の pattern は sameTone になる", () => {
    // 勢い値0.7から始め0.05刻みで上げると、シード5から+1ずつ進み7で頭打ちになる。
    const result = applyNotePatterns(singleRegionInput([0.7, 0.75, 0.8, 0.85, 0.9]), LOUDNESS_ONLY);
    expect(result.map((n) => n.slotIndex)).toEqual([5, 6, 7, 7, 7]);
    expect(result.map((n) => n.pattern)).toEqual([
      "ascending",
      "ascending",
      "ascending",
      "sameTone",
      "sameTone",
    ]);
  });

  it("勢い値が下がり続けても slotIndex は床で頭打ちになり、頭打ちの箇所の pattern は sameTone になる", () => {
    // 勢い値0.3から始め0.05刻みで下げると、シード3から−1ずつ進み1で頭打ちになる。
    const result = applyNotePatterns(singleRegionInput([0.3, 0.25, 0.2, 0.15, 0.1]), LOUDNESS_ONLY);
    expect(result.map((n) => n.slotIndex)).toEqual([3, 2, 1, 1, 1]);
    expect(result.map((n) => n.pattern)).toEqual([
      "descending",
      "descending",
      "descending",
      "sameTone",
      "sameTone",
    ]);
  });

  it("和音区間が変わる箇所で run が区切られ、slotIndex が勢い値から再シードされる", () => {
    // 区間[0,200) と [200,1000)。時刻200で区間が変わり、直前の slotIndex を引き継がず勢い値0.9から再シードする。
    const input: NotePatternInput = {
      notes: [onset("a", 0, 0), onset("b", 100, 1), onset("c", 200, 2), onset("d", 300, 3)],
      slots: slotsFrom([0, 200, 1000]),
      loudness: loudnessFrom([0.1, 0.3, 0.9, 0.95]),
      emotion: EMOTION_ZERO,
    };
    const result = applyNotePatterns(input, LOUDNESS_ONLY);
    // 区間1: シード(0.1)=2、+1で3。
    expect(result[0].slotIndex).toBe(2);
    expect(result[1].slotIndex).toBe(3);
    // 区間2の先頭は再シード(0.9)=6（区間1の3を引き継がない）。
    expect(result[2].slotIndex).toBe(6);
    expect(result[3].slotIndex).toBe(7);
  });

  it("どの区間にも入らない時刻のノーツは先頭区間に寄せられ、例外にならない", () => {
    const input: NotePatternInput = {
      notes: [onset("a", 50, 0)],
      slots: slotsFrom([1000, 2000]),
      loudness: loudnessFrom([0.5]),
      emotion: EMOTION_ZERO,
    };
    const result = applyNotePatterns(input, LOUDNESS_ONLY);
    expect(result).toHaveLength(1);
    expect(result[0].slotIndex).toBeGreaterThanOrEqual(1);
    expect(result[0].slotIndex).toBeLessThanOrEqual(7);
  });

  it("全ノーツの slotIndex が1以上スロット数以下に収まる", () => {
    const result = applyNotePatterns(singleRegionInput([0, 0.2, 1, 0.8, 0.4, 1, 0]), LOUDNESS_ONLY);
    for (const note of result) {
      expect(note.slotIndex).toBeGreaterThanOrEqual(1);
      expect(note.slotIndex).toBeLessThanOrEqual(7);
    }
  });

  it("id・timeMs・beatIndex を入力から引き継ぎ、sectionKind を出力に含めない", () => {
    const result = applyNotePatterns(singleRegionInput([0.5, 0.6]), LOUDNESS_ONLY);
    expect(result[0].id).toBe("note-0");
    expect(result[0].timeMs).toBe(0);
    expect(result[1].beatIndex).toBe(1);
    expect(Object.keys(result[0]).sort()).toEqual(["beatIndex", "id", "pattern", "slotIndex", "timeMs"]);
  });

  it("無音センチネル（−1）と負の声量は0として扱われる", () => {
    const input: NotePatternInput = {
      notes: [onset("a", 0, 0), onset("b", 100, 1)],
      slots: slotsFrom([0, 1000]),
      loudness: loudnessFrom([-1, 0.5]),
      emotion: EMOTION_ZERO,
    };
    const result = applyNotePatterns(input, LOUDNESS_ONLY);
    // 勢い値0 → シード1。
    expect(result[0].slotIndex).toBe(1);
  });

  it("ノーツが空なら空配列を返す", () => {
    const result = applyNotePatterns({
      notes: [],
      slots: slotsFrom([0, 10]),
      loudness: loudnessFrom([0.5]),
      emotion: EMOTION_ZERO,
    });
    expect(result).toEqual([]);
  });

  it("flatEpsilon を大きくすると全ノーツが据え置きになり、slotIndex 一定・pattern sameTone になる", () => {
    const result = applyNotePatterns(singleRegionInput([0.1, 0.3, 0.5, 0.7, 0.9]), {
      loudnessWeight: 1,
      emotionWeight: 0,
      flatEpsilon: 1,
    });
    expect(new Set(result.map((n) => n.slotIndex)).size).toBe(1);
    expect(result.every((n) => n.pattern === "sameTone")).toBe(true);
  });

  describe("入力検査の例外", () => {
    it("ノーツが非空でスロット区間が空なら例外", () => {
      expect(() =>
        applyNotePatterns({
          notes: [onset("a", 0, 0)],
          slots: [],
          loudness: loudnessFrom([0.5]),
          emotion: EMOTION_ZERO,
        }),
      ).toThrow(/スロット区間/);
    });

    it("スロット数が区間で一致しないなら例外", () => {
      const slots: ChordToneSlotRegion[] = [
        { startTimeMs: 0, endTimeMs: 5, chordName: "Fm", pitches: [60, 61, 62, 63, 64, 65, 66] },
        { startTimeMs: 5, endTimeMs: 10, chordName: "Ab", pitches: [60, 61, 62, 63, 64] },
      ];
      expect(() =>
        applyNotePatterns({
          notes: [onset("a", 0, 0)],
          slots,
          loudness: loudnessFrom([0.5]),
          emotion: EMOTION_ZERO,
        }),
      ).toThrow(/スロット数が同一/);
    });

    it("スロット数が0なら例外", () => {
      const slots: ChordToneSlotRegion[] = [{ startTimeMs: 0, endTimeMs: 10, chordName: "Fm", pitches: [] }];
      expect(() =>
        applyNotePatterns({
          notes: [onset("a", 0, 0)],
          slots,
          loudness: loudnessFrom([0.5]),
          emotion: EMOTION_ZERO,
        }),
      ).toThrow(/スロット数は1以上/);
    });

    it("声量曲線の最大値が0以下なら例外", () => {
      expect(() =>
        applyNotePatterns({
          notes: [onset("a", 0, 0)],
          slots: slotsFrom([0, 10]),
          loudness: { stepMs: 1, maxAmplitude: 0, values: [0.5] },
          emotion: EMOTION_ZERO,
        }),
      ).toThrow(/maxAmplitude/);
    });

    it("重みの合計が正でないなら例外", () => {
      expect(() =>
        applyNotePatterns(singleRegionInput([0.5]), { loudnessWeight: 0, emotionWeight: 0, flatEpsilon: 0.02 }),
      ).toThrow(/重み/);
    });
  });
});

describe("sampleContour（勢い値、Issue #39）", () => {
  it("声量と感情を等価に混ぜ、0以上1以下を返す", () => {
    const loudness = loudnessFrom([0.4]);
    const emotion: EmotionCurve = {
      stepMs: 1000,
      points: [{ tMs: 0, valence: 0.5, arousal: 0.8 }],
      median: { valence: 0.5, arousal: 0.5 },
    };
    const contour = sampleContour(0, loudness, emotion, DEFAULT_NOTE_PATTERN_OPTIONS);
    // (0.5×0.4 + 0.5×0.8) / 1 = 0.6。
    expect(contour).toBeCloseTo(0.6, 10);
  });

  it("正規化声量は最大値を超えても上限1で切られる", () => {
    const loudness: LoudnessCurve = { stepMs: 1, maxAmplitude: 1, values: [2] };
    const contour = sampleContour(0, loudness, EMOTION_ZERO, { loudnessWeight: 1, emotionWeight: 0, flatEpsilon: 0.02 });
    expect(contour).toBe(1);
  });

  it("感情の興奮度は時刻以下で最大の時刻を持つ点を階段補間で採る", () => {
    const emotion: EmotionCurve = {
      stepMs: 1000,
      points: [
        { tMs: 0, valence: 0, arousal: 0.2 },
        { tMs: 1000, valence: 0, arousal: 0.6 },
      ],
      median: { valence: 0, arousal: 0.4 },
    };
    const loudness = loudnessFrom(new Array(2000).fill(0));
    // 時刻500は点0（arousal0.2）を保持、時刻1500は点1（arousal0.6）を保持する。
    const at500 = sampleContour(500, loudness, emotion, { loudnessWeight: 0, emotionWeight: 1, flatEpsilon: 0.02 });
    const at1500 = sampleContour(1500, loudness, emotion, { loudnessWeight: 0, emotionWeight: 1, flatEpsilon: 0.02 });
    expect(at500).toBeCloseTo(0.2, 10);
    expect(at1500).toBeCloseTo(0.6, 10);
  });
});
