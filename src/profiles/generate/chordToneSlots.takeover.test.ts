import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  buildSafeConsonanceIntervals,
  generateChordToneSlots,
  type ResolvedChordRegion,
} from "./chordToneSlots";
import { parseChordSymbol, CHORD_PITCH_BASE_C_MIDI } from "../../utils/chordPitch";
import { PITCH_SLOT_COUNT_DEFAULT } from "../../config/tuning";

// 実データ（TAKEOVERの音楽地図ダンプ）を素のデータファイルとして読む。src/tools/ への import は一切しない
// （profiles から tools への依存禁止に抵触しない）。songmap → ResolvedChordRegion の変換はテスト側で行い、
// 生成関数を songmap の形から切り離す。これは #45 の生成スクリプトが行う変換と同じである。
const songmapPath = fileURLToPath(new URL("../../../docs/analysis/takeover.songmap.json", import.meta.url));
const songmap = JSON.parse(readFileSync(songmapPath, "utf8")) as {
  chords: { index: number; name: string; startTime: number; endTime: number; duration: number }[];
};

const SEMITONES_PER_OCTAVE = 12;
const MIDI_MIN = 0;
const MIDI_MAX = 127;
const NO_CHORD_SYMBOL = "N";

// 無和音「N」区間は Issue #37 の解決を経てから #36 へ渡るため、本テストでは除外し実在和音区間だけを対象とする。
const realChordRegions: ResolvedChordRegion[] = songmap.chords
  .filter((chord) => chord.name.trim() !== NO_CHORD_SYMBOL)
  .map((chord) => ({ startTimeMs: chord.startTime, endTimeMs: chord.endTime, chordName: chord.name }));

describe("JUST音程7スロット自動生成 実データ検証（Issue #36 受け入れ基準）", () => {
  const slots = generateChordToneSlots(realChordRegions);

  it("和音区間は全210区間のうち無和音「N」が6区間、実在和音が204区間で、各区間が ChordToneSlotRegion を成す", () => {
    const noChordCount = songmap.chords.filter((chord) => chord.name.trim() === NO_CHORD_SYMBOL).length;
    expect(songmap.chords).toHaveLength(210);
    expect(noChordCount).toBe(6);
    expect(realChordRegions).toHaveLength(204);
    expect(songmap.chords.length - noChordCount).toBe(realChordRegions.length);
    expect(slots).toHaveLength(realChordRegions.length);
  });

  it("達成基準2: 全区間のスロット数がちょうど既定7", () => {
    for (const region of slots) {
      expect(region.pitches).toHaveLength(PITCH_SLOT_COUNT_DEFAULT);
    }
  });

  it("達成基準3: 全区間でMIDI昇順・重複なし・0以上127以下の整数・最低音=根音", () => {
    for (const region of slots) {
      const pitches = region.pitches;
      for (let i = 1; i < pitches.length; i++) {
        expect(pitches[i]).toBeGreaterThan(pitches[i - 1]); // 狭義昇順＝昇順かつ一意
      }
      for (const pitch of pitches) {
        expect(Number.isInteger(pitch)).toBe(true);
        expect(pitch).toBeGreaterThanOrEqual(MIDI_MIN);
        expect(pitch).toBeLessThanOrEqual(MIDI_MAX);
      }
      const parsed = parseChordSymbol(region.chordName);
      expect(pitches[0]).toBe(CHORD_PITCH_BASE_C_MIDI + parsed.rootPitchClass); // 最低音=根音
    }
  });

  it("達成基準1: 全区間で各スロット音高が安全協和音高クラス集合に属する（協和）", () => {
    for (const region of slots) {
      const parsed = parseChordSymbol(region.chordName);
      const safePitchClasses = new Set(
        buildSafeConsonanceIntervals(parsed.quality).map((iv) => iv % SEMITONES_PER_OCTAVE)
      );
      const rootMidi = CHORD_PITCH_BASE_C_MIDI + parsed.rootPitchClass;
      for (const pitch of region.pitches) {
        const relativePitchClass =
          (((pitch - rootMidi) % SEMITONES_PER_OCTAVE) + SEMITONES_PER_OCTAVE) % SEMITONES_PER_OCTAVE;
        expect(safePitchClasses.has(relativePitchClass)).toBe(true);
      }
    }
  });

  it("決定論: 同じ実データから同じ結果", () => {
    expect(generateChordToneSlots(realChordRegions)).toEqual(slots);
  });
});
