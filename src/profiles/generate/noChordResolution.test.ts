import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolveNoChordRegions } from "./noChordResolution";
import { chordSymbolToPitchSet } from "../../utils/chordPitch";
import { minimalValidProfile } from "../schema/fixtures/minimalValidProfile";
import type { Chord, MusicalKey, NcRange, NcTreatment } from "../schema/profileSchema";

// ファ短調（ファのナチュラルマイナー）。docs/research/07-feasibility-and-parameters.md §1.1。
const FM_MINOR_KEY: MusicalKey = { tonicPitchClass: 5, mode: "minor" };

function chord(index: number, name: string, startTimeMs: number, endTimeMs: number): Chord {
  return { index, name, startTimeMs, endTimeMs, durationMs: endTimeMs - startTimeMs };
}

describe("resolveNoChordRegions（合成データ）", () => {
  it("previous は直前の無和音でない区間の和音名を採る", () => {
    const chords: Chord[] = [chord(0, "Fm", 0, 1000), chord(1, "N", 1000, 1500)];
    const ncRanges: NcRange[] = [{ startTimeMs: 1000, endTimeMs: 1500, treatment: "previous" }];

    const result = resolveNoChordRegions(chords, ncRanges, FM_MINOR_KEY);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      chordIndex: 1,
      startTimeMs: 1000,
      endTimeMs: 1500,
      treatment: "previous",
      originalChordName: "N",
      resolvedChordName: "Fm",
    });
  });

  it("scale は調の主和音記号を採る（ファ短調なら Fm）", () => {
    const chords: Chord[] = [chord(0, "N", 0, 1000), chord(1, "Ab", 1000, 2000)];
    const ncRanges: NcRange[] = [{ startTimeMs: 0, endTimeMs: 1000, treatment: "scale" }];

    const result = resolveNoChordRegions(chords, ncRanges, FM_MINOR_KEY);

    expect(result[0].treatment).toBe("scale");
    expect(result[0].resolvedChordName).toBe("Fm");
  });

  it("previous は無和音区間を飛ばして最も近い無和音でない和音まで遡る", () => {
    const chords: Chord[] = [
      chord(0, "Db", 0, 1000),
      chord(1, "N", 1000, 1500),
      chord(2, "N", 1500, 2000),
    ];
    const ncRanges: NcRange[] = [
      { startTimeMs: 1000, endTimeMs: 1500, treatment: "previous" },
      { startTimeMs: 1500, endTimeMs: 2000, treatment: "previous" },
    ];

    const result = resolveNoChordRegions(chords, ncRanges, FM_MINOR_KEY);

    expect(result.map((r) => r.chordIndex)).toEqual([1, 2]);
    expect(result.map((r) => r.resolvedChordName)).toEqual(["Db", "Db"]);
  });

  it("無和音区間の件数と ncRanges 件数が一致しなければ例外", () => {
    const chords: Chord[] = [chord(0, "Fm", 0, 1000), chord(1, "N", 1000, 1500), chord(2, "N", 1500, 2000)];
    const ncRanges: NcRange[] = [{ startTimeMs: 1000, endTimeMs: 1500, treatment: "previous" }];

    expect(() => resolveNoChordRegions(chords, ncRanges, FM_MINOR_KEY)).toThrow(/件数が一致しません/);
  });

  it("対応する ncRanges が無ければ例外", () => {
    const chords: Chord[] = [chord(0, "Fm", 0, 1000), chord(1, "N", 1000, 1500)];
    const ncRanges: NcRange[] = [{ startTimeMs: 8000, endTimeMs: 8500, treatment: "previous" }];

    expect(() => resolveNoChordRegions(chords, ncRanges, FM_MINOR_KEY)).toThrow(/対応する ncRanges がありません/);
  });

  it("対応する ncRanges が複数あれば曖昧として例外", () => {
    // 無和音区間2個・ncRanges2個で件数は一致させ、両 ncRanges が同一区間（1000〜1500）に一致する構成にする。
    // これにより件数不一致検査を通過し、複数一致の検査に到達する。
    const chords: Chord[] = [
      chord(0, "N", 1000, 1500),
      chord(1, "Fm", 1500, 2000),
      chord(2, "N", 2000, 2500),
    ];
    const ncRanges: NcRange[] = [
      { startTimeMs: 1000, endTimeMs: 1500, treatment: "scale" },
      { startTimeMs: 1000, endTimeMs: 1500, treatment: "scale" },
    ];

    expect(() => resolveNoChordRegions(chords, ncRanges, FM_MINOR_KEY)).toThrow(/曖昧/);
  });

  it("曲頭の無和音区間を previous にすると直前和音が無く例外", () => {
    const chords: Chord[] = [chord(0, "N", 0, 1000), chord(1, "Fm", 1000, 2000)];
    const ncRanges: NcRange[] = [{ startTimeMs: 0, endTimeMs: 1000, treatment: "previous" }];

    expect(() => resolveNoChordRegions(chords, ncRanges, FM_MINOR_KEY)).toThrow(/直前に無和音でない和音がありません/);
  });

  it("複数の無和音区間を和音索引の昇順で返す", () => {
    const chords: Chord[] = [
      chord(0, "N", 0, 1000),
      chord(1, "Fm", 1000, 2000),
      chord(2, "N", 2000, 2500),
      chord(3, "Ab", 2500, 3000),
    ];
    const ncRanges: NcRange[] = [
      { startTimeMs: 0, endTimeMs: 1000, treatment: "scale" },
      { startTimeMs: 2000, endTimeMs: 2500, treatment: "previous" },
    ];

    const result = resolveNoChordRegions(chords, ncRanges, FM_MINOR_KEY);

    expect(result.map((r) => r.chordIndex)).toEqual([0, 2]);
    expect(result.map((r) => r.resolvedChordName)).toEqual(["Fm", "Fm"]);
  });

  it("時刻差がちょうど許容差1ミリ秒なら一致する", () => {
    const chords: Chord[] = [chord(0, "Fm", 0, 1000), chord(1, "N", 1000, 1500)];
    const ncRanges: NcRange[] = [{ startTimeMs: 1001, endTimeMs: 1501, treatment: "previous" }];

    const result = resolveNoChordRegions(chords, ncRanges, FM_MINOR_KEY);

    expect(result).toHaveLength(1);
    expect(result[0].resolvedChordName).toBe("Fm");
  });

  it("時刻差が許容差1ミリ秒を超えると一致せず例外", () => {
    const chords: Chord[] = [chord(0, "Fm", 0, 1000), chord(1, "N", 1000, 1500)];
    const ncRanges: NcRange[] = [{ startTimeMs: 1002, endTimeMs: 1502, treatment: "previous" }];

    expect(() => resolveNoChordRegions(chords, ncRanges, FM_MINOR_KEY)).toThrow(/対応する ncRanges がありません/);
  });

  it("開始が一致しても終了が許容差を超えてずれると一致せず例外", () => {
    const chords: Chord[] = [chord(0, "Fm", 0, 1000), chord(1, "N", 1000, 1500)];
    const ncRanges: NcRange[] = [{ startTimeMs: 1000, endTimeMs: 1502, treatment: "previous" }];

    expect(() => resolveNoChordRegions(chords, ncRanges, FM_MINOR_KEY)).toThrow(/対応する ncRanges がありません/);
  });

  it("同一時刻に種別の異なる ncRanges が重複しても曖昧として例外", () => {
    const chords: Chord[] = [
      chord(0, "N", 1000, 1500),
      chord(1, "Fm", 1500, 2000),
      chord(2, "N", 2000, 2500),
    ];
    const ncRanges: NcRange[] = [
      { startTimeMs: 1000, endTimeMs: 1500, treatment: "previous" },
      { startTimeMs: 1000, endTimeMs: 1500, treatment: "scale" },
    ];

    expect(() => resolveNoChordRegions(chords, ncRanges, FM_MINOR_KEY)).toThrow(/曖昧/);
  });

  it("scale で調の主音が音高クラスの範囲外だと主和音記号の生成で例外", () => {
    const chords: Chord[] = [chord(0, "N", 0, 1000), chord(1, "Fm", 1000, 2000)];
    const ncRanges: NcRange[] = [{ startTimeMs: 0, endTimeMs: 1000, treatment: "scale" }];

    expect(() =>
      resolveNoChordRegions(chords, ncRanges, { tonicPitchClass: 12, mode: "minor" }),
    ).toThrow();
    expect(() =>
      resolveNoChordRegions(chords, ncRanges, { tonicPitchClass: 5.5, mode: "minor" }),
    ).toThrow();
  });
});

// 実データ（TAKEOVERの音楽地図ダンプ）を素のデータファイルとして読む。src/tools/ への import はしない。
// songmap → Chord[] の変換はテスト側で行い、解決関数を songmap の形から切り離す（#46 の生成スクリプトと同じ変換）。
const songmapPath = fileURLToPath(new URL("../../../docs/analysis/takeover.songmap.json", import.meta.url));
const songmap = JSON.parse(readFileSync(songmapPath, "utf8")) as {
  chords: { index: number; name: string; startTime: number; endTime: number; duration: number }[];
};
const takeoverChords: Chord[] = songmap.chords.map((c) => ({
  index: c.index,
  name: c.name,
  startTimeMs: c.startTime,
  endTimeMs: c.endTime,
  durationMs: c.duration,
}));

// 無和音区間の treatment 割り当て（docs/research/07 §1.2）。
// 既定は直前和音保持（previous）。曲頭（索引0）は直前和音が無いため scale。
// 歌唱中の唯一の実質的な欠落である32.9〜34.3秒（索引24）は調の音階（scale）。
const TAKEOVER_TREATMENT_BY_INDEX: Record<number, NcTreatment> = {
  0: "scale",
  22: "previous",
  24: "scale",
  99: "previous",
  170: "previous",
  209: "previous",
};

// ファのナチュラルマイナー音階の音名クラス集合 ファ・ソ・ラ♭・シ♭・ド・レ♭・ミ♭。
// = {5,7,8,10,0,1,3}。基準5（補助）の協和（調内性）判定に使う。
const F_NATURAL_MINOR_PITCH_CLASSES = new Set([0, 1, 3, 5, 7, 8, 10]);

describe("resolveNoChordRegions（TAKEOVER実データ）", () => {
  const noChordChords = takeoverChords.filter((c) => c.name === "N");
  const ncRanges: NcRange[] = noChordChords.map((c) => ({
    startTimeMs: c.startTimeMs,
    endTimeMs: c.endTimeMs,
    treatment: TAKEOVER_TREATMENT_BY_INDEX[c.index],
  }));
  const resolutions = resolveNoChordRegions(takeoverChords, ncRanges, FM_MINOR_KEY);

  it("基準1: 6個の無和音区間がすべて解決され、解決名が無和音記号でない", () => {
    expect(resolutions).toHaveLength(6);
    expect(resolutions.map((r) => r.chordIndex)).toEqual([0, 22, 24, 99, 170, 209]);
    for (const r of resolutions) {
      expect(r.resolvedChordName).not.toBe("N");
    }
  });

  it("基準2: 各解決名が音高集合へ例外なく変換できる（協和の土台が存在する）", () => {
    for (const r of resolutions) {
      expect(() => chordSymbolToPitchSet(r.resolvedChordName)).not.toThrow();
    }
  });

  it("基準3: previous の区間は直前の無和音でない和音名と一致する", () => {
    for (const r of resolutions.filter((x) => x.treatment === "previous")) {
      const precedingChord = takeoverChords[r.chordIndex - 1];
      expect(precedingChord.name).not.toBe("N");
      expect(r.resolvedChordName).toBe(precedingChord.name);
    }
  });

  it("基準4: scale の区間は調の主和音記号 Fm と一致する", () => {
    for (const r of resolutions.filter((x) => x.treatment === "scale")) {
      expect(r.resolvedChordName).toBe("Fm");
    }
  });

  it("基準5（補助）: scale の解決名 Fm の音高はファのナチュラルマイナー音階に含まれる", () => {
    // 安全付加音を含む協和の網羅証明は Issue #36 のテストの責務とし、ここでは Fm が調内であることだけを確認する。
    const pitches = chordSymbolToPitchSet("Fm");
    for (const pitch of pitches) {
      expect(F_NATURAL_MINOR_PITCH_CLASSES.has(pitch % 12)).toBe(true);
    }
  });

  it("基準6（軽量確認）: 解決結果から組み立てたスロット名がすべて無和音記号でない", () => {
    const slotNames = resolutions.map((r) => r.resolvedChordName);
    for (const name of slotNames) {
      expect(name).not.toBe("N");
    }
  });

  it("解決名のスナップショット（音楽地図や treatment 割り当ての意図しない変化を検出する）", () => {
    // 索引22・99の直前和音は Eb、索引170・209の直前和音は Fm（takeover.songmap.json による）。
    expect(
      resolutions.map((r) => ({
        chordIndex: r.chordIndex,
        treatment: r.treatment,
        resolvedChordName: r.resolvedChordName,
      })),
    ).toEqual([
      { chordIndex: 0, treatment: "scale", resolvedChordName: "Fm" },
      { chordIndex: 22, treatment: "previous", resolvedChordName: "Eb" },
      { chordIndex: 24, treatment: "scale", resolvedChordName: "Fm" },
      { chordIndex: 99, treatment: "previous", resolvedChordName: "Eb" },
      { chordIndex: 170, treatment: "previous", resolvedChordName: "Fm" },
      { chordIndex: 209, treatment: "previous", resolvedChordName: "Fm" },
    ]);
  });
});

describe("resolveNoChordRegions（検証通過済みプロファイルとの一致）", () => {
  it("基準6（軽量確認）: minimalValidProfile の無和音区間スロット名と解決名が一致する", () => {
    const resolutions = resolveNoChordRegions(
      minimalValidProfile.chords,
      minimalValidProfile.ncRanges,
      minimalValidProfile.musicalKey,
    );

    expect(resolutions).toHaveLength(1);
    expect(resolutions[0].resolvedChordName).toBe("Fm");

    const noChordChord = minimalValidProfile.chords.find((c) => c.name === "N");
    expect(noChordChord).toBeDefined();
    const noChordSlot = minimalValidProfile.slots.find(
      (s) => s.startTimeMs === noChordChord!.startTimeMs,
    );
    expect(noChordSlot).toBeDefined();
    expect(resolutions[0].resolvedChordName).toBe(noChordSlot!.chordName);
  });
});
