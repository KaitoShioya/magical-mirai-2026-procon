import { describe, expect, it } from "vitest";
import {
  buildSafeConsonanceIntervals,
  chordNameToSlotPitches,
  circularSemitoneDistance,
  generateChordToneSlots,
  generateSlotPitches,
  QUALITY_TO_TONE_CATEGORY,
  SAFE_ADDED_TONE_SEMITONES,
  type ResolvedChordRegion,
} from "./chordToneSlots";
import { parseChordSymbol, CHORD_PITCH_BASE_C_MIDI, type ChordQuality } from "../../utils/chordPitch";
import {
  PITCH_SLOT_COUNT_DEFAULT,
  PITCH_SLOT_COUNT_MIN,
  PITCH_SLOT_COUNT_MAX,
} from "../../config/tuning";

const SEMITONES_PER_OCTAVE = 12;
const MIDI_MIN = 0;
const MIDI_MAX = 127;

/** その瞬間に対応する7品質すべて。表の網羅と性質テストに使う。 */
const ALL_QUALITIES: ChordQuality[] = [
  "major",
  "minor",
  "augmented",
  "dominantSeventh",
  "majorSeventh",
  "minorSeventh",
  "majorSixth",
  "diminished",
  "suspendedSecond",
];

describe("circularSemitoneDistance（12を法とする循環距離）", () => {
  it("循環をまたぐ半音隣接（シとド）を距離1として捉える", () => {
    expect(circularSemitoneDistance(11, 0)).toBe(1);
    expect(circularSemitoneDistance(0, 11)).toBe(1);
  });

  it("通常の半音隣接と、半音でない距離を区別する", () => {
    expect(circularSemitoneDistance(0, 1)).toBe(1);
    expect(circularSemitoneDistance(0, 2)).toBe(2);
    expect(circularSemitoneDistance(5, 7)).toBe(2);
    expect(circularSemitoneDistance(0, 6)).toBe(6);
    expect(circularSemitoneDistance(0, 0)).toBe(0);
  });
});

describe("buildSafeConsonanceIntervals（安全協和音高クラス集合＝根音からの音程）", () => {
  it("短三和音は短調系の付加音（11度・♭7度）を採る", () => {
    expect(buildSafeConsonanceIntervals("minor")).toEqual([0, 3, 5, 7, 10]);
  });

  it("長三和音は長調系の付加音（9度・6度）を採る", () => {
    expect(buildSafeConsonanceIntervals("major")).toEqual([0, 2, 4, 7, 9]);
  });

  it("長七和音は構成音に9度・6度を加えた6音になる（第7音を含む）", () => {
    expect(buildSafeConsonanceIntervals("majorSeventh")).toEqual([0, 2, 4, 7, 9, 11]);
  });

  it("短七和音は♭7度が構成音と重複するため11度だけを加える", () => {
    expect(buildSafeConsonanceIntervals("minorSeventh")).toEqual([0, 3, 5, 7, 10]);
  });

  it("長六和音は6度が構成音そのものなので重複追加せず、9度だけを加える", () => {
    expect(buildSafeConsonanceIntervals("majorSixth")).toEqual([0, 2, 4, 7, 9]);
  });

  it("属七和音は6度が♭7度と半音隣接になるため不採用で、9度だけを加える", () => {
    expect(buildSafeConsonanceIntervals("dominantSeventh")).toEqual([0, 2, 4, 7, 10]);
  });

  it("増三和音は6度が増5度と半音隣接になるため不採用で、9度だけを加えた4音になる", () => {
    expect(buildSafeConsonanceIntervals("augmented")).toEqual([0, 2, 4, 8]);
  });

  it("減三和音は短調系で、完全4度が減5度と半音隣接で不採用、♭7度だけを加えた4音になる", () => {
    // 減三和音[0,3,6]に短調系付加音[5,10]を試す。完全4度(5)は減5度(6)と半音隣接で不採用、♭7度(10)が採用され[0,3,6,10]。
    expect(buildSafeConsonanceIntervals("diminished")).toEqual([0, 3, 6, 10]);
  });

  it("二度保留和音は短調系で、完全4度と♭7度の両方を加えた5音になる", () => {
    // 二度保留和音[0,2,7]に短調系付加音[5,10]を試す。いずれも既存音と半音隣接せず採用され[0,2,5,7,10]。
    expect(buildSafeConsonanceIntervals("suspendedSecond")).toEqual([0, 2, 5, 7, 10]);
  });

  it("品質区分表と付加音表は全品質を網羅する", () => {
    for (const quality of ALL_QUALITIES) {
      const category = QUALITY_TO_TONE_CATEGORY[quality];
      expect(category === "majorType" || category === "minorType").toBe(true);
      expect(SAFE_ADDED_TONE_SEMITONES[category].length).toBeGreaterThan(0);
    }
  });

  it("全品質で出力の音程は狭義昇順である", () => {
    for (const quality of ALL_QUALITIES) {
      const intervals = buildSafeConsonanceIntervals(quality);
      for (let i = 1; i < intervals.length; i++) {
        expect(intervals[i]).toBeGreaterThan(intervals[i - 1]);
      }
    }
  });
});

describe("generateSlotPitches（承認済みの具体例の期待値固定）", () => {
  const slots = (name: string): number[] => chordNameToSlotPitches(name);

  it("Fm（短三和音）", () => {
    expect(slots("Fm")).toEqual([77, 82, 84, 89, 92, 96, 99]);
  });

  it("DbM7（長七和音）", () => {
    expect(slots("DbM7")).toEqual([73, 77, 82, 85, 87, 92, 96]);
  });

  it("Caug（増三和音）", () => {
    expect(slots("Caug")).toEqual([72, 74, 76, 84, 86, 88, 92]);
  });

  it("Eb6（長六和音）", () => {
    expect(slots("Eb6")).toEqual([75, 79, 82, 87, 89, 94, 96]);
  });
});

describe("generateSlotPitches（並び順の契約と不変条件）", () => {
  it("出力はMIDIノート番号の昇順で重複がなく、最低音は根音である", () => {
    for (const quality of ALL_QUALITIES) {
      for (let rootPitchClass = 0; rootPitchClass < SEMITONES_PER_OCTAVE; rootPitchClass++) {
        const pitches = generateSlotPitches({ rootPitchClass, quality, bassPitchClass: null });
        for (let i = 1; i < pitches.length; i++) {
          expect(pitches[i]).toBeGreaterThan(pitches[i - 1]); // 狭義昇順＝昇順かつ一意
        }
        expect(pitches[0]).toBe(CHORD_PITCH_BASE_C_MIDI + rootPitchClass); // 最低音=根音
      }
    }
  });

  it("全要素は0以上127以下の整数である", () => {
    for (const quality of ALL_QUALITIES) {
      for (let rootPitchClass = 0; rootPitchClass < SEMITONES_PER_OCTAVE; rootPitchClass++) {
        const pitches = generateSlotPitches({ rootPitchClass, quality, bassPitchClass: null });
        for (const pitch of pitches) {
          expect(Number.isInteger(pitch)).toBe(true);
          expect(pitch).toBeGreaterThanOrEqual(MIDI_MIN);
          expect(pitch).toBeLessThanOrEqual(MIDI_MAX);
        }
      }
    }
  });

  it("各スロット音高は安全協和音高クラス集合に属する（協和性）", () => {
    for (const quality of ALL_QUALITIES) {
      const safePitchClasses = new Set(
        buildSafeConsonanceIntervals(quality).map((iv) => iv % SEMITONES_PER_OCTAVE)
      );
      for (let rootPitchClass = 0; rootPitchClass < SEMITONES_PER_OCTAVE; rootPitchClass++) {
        const pitches = generateSlotPitches({ rootPitchClass, quality, bassPitchClass: null });
        for (const pitch of pitches) {
          const relativePitchClass = ((pitch - (CHORD_PITCH_BASE_C_MIDI + rootPitchClass)) % SEMITONES_PER_OCTAVE + SEMITONES_PER_OCTAVE) % SEMITONES_PER_OCTAVE;
          expect(safePitchClasses.has(relativePitchClass)).toBe(true);
        }
      }
    }
  });
});

describe("generateSlotPitches（スロット数の指定と境界）", () => {
  it("既定はPITCH_SLOT_COUNT_DEFAULT個を返す", () => {
    expect(chordNameToSlotPitches("Fm")).toHaveLength(PITCH_SLOT_COUNT_DEFAULT);
  });

  it("下限と上限のスロット数ちょうどを返す（候補が足りる品質）", () => {
    expect(chordNameToSlotPitches("Fm", { slotCount: PITCH_SLOT_COUNT_MIN })).toHaveLength(PITCH_SLOT_COUNT_MIN);
    expect(chordNameToSlotPitches("Fm", { slotCount: PITCH_SLOT_COUNT_MAX })).toHaveLength(PITCH_SLOT_COUNT_MAX);
  });

  it("スロット数が範囲外（4・10）や非整数なら例外を出す", () => {
    expect(() => chordNameToSlotPitches("Fm", { slotCount: 4 })).toThrow();
    expect(() => chordNameToSlotPitches("Fm", { slotCount: 10 })).toThrow();
    expect(() => chordNameToSlotPitches("Fm", { slotCount: 7.5 })).toThrow();
  });
});

describe("generateSlotPitches（性質テスト: 12根音 × 全品質 × スロット数5/7/9）", () => {
  it("スロット数5と7は全品質・全根音で例外なく生成でき、指定数ちょうどを返す", () => {
    for (const slotCount of [5, 7]) {
      for (const quality of ALL_QUALITIES) {
        for (let rootPitchClass = 0; rootPitchClass < SEMITONES_PER_OCTAVE; rootPitchClass++) {
          const pitches = generateSlotPitches({ rootPitchClass, quality, bassPitchClass: null }, { slotCount });
          expect(pitches).toHaveLength(slotCount);
        }
      }
    }
  });

  it("スロット数9は安全協和音高が4音高クラスの品質（増三和音・減三和音）だけが候補不足の例外になり、他の品質は例外なく生成できる", () => {
    // 採用理由を先に述べる。2オクターブ展開の候補数は安全協和音高クラス数の2倍である。スロット数9を作るには候補が9個以上、
    // すなわち安全協和音高クラスが5個以上必要である。増三和音[0,2,4,8]と減三和音[0,3,6,10]はいずれも4音高クラス（候補8個）で
    // 9に満たず例外になる。他の品質は5音高クラス以上（候補10個以上）で9を作れる。
    const insufficientForNine = new Set(["augmented", "diminished"]);
    for (const quality of ALL_QUALITIES) {
      for (let rootPitchClass = 0; rootPitchClass < SEMITONES_PER_OCTAVE; rootPitchClass++) {
        const parsed = { rootPitchClass, quality, bassPitchClass: null };
        if (insufficientForNine.has(quality)) {
          expect(() => generateSlotPitches(parsed, { slotCount: 9 })).toThrow();
        } else {
          expect(generateSlotPitches(parsed, { slotCount: 9 })).toHaveLength(9);
        }
      }
    }
  });
});

describe("generateSlotPitches（基準音の上書きとMIDI範囲外）", () => {
  it("基準音を120近辺の上限へ上書きすると、2オクターブ展開後に127を超えて例外を出す", () => {
    // 基準音120のとき長七和音は第7音(11半音)の1オクターブ上が 120+11+12=143 となり127を超える。
    expect(() => chordNameToSlotPitches("CM7", { baseCMidi: 120 })).toThrow();
  });

  it("基準音を負へ上書きすると、根音のMIDIノート番号が0を下回り例外を出す", () => {
    // 基準音-1のとき根音Cの rootMidi が -1 となり0未満で範囲外になる。
    expect(() => chordNameToSlotPitches("C", { baseCMidi: -1 })).toThrow();
  });

  it("基準音が整数でない場合は入口で例外を出す", () => {
    expect(() => chordNameToSlotPitches("C", { baseCMidi: 72.5 })).toThrow();
  });

  it("基準音の既定では全品質・全根音で範囲内に収まる", () => {
    for (const quality of ALL_QUALITIES) {
      for (let rootPitchClass = 0; rootPitchClass < SEMITONES_PER_OCTAVE; rootPitchClass++) {
        expect(() => generateSlotPitches({ rootPitchClass, quality, bassPitchClass: null })).not.toThrow();
      }
    }
  });
});

describe("分数和音は基底和音と同じスロットになる（低音は不使用）", () => {
  it("F/A は F と、Ab/C と Ab/Eb は Ab と一致する", () => {
    expect(chordNameToSlotPitches("F/A")).toEqual(chordNameToSlotPitches("F"));
    expect(chordNameToSlotPitches("Ab/C")).toEqual(chordNameToSlotPitches("Ab"));
    expect(chordNameToSlotPitches("Ab/Eb")).toEqual(chordNameToSlotPitches("Ab"));
  });
});

describe("異常系と決定論", () => {
  it("無和音「N」は例外を出す（解決は Issue #37 の責務）", () => {
    expect(() => chordNameToSlotPitches("N")).toThrow();
  });

  it("解析不能な和音名は例外を出す", () => {
    expect(() => chordNameToSlotPitches("Xyz")).toThrow();
  });

  it("同じ入力に対し常に同じ出力を返す（決定論）", () => {
    const parsed = parseChordSymbol("DbM7");
    expect(generateSlotPitches(parsed)).toEqual(generateSlotPitches(parsed));
  });
});

describe("generateChordToneSlots（配列版）", () => {
  const regions: ResolvedChordRegion[] = [
    { startTimeMs: 0, endTimeMs: 1000, chordName: "Fm" },
    { startTimeMs: 1000, endTimeMs: 2000, chordName: "DbM7" },
  ];

  it("各区間の時刻と和音名を保ちつつ pitches を生成する", () => {
    const slots = generateChordToneSlots(regions);
    expect(slots).toHaveLength(2);
    expect(slots[0]).toEqual({
      startTimeMs: 0,
      endTimeMs: 1000,
      chordName: "Fm",
      pitches: [77, 82, 84, 89, 92, 96, 99],
    });
    expect(slots[1].chordName).toBe("DbM7");
    expect(slots[1].pitches).toEqual([73, 77, 82, 85, 87, 92, 96]);
  });

  it("無和音「N」を含む配列は、区間添字と和音名を含む例外を出す", () => {
    const withNoChord: ResolvedChordRegion[] = [
      { startTimeMs: 0, endTimeMs: 1000, chordName: "Fm" },
      { startTimeMs: 1000, endTimeMs: 2000, chordName: "N" },
    ];
    expect(() => generateChordToneSlots(withNoChord)).toThrow(/区間\[1\]/);
    expect(() => generateChordToneSlots(withNoChord)).toThrow(/N/);
  });

  it("空の配列には空の配列を返す", () => {
    expect(generateChordToneSlots([])).toEqual([]);
  });

  it("スロット数の指定が各区間へ反映される", () => {
    const slots = generateChordToneSlots(regions, { slotCount: 5 });
    for (const region of slots) {
      expect(region.pitches).toHaveLength(5);
    }
  });
});
