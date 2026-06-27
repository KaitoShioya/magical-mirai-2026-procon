import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { applyNotePatterns, type NotePatternInput, type PatternedNote } from "./notePatterns";
import { generateOnsetNotes, type OnsetInput } from "./onsetNotes";
import { resolveNoChordRegions } from "./noChordResolution";
import { generateChordToneSlots, type ResolvedChordRegion } from "./chordToneSlots";
import { generateDensityPlan, countTargetNotes, type DensityInput } from "./density";
import { generateShowcases } from "./showcases";
import { DEFAULT_SHOWCASE_OPTIONS } from "./types";
import { deriveDiversityZones } from "./diversityZones";
import { validateProfile } from "../schema/validateProfile";
import { minimalValidProfile } from "../schema/fixtures/minimalValidProfile";
import type { ChordToneSlotRegion, MusicalKey, NcRange, Note, SongProfile } from "../schema/profileSchema";
import {
  toBeats,
  toChords,
  toLoudnessCurve,
  toOnsetInput,
  toPhraseOnsetsMs,
  toDensityBeats,
  toChorusSegments,
  toLyricCharOnsetsMs,
  type RawSongmap,
} from "./songmapAdapters";

// 実データ（TAKEOVERの音楽地図ダンプ）を素のデータファイルとして読む。src/tools/ への import は一切しない。
const songmapPath = fileURLToPath(new URL("../../../docs/analysis/takeover.songmap.json", import.meta.url));
const songmap = JSON.parse(readFileSync(songmapPath, "utf8")) as RawSongmap;

// TAKEOVERの調はファ短調。主音の音名クラスはファ＝5。
const TAKEOVER_KEY: MusicalKey = { tonicPitchClass: 5, mode: "minor" };
const NO_CHORD_SYMBOL = "N";

/** スロット区間（#36の出力）を全210区間の曲全域被覆で組む。 */
function buildSlots(): ChordToneSlotRegion[] {
  const chords = toChords(songmap);
  const ncRanges: NcRange[] = chords
    .filter((c) => c.name === NO_CHORD_SYMBOL)
    .map((c) => ({ startTimeMs: c.startTimeMs, endTimeMs: c.endTimeMs, treatment: "scale" as const }));
  const resolutions = resolveNoChordRegions(chords, ncRanges, TAKEOVER_KEY);
  const resolvedNameByChordIndex = new Map(resolutions.map((r) => [r.chordIndex, r.resolvedChordName]));
  const resolvedRegions: ResolvedChordRegion[] = chords.map((c) => ({
    startTimeMs: c.startTimeMs,
    endTimeMs: c.endTimeMs,
    chordName: c.name === NO_CHORD_SYMBOL ? (resolvedNameByChordIndex.get(c.index) as string) : c.name,
  }));
  return generateChordToneSlots(resolvedRegions);
}

/** buildProfile と同じ結線でオンセット入力を作る。 */
function buildOnsetInput(): OnsetInput {
  const densityInput: DensityInput = {
    durationMs: songmap.song.duration,
    beats: toDensityBeats(songmap),
    chorusSegments: toChorusSegments(songmap),
    lyricCharOnsetsMs: toLyricCharOnsetsMs(songmap),
    showcases: generateShowcases(
      {
        durationMs: songmap.song.duration,
        amplitudeCurve: songmap.amplitudeCurve,
        amplitudeStepMs: songmap.amplitudeStep,
        lyricCharOnsetsMs: toLyricCharOnsetsMs(songmap),
        chorusSegments: toChorusSegments(songmap),
        beatsMs: songmap.beats.map((b) => b.startTime),
      },
      { climaxAnchorMs: DEFAULT_SHOWCASE_OPTIONS.climaxAnchorMs },
    ),
    climaxAnchorMs: DEFAULT_SHOWCASE_OPTIONS.climaxAnchorMs,
  };
  const plan = generateDensityPlan(densityInput);
  const targets = countTargetNotes(plan);
  return toOnsetInput(songmap, {
    regions: plan.regions.map((r) => ({ startMs: r.startMs, endMs: r.endMs, className: r.className })),
    regionTargets: targets.byRegion.map((r) => ({ regionIndex: r.regionIndex, targetNotes: r.targetNotes })),
    selectionSignal: plan.selectionSignal,
  });
}

/** slotIndex 列の隣接差から配置語彙を分類する（再設計プラン：観測は最終 slotIndex 列から行う）。 */
function classifyVocabulary(slots: number[]): { stair: number; trill: number; leap: number; hold: number } {
  const c = { stair: 0, trill: 0, leap: 0, hold: 0 };
  for (let i = 1; i < slots.length; i++) {
    const d = slots[i] - slots[i - 1];
    if (d === 0) c.hold++;
    else if (Math.abs(d) >= 2) c.leap++;
    else if (i >= 2 && slots[i] - slots[i - 1] === -(slots[i - 1] - slots[i - 2])) c.trill++;
    else c.stair++;
  }
  return c;
}

describe("音程番号割当 実データ検証（再設計：不満②）", () => {
  const slots = buildSlots();
  const onsets = generateOnsetNotes(buildOnsetInput());
  const beats = toBeats(songmap).map((b) => ({
    index: b.index,
    position: b.position,
    lengthInBar: b.lengthInBar,
    startTimeMs: b.startTimeMs,
  }));
  const diversityZones = deriveDiversityZones(toChorusSegments(songmap));
  const input: NotePatternInput = {
    notes: onsets,
    slots,
    loudness: toLoudnessCurve(songmap),
    beats,
    phraseOnsetsMs: toPhraseOnsetsMs(songmap),
    diversityZones,
  };
  const patterned: PatternedNote[] = applyNotePatterns(input);
  // 拍索引昇順（判定とプレイの順序）に並べた slotIndex 列で各基準を測る。
  const ordered = [...patterned].sort((a, b) => a.beatIndex - b.beatIndex);
  const seq = ordered.map((n) => n.slotIndex);
  const total = seq.length;

  it("スロットは全210区間・各7スロットで曲全域を被覆し、出力数はオンセット数と一致、id一意", () => {
    expect(slots).toHaveLength(210);
    for (const r of slots) expect(r.pitches).toHaveLength(7);
    expect(patterned).toHaveLength(onsets.length);
    expect(new Set(patterned.map((n) => n.id)).size).toBe(patterned.length);
  });

  it("全ノーツの slotIndex が1以上7以下に収まる", () => {
    for (const n of patterned) {
      expect(n.slotIndex).toBeGreaterThanOrEqual(1);
      expect(n.slotIndex).toBeLessThanOrEqual(7);
    }
  });

  it("基準A: 同一slotIndex の連続が最大2（3連続が0件）", () => {
    let maxRun = 1;
    let run = 1;
    for (let i = 1; i < seq.length; i++) {
      if (seq[i] === seq[i - 1]) {
        run++;
        maxRun = Math.max(maxRun, run);
      } else run = 1;
    }
    expect(maxRun).toBeLessThanOrEqual(2);
  });

  it("基準B: 最頻スロット占有率35パーセント以下、かつ全7スロットが各3パーセント以上", () => {
    const dist = new Array<number>(8).fill(0);
    for (const s of seq) dist[s]++;
    const maxOcc = Math.max(...dist.slice(1)) / total;
    expect(maxOcc).toBeLessThanOrEqual(0.35);
    for (let s = 1; s <= 7; s++) {
      expect(dist[s] / total).toBeGreaterThanOrEqual(0.03);
    }
  });

  it("基準C: 番号が変わった移動のうち跳躍（|差|≥2）が20〜45パーセント", () => {
    let changed = 0;
    let jumps = 0;
    for (let i = 1; i < seq.length; i++) {
      const d = seq[i] - seq[i - 1];
      if (d !== 0) {
        changed++;
        if (Math.abs(d) >= 2) jumps++;
      }
    }
    expect(changed).toBeGreaterThan(0);
    const ratio = jumps / changed;
    expect(ratio).toBeGreaterThanOrEqual(0.2);
    expect(ratio).toBeLessThanOrEqual(0.45);
  });

  it("基準H: サビで配置語彙が複数種出現し、単一語彙が過半を占めない", () => {
    for (const zone of diversityZones) {
      const zoneSeq = ordered
        .filter((n) => n.timeMs >= zone.startTimeMs && n.timeMs < zone.endTimeMs)
        .map((n) => n.slotIndex);
      const v = classifyVocabulary(zoneSeq);
      const counts = [v.stair, v.trill, v.leap, v.hold];
      const sum = counts.reduce((a, b) => a + b, 0);
      const types = counts.filter((x) => x > 0).length;
      expect(types).toBeGreaterThanOrEqual(2);
      expect(Math.max(...counts)).toBeLessThanOrEqual(sum / 2);
    }
  });

  it("基準G: 3サビが同一 beatOffset 集合かつ連続反復組で slotIndex 差異が30パーセント以上", () => {
    const zones = [...diversityZones].sort((a, b) => a.startTimeMs - b.startTimeMs);
    const offMaps = zones.map((z) => {
      const zn = ordered
        .filter((n) => n.timeMs >= z.startTimeMs && n.timeMs < z.endTimeMs)
        .sort((a, b) => a.beatIndex - b.beatIndex);
      const anchor = zn[0].beatIndex;
      const m = new Map<number, number>();
      for (const n of zn) m.set(n.beatIndex - anchor, n.slotIndex);
      return m;
    });
    // 同一 beatOffset 集合。
    const keys0 = [...offMaps[0].keys()].sort((a, b) => a - b);
    for (const m of offMaps) {
      expect([...m.keys()].sort((a, b) => a - b)).toEqual(keys0);
    }
    // 連続反復組で30パーセント以上が異なる。
    const diffRatio = (a: Map<number, number>, b: Map<number, number>): number => {
      let shared = 0;
      let diff = 0;
      for (const [k, v] of a) {
        if (b.has(k)) {
          shared++;
          if (b.get(k) !== v) diff++;
        }
      }
      return shared > 0 ? diff / shared : 0;
    };
    expect(diffRatio(offMaps[0], offMaps[1])).toBeGreaterThanOrEqual(0.3);
    expect(diffRatio(offMaps[1], offMaps[2])).toBeGreaterThanOrEqual(0.3);
  });

  it("pattern が確定後の slotIndex 差と一致する（同一区間内の連続ノーツ）", () => {
    // 区間内（同一スロット区間）連続のみ検査。区間境界は再シードで連続性が切れるため対象外。
    const regionOf = (timeMs: number): number => {
      let found = 0;
      for (let i = 0; i < slots.length; i++) {
        if (slots[i].startTimeMs <= timeMs + 1) found = i;
        else break;
      }
      return found;
    };
    const regions = patterned.map((n) => regionOf(n.timeMs));
    for (let i = 1; i < patterned.length; i++) {
      if (regions[i] !== regions[i - 1]) continue;
      const delta = patterned[i].slotIndex - patterned[i - 1].slotIndex;
      const expected = delta > 0 ? "ascending" : delta < 0 ? "descending" : "sameTone";
      expect(patterned[i].pattern).toBe(expected);
    }
  });
});

describe("音程番号割当 スキーマ適合（再設計）", () => {
  it("minimalValidProfile から組んだ入力で付与したノーツに #40相当のダミー軌跡位置を補うと validateProfile を通る", () => {
    const onsetInput: OnsetInput = {
      beats: minimalValidProfile.beats.map((b) => ({
        index: b.index,
        startTimeMs: b.startTimeMs,
        position: b.position,
        lengthInBar: b.lengthInBar,
      })),
      chorusSegments: minimalValidProfile.repetitiveSegments
        .filter((s) => s.isChorus)
        .map((s) => ({ startMs: s.startTimeMs, endMs: s.endTimeMs })),
      regions: [
        {
          startMs: 0,
          endMs: minimalValidProfile.song.durationMs,
          className: "base",
        },
      ],
      regionTargets: [{ regionIndex: 0, targetNotes: minimalValidProfile.beats.length }],
      chordChangeTimesMs: minimalValidProfile.chords.map((c) => c.startTimeMs),
      lyricCharOnsetsMs: minimalValidProfile.lyricChars.map((c) => c.startTimeMs),
      loudness: {
        stepMs: minimalValidProfile.loudnessCurve.stepMs,
        maxAmplitude: minimalValidProfile.loudnessCurve.maxAmplitude,
        values: minimalValidProfile.loudnessCurve.values,
      },
      selectionSignal: { stepMs: 1000, samples: [] },
    };
    const patterned = applyNotePatterns({
      notes: generateOnsetNotes(onsetInput),
      slots: minimalValidProfile.slots,
      loudness: minimalValidProfile.loudnessCurve,
      beats: minimalValidProfile.beats.map((b) => ({
        index: b.index,
        position: b.position,
        lengthInBar: b.lengthInBar,
        startTimeMs: b.startTimeMs,
      })),
      phraseOnsetsMs: [],
      diversityZones: minimalValidProfile.diversityZones,
    });
    expect(patterned.length).toBeGreaterThan(0);
    const completed: Note[] = patterned.map((n) => ({
      id: n.id,
      timeMs: n.timeMs,
      beatIndex: n.beatIndex,
      slotIndex: n.slotIndex,
      pattern: n.pattern,
      trajectoryPosition: { x: 0, y: 0, z: 0 },
    }));
    const profile = structuredClone(minimalValidProfile) as SongProfile;
    profile.notes = completed;
    const result = validateProfile(profile);
    expect(result.ok).toBe(true);
  });
});
