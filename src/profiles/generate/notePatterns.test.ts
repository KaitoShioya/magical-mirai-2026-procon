import { describe, expect, it } from "vitest";
import {
  applyNotePatterns,
  DEFAULT_NOTE_PATTERN_OPTIONS,
  type NotePatternBeat,
  type NotePatternInput,
} from "./notePatterns";
import type { OnsetNote } from "./onsetNotes";
import type { ChordToneSlotRegion, LoudnessCurve, DiversityZone } from "../schema/profileSchema";

// 再設計後の番号割当は勢い値ではなく「起点の音域分散・配置語彙・反単調規則・サビ役割変換」で動く。
// 単体テストは小さな合成入力で、(1) 範囲・連続上限・id引き継ぎ、(2) 区間スロット契約の例外、(3) サビ役割変換を表明する。

const TIME_STEP_MS = 343;

function onset(id: string, timeMs: number, beatIndex: number, sectionKind: OnsetNote["sectionKind"] = "nonChorus"): OnsetNote {
  return { id, timeMs, beatIndex, sectionKind };
}

function loudnessFrom(values: number[]): LoudnessCurve {
  return { stepMs: TIME_STEP_MS, maxAmplitude: 1, values };
}

/** 指定境界からスロット区間列を作る。pitches はMIDI昇順のダミー（音高値は読まない）。 */
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

/** 単一スロット区間で曲全域を覆う入力を作る。拍は4拍循環、声量・フレーズ先頭・サビ役割は引数で与える。 */
function makeInput(
  count: number,
  opts: {
    loudness?: number[];
    phraseOnsetsMs?: number[];
    diversityZones?: DiversityZone[];
    sectionKindOf?: (i: number) => OnsetNote["sectionKind"];
  } = {},
): NotePatternInput {
  const notes: OnsetNote[] = [];
  const beats: NotePatternBeat[] = [];
  for (let i = 0; i < count; i++) {
    const timeMs = i * TIME_STEP_MS;
    notes.push(onset(`note-${i}`, timeMs, i, opts.sectionKindOf ? opts.sectionKindOf(i) : "nonChorus"));
    beats.push({ index: i, position: (i % 4) + 1, lengthInBar: 4, startTimeMs: timeMs });
  }
  return {
    notes,
    slots: slotsFrom([0, count * TIME_STEP_MS]),
    loudness: loudnessFrom(opts.loudness ?? new Array(count).fill(0.5)),
    beats,
    phraseOnsetsMs: opts.phraseOnsetsMs ?? [],
    diversityZones: opts.diversityZones ?? [],
  };
}

describe("applyNotePatterns（音程番号割当、再設計）", () => {
  it("全ノーツの slotIndex が1以上スロット数以下に収まる", () => {
    const result = applyNotePatterns(makeInput(40, { loudness: new Array(40).fill(0.8) }));
    for (const n of result) {
      expect(n.slotIndex).toBeGreaterThanOrEqual(1);
      expect(n.slotIndex).toBeLessThanOrEqual(7);
    }
  });

  it("基準A: 同一slotIndex の連続が最大2（3連続が生じない）", () => {
    const result = applyNotePatterns(makeInput(60, { loudness: new Array(60).fill(0.2) }));
    let run = 1;
    let maxRun = 1;
    for (let i = 1; i < result.length; i++) {
      if (result[i].slotIndex === result[i - 1].slotIndex) {
        run++;
        maxRun = Math.max(maxRun, run);
      } else run = 1;
    }
    expect(maxRun).toBeLessThanOrEqual(DEFAULT_NOTE_PATTERN_OPTIONS.maxRun);
  });

  it("id・timeMs・beatIndex を入力から引き継ぎ、sectionKind を出力に含めない", () => {
    const result = applyNotePatterns(makeInput(3));
    expect(result[0].id).toBe("note-0");
    expect(result[0].timeMs).toBe(0);
    expect(result[1].beatIndex).toBe(1);
    expect(Object.keys(result[0]).sort()).toEqual(["beatIndex", "id", "pattern", "slotIndex", "timeMs"]);
  });

  it("pattern が確定後の slotIndex 差と一致する（同一区間内の連続ノーツ）", () => {
    const result = applyNotePatterns(makeInput(20, { loudness: new Array(20).fill(0.7) }));
    for (let i = 1; i < result.length; i++) {
      const delta = result[i].slotIndex - result[i - 1].slotIndex;
      const expected = delta > 0 ? "ascending" : delta < 0 ? "descending" : "sameTone";
      expect(result[i].pattern).toBe(expected);
    }
  });

  it("ノーツが空なら空配列を返す", () => {
    const result = applyNotePatterns({
      notes: [],
      slots: slotsFrom([0, 10]),
      loudness: loudnessFrom([0.5]),      beats: [],
      phraseOnsetsMs: [],
      diversityZones: [],
    });
    expect(result).toEqual([]);
  });

  it("決定論: 同一入力で同一出力", () => {
    const input = makeInput(30, { loudness: new Array(30).fill(0.6), phraseOnsetsMs: [0, 3430, 6860] });
    expect(applyNotePatterns(input)).toEqual(applyNotePatterns(input));
  });

  it("サビ3反復: 主題と変奏・回帰の同一 beatOffset で slotIndex が役割により変わる（基準G）", () => {
    // 3つの同型サビ（各8拍）を離して並べ、すべてのノーツがサビ内。役割変換で番号が反復間で変わることを確認する。
    const stride = TIME_STEP_MS;
    const count = 24;
    const notes: OnsetNote[] = [];
    const beats: NotePatternBeat[] = [];
    const zoneStarts = [0, 100000, 200000];
    const zones: DiversityZone[] = [
      { startTimeMs: 0, endTimeMs: 8 * stride, role: "theme", label: "主題" },
      { startTimeMs: 100000, endTimeMs: 100000 + 8 * stride, role: "variation", label: "変奏" },
      { startTimeMs: 200000, endTimeMs: 200000 + 8 * stride, role: "reprise", label: "回帰" },
    ];
    let idx = 0;
    const boundaries: number[] = [0];
    for (let z = 0; z < 3; z++) {
      for (let j = 0; j < 8; j++) {
        const timeMs = zoneStarts[z] + j * stride;
        notes.push(onset(`note-${idx}`, timeMs, idx, "chorus"));
        beats.push({ index: idx, position: (j % 4) + 1, lengthInBar: 4, startTimeMs: timeMs });
        idx++;
      }
    }
    boundaries.push(200000 + 8 * stride + 1000);
    const input: NotePatternInput = {
      notes,
      slots: slotsFrom(boundaries),
      loudness: loudnessFrom(new Array(count).fill(0.5)),      beats,
      phraseOnsetsMs: [],
      diversityZones: zones,
    };
    const result = applyNotePatterns(input);
    const byZone = zones.map((zn) =>
      result
        .filter((n) => n.timeMs >= zn.startTimeMs && n.timeMs < zn.endTimeMs)
        .sort((a, b) => a.beatIndex - b.beatIndex)
        .map((n) => n.slotIndex),
    );
    // 同じ長さ。
    expect(byZone[1]).toHaveLength(byZone[0].length);
    expect(byZone[2]).toHaveLength(byZone[0].length);
    // 主題と変奏で過半が異なる（役割変換が効いている）。
    let diff01 = 0;
    for (let i = 0; i < byZone[0].length; i++) if (byZone[0][i] !== byZone[1][i]) diff01++;
    expect(diff01 / byZone[0].length).toBeGreaterThanOrEqual(0.3);
  });

  describe("入力検査の例外", () => {
    it("ノーツが非空でスロット区間が空なら例外", () => {
      expect(() =>
        applyNotePatterns({
          notes: [onset("a", 0, 0)],
          slots: [],
          loudness: loudnessFrom([0.5]),          beats: [{ index: 0, position: 1, lengthInBar: 4, startTimeMs: 0 }],
          phraseOnsetsMs: [],
          diversityZones: [],
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
          loudness: loudnessFrom([0.5]),          beats: [{ index: 0, position: 1, lengthInBar: 4, startTimeMs: 0 }],
          phraseOnsetsMs: [],
          diversityZones: [],
        }),
      ).toThrow(/スロット数が同一/);
    });

    it("声量曲線の最大値が0以下なら例外", () => {
      expect(() =>
        applyNotePatterns({
          notes: [onset("a", 0, 0)],
          slots: slotsFrom([0, 10]),
          loudness: { stepMs: 1, maxAmplitude: 0, values: [0.5] },          beats: [{ index: 0, position: 1, lengthInBar: 4, startTimeMs: 0 }],
          phraseOnsetsMs: [],
          diversityZones: [],
        }),
      ).toThrow(/maxAmplitude/);
    });
  });
});
