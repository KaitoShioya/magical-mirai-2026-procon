import { describe, it, expect } from "vitest";
import {
  buildDiversityIndex,
  type DiversityNoteInput,
  type DiversityZoneInput,
} from "./diversityIndex";

// 区間2件。theme [0,1000) と variation [2000,3000)。意図的に与える順序を入れ替えて整列を検査する。
const themeZone: DiversityZoneInput = { startTimeMs: 0, endTimeMs: 1000 };
const variationZone: DiversityZoneInput = { startTimeMs: 2000, endTimeMs: 3000 };

// theme は3ノーツ（拍オフセット0,1,2、正解スロット0始まりで1,2,1）。
// variation は4ノーツ（拍オフセット0,1,2,3、正解スロット0始まりで3,3,4,5）。末尾の拍オフセット3は theme に対応が無い。
const notes: DiversityNoteInput[] = [
  { id: "t0", timeMs: 100, beatIndex: 10, slotIndex: 2 },
  { id: "t1", timeMs: 200, beatIndex: 11, slotIndex: 3 },
  { id: "t2", timeMs: 300, beatIndex: 12, slotIndex: 2 },
  { id: "outside", timeMs: 1500, beatIndex: 30, slotIndex: 4 }, // どの区間にも入らない
  { id: "v0", timeMs: 2100, beatIndex: 50, slotIndex: 4 },
  { id: "v1", timeMs: 2200, beatIndex: 51, slotIndex: 4 },
  { id: "v2", timeMs: 2300, beatIndex: 52, slotIndex: 5 },
  { id: "v3", timeMs: 2400, beatIndex: 53, slotIndex: 6 },
];

describe("buildDiversityIndex", () => {
  it("区間を時刻昇順へ整列し、整列後の索引で前回区間を直前にする", () => {
    // 非整列（variation を先に）で渡しても、時刻順に theme=区間0・variation=区間1 になる。
    const index = buildDiversityIndex(notes, [variationZone, themeZone]);
    expect(index.previousZoneIndex).toEqual([undefined, 0]);
    expect(index.byNoteId.get("t0")?.zoneIndex).toBe(0);
    expect(index.byNoteId.get("v0")?.zoneIndex).toBe(1);
  });

  it("拍オフセット0が各区間で最初に現れるノーツに対応する", () => {
    const index = buildDiversityIndex(notes, [themeZone, variationZone]);
    expect(index.byNoteId.get("t0")?.beatOffset).toBe(0);
    expect(index.byNoteId.get("v0")?.beatOffset).toBe(0);
    // 区間先頭からの相対拍位置になる。
    expect(index.byNoteId.get("t2")?.beatOffset).toBe(2);
    expect(index.byNoteId.get("v3")?.beatOffset).toBe(3);
  });

  it("正解スロットを slotIndex から1引いた0始まりで持つ", () => {
    const index = buildDiversityIndex(notes, [themeZone, variationZone]);
    expect(index.byNoteId.get("t0")?.correctSlot0).toBe(1);
    expect(index.zoneCorrectSlots[0].get(0)).toBe(1);
    expect(index.zoneCorrectSlots[0].get(1)).toBe(2);
    expect(index.zoneCorrectSlots[1].get(0)).toBe(3);
    expect(index.zoneCorrectSlots[1].get(3)).toBe(5);
  });

  it("どの区間にも入らないノーツは登録しない", () => {
    const index = buildDiversityIndex(notes, [themeZone, variationZone]);
    expect(index.byNoteId.has("outside")).toBe(false);
  });

  it("ノーツ数の異なる区間で、前回区間に無い拍オフセットは正解スロットの写像に現れない", () => {
    // variation の拍オフセット3は theme（区間0）に存在しないため、区間0の写像には3が無い。
    const index = buildDiversityIndex(notes, [themeZone, variationZone]);
    expect(index.zoneCorrectSlots[0].has(3)).toBe(false);
    expect(index.zoneCorrectSlots[1].has(3)).toBe(true);
  });

  it("ノーツの無い区間は空の正解スロット写像を持つ", () => {
    const emptyZone: DiversityZoneInput = { startTimeMs: 5000, endTimeMs: 6000 };
    const index = buildDiversityIndex(notes, [themeZone, variationZone, emptyZone]);
    expect(index.zoneCorrectSlots[2].size).toBe(0);
    expect(index.previousZoneIndex[2]).toBe(1);
  });
});
