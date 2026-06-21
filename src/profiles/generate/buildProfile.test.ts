import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildProfile, buildNcRanges } from "./buildProfile";
import { takeoverInputs } from "../takeover/takeoverInputs";
import { type RawSongmap } from "./songmapAdapters";
import { SONGS } from "../../config/songs";
import { TAP_LIMIT_RATIO_MIN, TAP_LIMIT_RATIO_MAX } from "../../config/tuning";
import type { Chord, ProfileSource } from "../schema/profileSchema";

// 実データ（TAKEOVERの音楽地図ダンプ）を素のデータファイルとして読む。src/tools/ への import は一切しない
// （profiles から tools への依存禁止に抵触しない）。
const songmapPath = fileURLToPath(new URL("../../../docs/analysis/takeover.songmap.json", import.meta.url));
const songmap = JSON.parse(readFileSync(songmapPath, "utf8")) as RawSongmap;

// ロード元は登録済みの TAKEOVER 設定から組む。検証関数は source が SONGS の登録値と一致することを要求するためである。
const takeoverSong = SONGS.find((s) => s.key === "takeover");
if (takeoverSong === undefined) {
  throw new Error("ロード設定 SONGS に takeover が登録されていません");
}
const source: ProfileSource = {
  songKey: takeoverSong.key,
  songUrl: takeoverSong.songUrl,
  video: takeoverSong.video,
};

describe("曲プロファイル生成 実データ検証（Issue #45 受け入れ基準）", () => {
  const { profile, validation } = buildProfile({ songmap, manual: takeoverInputs, source });

  it("達成基準: TAKEOVER から組んだプロファイルが検証を通る", () => {
    // 不合格時に原因を一覧で見せるため、誤りの配列を空配列と比較する。
    const errors = validation.ok ? [] : validation.errors;
    expect(errors).toEqual([]);
    expect(validation.ok).toBe(true);
  });

  it("スロット数が和音区間数と一致し、無和音解決後のスロット和音名が「N」でない", () => {
    expect(profile.slots).toHaveLength(profile.chords.length);
    expect(profile.slots).toHaveLength(210);
    for (const slot of profile.slots) {
      expect(slot.chordName).not.toBe("N");
    }
  });

  it("最終見せ場（isClimax が真）がちょうど1つ", () => {
    const climaxCount = profile.showcases.filter((s) => s.isClimax).length;
    expect(climaxCount).toBe(1);
  });

  it("全ノーツの slotIndex が1からスロット数の範囲に収まる", () => {
    const slotCount = profile.slots[0].pitches.length;
    expect(slotCount).toBe(7);
    for (const note of profile.notes) {
      expect(note.slotIndex).toBeGreaterThanOrEqual(1);
      expect(note.slotIndex).toBeLessThanOrEqual(slotCount);
    }
  });

  it("タップ上限の比率が範囲内（0.4から0.8）に収まる", () => {
    const ratio = profile.tapBudget.limit / profile.tapBudget.fullPossible;
    expect(ratio).toBeGreaterThanOrEqual(TAP_LIMIT_RATIO_MIN);
    expect(ratio).toBeLessThanOrEqual(TAP_LIMIT_RATIO_MAX);
  });

  it("代表テンポが175である", () => {
    expect(profile.tempoBpm).toBe(175);
  });

  it("無和音区間の埋め方の既定規則: 曲頭の無和音は scale、直前が非Nの無和音は previous", () => {
    // TAKEOVER の無和音は和音索引 0・22・24・99・170・209 の6区間で、連続する無和音は無い。
    // 索引0は曲頭で直前和音が無いため scale、残り5区間は直前に無和音でない和音が隣接するため previous になる。
    expect(profile.ncRanges).toHaveLength(6);
    expect(profile.ncRanges[0].treatment).toBe("scale");
    for (let i = 1; i < profile.ncRanges.length; i++) {
      expect(profile.ncRanges[i].treatment).toBe("previous");
    }
  });
});

describe("無和音区間の埋め方の既定規則と上書き（buildNcRanges）", () => {
  // 合成の和音列。曲頭の無和音・直前が非Nの無和音・連続する無和音の3場合を1つに含める。
  function makeChord(index: number, name: string, startTimeMs: number, endTimeMs: number): Chord {
    return { index, name, startTimeMs, endTimeMs, durationMs: endTimeMs - startTimeMs };
  }
  const chords: Chord[] = [
    makeChord(0, "N", 0, 1000), // 曲頭の無和音 → scale
    makeChord(1, "Fm", 1000, 2000),
    makeChord(2, "N", 2000, 3000), // 直前が非N（Fm）→ previous
    makeChord(3, "N", 3000, 4000), // 直前も無和音（連続）→ scale
    makeChord(4, "Ab", 4000, 5000),
  ];

  it("既定規則: 曲頭と連続無和音は scale、直前が非Nの無和音は previous", () => {
    const ncRanges = buildNcRanges(chords, undefined);
    expect(ncRanges).toHaveLength(3);
    expect(ncRanges[0]).toMatchObject({ startTimeMs: 0, endTimeMs: 1000, treatment: "scale" });
    expect(ncRanges[1]).toMatchObject({ startTimeMs: 2000, endTimeMs: 3000, treatment: "previous" });
    expect(ncRanges[2]).toMatchObject({ startTimeMs: 3000, endTimeMs: 4000, treatment: "scale" });
  });

  it("上書き: 和音索引で指定した区間の埋め方が既定規則より優先される", () => {
    const ncRanges = buildNcRanges(chords, { 2: "scale" });
    // 索引2は既定では previous だが、上書きで scale になる。
    expect(ncRanges[1]).toMatchObject({ startTimeMs: 2000, endTimeMs: 3000, treatment: "scale" });
  });
});

describe("暫定値の検出（後続 Issue での置換を促すための主張）", () => {
  it("TAKEOVER の手動カメラが未指定で、生成プロファイルが自動の暫定2点軌跡を持つ", () => {
    // 後続 Issue #32・#46 が takeoverInputs.camera に実カメラ軌跡を与えると camera が未指定でなくなり、
    // この主張が落ちて置換を検知できる。暫定値が無言で本番内容に居座るのを防ぐためである。
    expect(takeoverInputs.camera).toBeUndefined();
    const { profile } = buildProfile({ songmap, manual: takeoverInputs, source });
    expect(profile.camera).toHaveLength(2);
  });
});
