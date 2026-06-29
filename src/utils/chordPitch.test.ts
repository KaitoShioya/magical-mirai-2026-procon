import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  isNoChordSymbol,
  parseChordSymbol,
  expandChordToPitchSet,
  chordSymbolToPitchSet,
  CHORD_QUALITY_INTERVALS,
  CHORD_PITCH_BASE_C_MIDI,
  type ParsedChord,
} from "./chordPitch";

// 1オクターブの半音数（音高クラスの算出に使う）。
const SEMITONES_PER_OCTAVE = 12;

// 集合が出力の不変条件（昇順・0〜127整数・重複なし・各音高クラスがちょうど2個）を満たすかを確かめる補助。
function expectValidPitchSet(pitches: number[], expectedPitchClassCount: number): void {
  expect(pitches.length).toBe(expectedPitchClassCount * 2);
  // 昇順かつ重複なし。
  for (let i = 1; i < pitches.length; i += 1) {
    expect(pitches[i]).toBeGreaterThan(pitches[i - 1]);
  }
  // 0〜127の整数。
  for (const pitch of pitches) {
    expect(Number.isInteger(pitch)).toBe(true);
    expect(pitch).toBeGreaterThanOrEqual(0);
    expect(pitch).toBeLessThanOrEqual(127);
  }
  // 各音高クラスがちょうど2個（2オクターブ展開）。
  const countByPitchClass = new Map<number, number>();
  for (const pitch of pitches) {
    const pitchClass = ((pitch % SEMITONES_PER_OCTAVE) + SEMITONES_PER_OCTAVE) % SEMITONES_PER_OCTAVE;
    countByPitchClass.set(pitchClass, (countByPitchClass.get(pitchClass) ?? 0) + 1);
  }
  expect(countByPitchClass.size).toBe(expectedPitchClassCount);
  for (const count of countByPitchClass.values()) {
    expect(count).toBe(2);
  }
}

// 実データ（TAKEOVERの音楽地図ダンプ）から和音名のみを読み出す。本モジュールは時刻を使わないため name だけを使う。
const songmapPath = fileURLToPath(
  new URL("../../docs/analysis/takeover.songmap.json", import.meta.url)
);
const songmap = JSON.parse(readFileSync(songmapPath, "utf8")) as {
  chords: { name: string }[];
};
const uniqueRealChordNames = [
  ...new Set(songmap.chords.map((chord) => chord.name)),
].filter((name) => !isNoChordSymbol(name));

describe("実データ網羅（達成基準の直接検証）", () => {
  it("和音区間が210でうち無和音が6、実在和音が16種である", () => {
    expect(songmap.chords.length).toBe(210);
    const noChordCount = songmap.chords.filter((chord) => isNoChordSymbol(chord.name)).length;
    expect(noChordCount).toBe(6);
    expect(uniqueRealChordNames.length).toBe(16);
  });

  it("全ての実在和音が例外なく有効な音高集合へ変換される", () => {
    for (const name of uniqueRealChordNames) {
      const parsed = parseChordSymbol(name);
      const pitches = chordSymbolToPitchSet(name);
      const pitchClassCount = CHORD_QUALITY_INTERVALS[parsed.quality].length;
      expectValidPitchSet(pitches, pitchClassCount);
    }
  });
});

describe("品質ごとの間隔（検証済みの期待値）", () => {
  const cases: { name: string; expected: number[] }[] = [
    { name: "Fm", expected: [77, 80, 84, 89, 92, 96] },
    { name: "DbM7", expected: [73, 77, 80, 84, 85, 89, 92, 96] },
    { name: "Caug", expected: [72, 76, 80, 84, 88, 92] },
    { name: "Eb6", expected: [75, 79, 82, 84, 87, 91, 94, 96] },
    { name: "Bbm7", expected: [82, 85, 89, 92, 94, 97, 101, 104] },
    { name: "Ab/Eb", expected: [80, 84, 87, 92, 96, 99] },
    { name: "F/A", expected: [77, 81, 84, 89, 93, 96] },
  ];
  for (const { name, expected } of cases) {
    it(`${name} を既定の基準で正しく音高化する`, () => {
      expect(chordSymbolToPitchSet(name)).toEqual(expected);
    });
  }
});

describe("分数和音（低音非注入の契約固定）", () => {
  it("低音が構成音内の分数和音は集合が基底三和音と一致し、低音は記録される", () => {
    // Ab/Eb・Ab/C はいずれもラ♭長三和音で、低音（ミ♭=3・ハ=0）は構成音内のため集合は同一になる。
    const abMajor = chordSymbolToPitchSet("Ab");
    expect(chordSymbolToPitchSet("Ab/Eb")).toEqual(abMajor);
    expect(chordSymbolToPitchSet("Ab/C")).toEqual(abMajor);
    expect(parseChordSymbol("Ab/Eb").bassPitchClass).toBe(3);
    expect(parseChordSymbol("Ab/C").bassPitchClass).toBe(0);
    expect(parseChordSymbol("F/A").bassPitchClass).toBe(9);
  });

  it("低音が構成音外でも集合へ注入されず、低音は記録のみとなる", () => {
    // C/D のニ音（音高クラス2）はハ長三和音（ハ・ホ・ト）の構成音でない。
    const cMajor = chordSymbolToPitchSet("C");
    expect(chordSymbolToPitchSet("C/D")).toEqual(cMajor);
    const parsed = parseChordSymbol("C/D");
    expect(parsed.bassPitchClass).toBe(2);
    expect(chordSymbolToPitchSet("C/D")).not.toContain(CHORD_PITCH_BASE_C_MIDI + 2);
  });
});

describe("変化記号（根音の音高クラス）", () => {
  it("フラット付きの根音を正しく解釈する", () => {
    expect(parseChordSymbol("Bb").rootPitchClass).toBe(10);
    expect(parseChordSymbol("Db").rootPitchClass).toBe(1);
    expect(parseChordSymbol("Eb").rootPitchClass).toBe(3);
    expect(parseChordSymbol("Ab").rootPitchClass).toBe(8);
  });

  it("シャープ付きの根音を正しく解釈し、品質と組み合わせても音高化できる", () => {
    // TAKEOVER にシャープは出現しないが、将来の曲のために実装した分岐を固定する。
    expect(parseChordSymbol("C#").rootPitchClass).toBe(1);
    expect(parseChordSymbol("F#").rootPitchClass).toBe(6);
    expect(parseChordSymbol("C#m").quality).toBe("minor");
    expect(parseChordSymbol("C#m").rootPitchClass).toBe(1);
    // C#=1、長三和音=[0,4,7]、根音MIDI=73 の2オクターブ展開。
    expect(chordSymbolToPitchSet("C#")).toEqual([73, 77, 80, 85, 89, 92]);
  });

  it("二重の変化記号は未対応の品質として例外になる", () => {
    expect(() => parseChordSymbol("Cbb")).toThrow();
    expect(() => parseChordSymbol("C##")).toThrow();
  });
});

describe("品質の大文字小文字区別", () => {
  it("M7 は長七、m7 は短七、m は短三和音として区別される", () => {
    expect(parseChordSymbol("DbM7").quality).toBe("majorSeventh");
    expect(parseChordSymbol("Cm7").quality).toBe("minorSeventh");
    expect(parseChordSymbol("Cm").quality).toBe("minor");
    expect(parseChordSymbol("C").quality).toBe("major");
  });
});

describe("拡張和音への対応（シャッターチャンス Issue #88）", () => {
  it("減三和音 dim を正式な品質として解釈し音高化する", () => {
    expect(parseChordSymbol("Edim").quality).toBe("diminished");
    expect(parseChordSymbol("Edim").rootPitchClass).toBe(4);
    // 減三和音=[0,3,6]、根音 E の MIDI=76 の2オクターブ展開（E・G・B♭の3音）。
    expect(chordSymbolToPitchSet("Edim")).toEqual([76, 79, 82, 88, 91, 94]);
    expectValidPitchSet(chordSymbolToPitchSet("Edim"), 3);
  });

  it("二度保留和音 sus2 を正式な品質として解釈し音高化する", () => {
    expect(parseChordSymbol("Dsus2").quality).toBe("suspendedSecond");
    expect(parseChordSymbol("Dsus2").rootPitchClass).toBe(2);
    // 二度保留和音=[0,2,7]、根音 D の MIDI=74 の2オクターブ展開（D・E・Aの3音）。
    expect(chordSymbolToPitchSet("Dsus2")).toEqual([74, 76, 81, 86, 88, 93]);
    expectValidPitchSet(chordSymbolToPitchSet("Dsus2"), 3);
  });

  it("短九和音 m9 は短九和音（minorNinth）として解釈される", () => {
    // m9 トークンは専用の品質 minorNinth に対応する（基本品質の短七和音とは別の音高集合になる）。
    expect(parseChordSymbol("Cm9").quality).toBe("minorNinth");
  });

  it("テンション付きの和音名は専用の完全一致トークンで基本品質へ写る", () => {
    // 括弧付きのテンション表記は完全一致トークンとして登録し、テンションを無視して基本品質へ写す
    //（括弧除去ではなく完全一致。他曲の括弧付き和音 "7(b13)" の解釈を壊さないため）。
    expect(parseChordSymbol("Dm7(#9)").quality).toBe("minorSeventh");
    expect(parseChordSymbol("Dm7(b9)").quality).toBe("minorSeventh");
    expect(parseChordSymbol("Bm7(#9)").quality).toBe("minorSeventh");
    expect(parseChordSymbol("Dsus2(b9)").quality).toBe("suspendedSecond");
    // テンション付きと基本形で同一の音高集合になる（テンションは集合に入らない）。
    expect(chordSymbolToPitchSet("Dm7(#9)")).toEqual(chordSymbolToPitchSet("Dm7"));
    expect(chordSymbolToPitchSet("Dsus2(b9)")).toEqual(chordSymbolToPitchSet("Dsus2"));
  });
});

describe("無和音の扱い", () => {
  it("isNoChordSymbol が N を真、和音を偽とする", () => {
    expect(isNoChordSymbol("N")).toBe(true);
    expect(isNoChordSymbol(" N ")).toBe(true);
    expect(isNoChordSymbol("Fm")).toBe(false);
  });

  it("N の音高化要求は例外になる", () => {
    expect(() => parseChordSymbol("N")).toThrow();
    expect(() => chordSymbolToPitchSet("N")).toThrow();
  });
});

describe("異常入力", () => {
  it("空文字・未対応の品質・不正な根音は例外になる", () => {
    expect(() => parseChordSymbol("")).toThrow();
    expect(() => parseChordSymbol("Csus4")).toThrow();
    expect(() => parseChordSymbol("Hm")).toThrow();
  });

  it("分数和音の不正な低音は例外になる", () => {
    // 低音の音名が不正（H）、低音が空、低音に余分な文字（品質）が付く場合。
    expect(() => parseChordSymbol("C/H")).toThrow();
    expect(() => parseChordSymbol("C/")).toThrow();
    expect(() => parseChordSymbol("F/Am")).toThrow();
  });

  it("品質が契約外の解析結果は明示的な例外になる", () => {
    // 型検査を経ない呼び出し元が契約外の品質を渡した場合を模す。
    const invalid = {
      rootPitchClass: 0,
      quality: "unknown",
      bassPitchClass: null,
    } as unknown as ParsedChord;
    expect(() => expandChordToPitchSet(invalid)).toThrow();
  });
});

describe("基準オクターブの上書き", () => {
  it("baseCMidi を1オクターブ上げると集合が一様に12移調される", () => {
    const parsed = parseChordSymbol("Fm");
    const base = expandChordToPitchSet(parsed);
    const raised = expandChordToPitchSet(parsed, { baseCMidi: CHORD_PITCH_BASE_C_MIDI + 12 });
    expect(raised).toEqual(base.map((pitch) => pitch + 12));
  });

  it("上限と下限のいずれの範囲外になる上書きも例外になる", () => {
    const parsed = parseChordSymbol("Fm");
    expect(() => expandChordToPitchSet(parsed, { baseCMidi: 200 })).toThrow();
    expect(() => expandChordToPitchSet(parsed, { baseCMidi: -100 })).toThrow();
  });
});
