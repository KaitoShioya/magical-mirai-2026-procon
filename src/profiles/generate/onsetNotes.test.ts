import { describe, expect, it } from "vitest";
import { DEFAULT_ONSET_OPTIONS, generateOnsetNotes, type OnsetBeat, type OnsetInput } from "./onsetNotes";
import type { ChorusSegment } from "./types";

// 拍を等間隔で組み立てる補助。index は0始まりの連番、開始時刻は stepMs 刻み。
function beatsEvery(count: number, stepMs: number, firstMs = 0): OnsetBeat[] {
  const out: OnsetBeat[] = [];
  for (let i = 0; i < count; i++) {
    out.push({ index: i, startTimeMs: firstMs + i * stepMs });
  }
  return out;
}

describe("generateOnsetNotes（オンセット選択・ノーツ生成、Issue #38）", () => {
  it("サビ区間が無いとき、サビ以外として2拍に1回（既定）選ぶ", () => {
    const input: OnsetInput = { beats: beatsEvery(10, 343), chorusSegments: [] };
    const notes = generateOnsetNotes(input);
    // 10拍を2拍に1回 → 拍索引 0,2,4,6,8 の5個。
    expect(notes.map((n) => n.beatIndex)).toEqual([0, 2, 4, 6, 8]);
    expect(notes.every((n) => n.sectionKind === "nonChorus")).toBe(true);
  });

  it("全拍がサビのとき、毎拍（既定）選ぶ", () => {
    const beats = beatsEvery(8, 343);
    const chorus: ChorusSegment[] = [{ startMs: 0, endMs: 8 * 343 }];
    const notes = generateOnsetNotes({ beats, chorusSegments: chorus });
    expect(notes.map((n) => n.beatIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(notes.every((n) => n.sectionKind === "chorus")).toBe(true);
  });

  it("サビとサビ以外が混在するとき、種別ごとに独立した計数器で間引き、サビ先頭拍を必ず選ぶ", () => {
    // 拍0..5（時刻0,100,...,500）。サビ区間は時刻250以上450未満で、拍2(200)はサビ外、拍3(300)・拍4(400)がサビ。
    const beats = beatsEvery(6, 100);
    const chorus: ChorusSegment[] = [{ startMs: 250, endMs: 450 }];
    const notes = generateOnsetNotes({ beats, chorusSegments: chorus });
    // サビ以外の拍は出現順に 0,1,2,5。2拍に1回（計数器0,1,2,3）で計数器が偶数の拍0と拍2を選ぶ。
    // サビの拍は出現順に 3,4。毎拍で両方選び、サビ先頭の拍3が必ず選ばれる。
    expect(notes.map((n) => n.beatIndex)).toEqual([0, 2, 3, 4]);
    expect(notes.map((n) => n.sectionKind)).toEqual(["nonChorus", "nonChorus", "chorus", "chorus"]);
  });

  it("サビ区間の終端時刻にちょうど重なる拍は、右半開判定によりサビ以外に分類する", () => {
    // 拍1の時刻はちょうどサビ終端。endMs 未満でないためサビ外。
    const beats: OnsetBeat[] = [
      { index: 0, startTimeMs: 0 },
      { index: 1, startTimeMs: 200 },
    ];
    const chorus: ChorusSegment[] = [{ startMs: 0, endMs: 200 }];
    const notes = generateOnsetNotes({ beats, chorusSegments: chorus });
    const byIndex = new Map(notes.map((n) => [n.beatIndex, n.sectionKind]));
    expect(byIndex.get(0)).toBe("chorus");
    expect(byIndex.get(1)).toBe("nonChorus");
  });

  it("拍が空のとき、空配列を返す", () => {
    expect(generateOnsetNotes({ beats: [], chorusSegments: [] })).toEqual([]);
  });

  it("拍の index が配列の位置と一致しない（飛び番号の）とき、拍自身の index を保持する", () => {
    const beats: OnsetBeat[] = [
      { index: 10, startTimeMs: 0 },
      { index: 11, startTimeMs: 100 },
      { index: 12, startTimeMs: 200 },
    ];
    const notes = generateOnsetNotes({ beats, chorusSegments: [] });
    // 2拍に1回 → 出現順0番目と2番目、すなわち index 10 と 12。
    expect(notes.map((n) => n.beatIndex)).toEqual([10, 12]);
  });

  it("id は固定4桁ゼロ埋めの選択順連番で、一意かつ昇順である", () => {
    const notes = generateOnsetNotes({ beats: beatsEvery(6, 100), chorusSegments: [] });
    expect(notes.map((n) => n.id)).toEqual(["note-0000", "note-0001", "note-0002"]);
    expect(new Set(notes.map((n) => n.id)).size).toBe(notes.length);
  });

  it("間引き間隔のオプション上書きが効く", () => {
    const beats = beatsEvery(9, 100);
    const chorus: ChorusSegment[] = [{ startMs: 0, endMs: 9 * 100 }];
    // サビを3拍に1回へ上書き。出現順0,3,6 → 索引0,3,6。
    const notes = generateOnsetNotes({ beats, chorusSegments: chorus }, { chorusBeatStride: 3 });
    expect(notes.map((n) => n.beatIndex)).toEqual([0, 3, 6]);
  });

  it("接頭辞のオプション上書きが効く", () => {
    const notes = generateOnsetNotes({ beats: beatsEvery(1, 100), chorusSegments: [] }, { idPrefix: "n_" });
    expect(notes[0].id).toBe("n_0000");
  });

  it("間引き間隔に0・1未満・非整数を渡すと例外を投げる", () => {
    const input: OnsetInput = { beats: beatsEvery(4, 100), chorusSegments: [] };
    expect(() => generateOnsetNotes(input, { nonChorusBeatStride: 0 })).toThrow();
    expect(() => generateOnsetNotes(input, { nonChorusBeatStride: -1 })).toThrow();
    expect(() => generateOnsetNotes(input, { nonChorusBeatStride: 1.5 })).toThrow();
    expect(() => generateOnsetNotes(input, { chorusBeatStride: 0 })).toThrow();
  });

  it("同じ入力に対し常に同じ出力を返す（決定論）", () => {
    const input: OnsetInput = {
      beats: beatsEvery(20, 100),
      chorusSegments: [{ startMs: 500, endMs: 1200 }],
    };
    const first = generateOnsetNotes(input);
    const second = generateOnsetNotes(input);
    expect(second).toEqual(first);
  });

  it("既定オプションはサビ毎拍・サビ以外2拍に1回である", () => {
    expect(DEFAULT_ONSET_OPTIONS.chorusBeatStride).toBe(1);
    expect(DEFAULT_ONSET_OPTIONS.nonChorusBeatStride).toBe(2);
  });
});
