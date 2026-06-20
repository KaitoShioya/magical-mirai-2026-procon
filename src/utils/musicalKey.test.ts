import { describe, expect, it } from "vitest";
import {
  PITCH_CLASS_TO_FLAT_NAME,
  pitchClassToFlatNoteName,
  tonicChordSymbol,
} from "./musicalKey";
import { parseChordSymbol } from "./chordPitch";

describe("pitchClassToFlatNoteName", () => {
  it("0〜11の全音高クラスを表記規則どおりの音名へ変換する", () => {
    const expected = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
    for (let pc = 0; pc < 12; pc++) {
      expect(pitchClassToFlatNoteName(pc)).toBe(expected[pc]);
    }
  });

  it("対応表と一致する", () => {
    expect(PITCH_CLASS_TO_FLAT_NAME.length).toBe(12);
    for (let pc = 0; pc < 12; pc++) {
      expect(pitchClassToFlatNoteName(pc)).toBe(PITCH_CLASS_TO_FLAT_NAME[pc]);
    }
  });

  it("範囲外や非整数は例外", () => {
    expect(() => pitchClassToFlatNoteName(-1)).toThrow();
    expect(() => pitchClassToFlatNoteName(12)).toThrow();
    expect(() => pitchClassToFlatNoteName(1.5)).toThrow();
  });
});

describe("tonicChordSymbol", () => {
  it("ファ短調の主和音は Fm", () => {
    expect(tonicChordSymbol(5, "minor")).toBe("Fm");
  });

  it("ファ長調の主和音は F", () => {
    expect(tonicChordSymbol(5, "major")).toBe("F");
  });

  it("変化記号付きの根音でも主和音記号を作る", () => {
    expect(tonicChordSymbol(1, "minor")).toBe("Dbm");
    expect(tonicChordSymbol(3, "major")).toBe("Eb");
  });

  it("生成した主和音記号は parseChordSymbol が根音と品質を往復で復元できる", () => {
    for (let pc = 0; pc < 12; pc++) {
      const minorSymbol = tonicChordSymbol(pc, "minor");
      const parsedMinor = parseChordSymbol(minorSymbol);
      expect(parsedMinor.rootPitchClass).toBe(pc);
      expect(parsedMinor.quality).toBe("minor");

      const majorSymbol = tonicChordSymbol(pc, "major");
      const parsedMajor = parseChordSymbol(majorSymbol);
      expect(parsedMajor.rootPitchClass).toBe(pc);
      expect(parsedMajor.quality).toBe("major");
    }
  });
});
