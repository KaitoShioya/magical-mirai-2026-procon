import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { applyNotePatterns, sampleContour, DEFAULT_NOTE_PATTERN_OPTIONS } from "./notePatterns";
import { generateOnsetNotes, type OnsetInput } from "./onsetNotes";
import { resolveNoChordRegions } from "./noChordResolution";
import { generateChordToneSlots, type ResolvedChordRegion } from "./chordToneSlots";
import { validateProfile } from "../schema/validateProfile";
import { minimalValidProfile } from "../schema/fixtures/minimalValidProfile";
import type {
  Chord,
  ChordToneSlotRegion,
  EmotionCurve,
  LoudnessCurve,
  MusicalKey,
  NcRange,
  Note,
  SongProfile,
} from "../schema/profileSchema";

// 実データ（TAKEOVERの音楽地図ダンプ）を素のデータファイルとして読む。src/tools/ への import は一切しない
// （profiles から tools への依存禁止に抵触しない）。songmap の生フィールドから曲プロファイルの型への変換は
// テスト側で行う。これは #45 の生成スクリプトが行う変換と同じ位置である。
const songmapPath = fileURLToPath(new URL("../../../docs/analysis/takeover.songmap.json", import.meta.url));
const songmap = JSON.parse(readFileSync(songmapPath, "utf8")) as {
  song: { duration: number };
  beats: { index: number; startTime: number }[];
  segments: { startTime: number; endTime: number; isChorus: boolean }[];
  chords: { index: number; name: string; startTime: number; endTime: number; duration: number }[];
  amplitudeStep: number;
  maxVocalAmplitude: number;
  amplitudeCurve: number[];
  vaCurve: { t: number; v: number; a: number }[];
  valenceArousal: { median: { valence: number; arousal: number } };
};

// TAKEOVERの調はファ短調（profileSchema.ts の MusicalKey 注釈）。主音の音名クラスはファ＝5。
const TAKEOVER_KEY: MusicalKey = { tonicPitchClass: 5, mode: "minor" };

const NO_CHORD_SYMBOL = "N";

/** 声量曲線を songmap の生フィールドから組む。 */
function toLoudnessCurve(): LoudnessCurve {
  return { stepMs: songmap.amplitudeStep, maxAmplitude: songmap.maxVocalAmplitude, values: songmap.amplitudeCurve };
}

/** 感情曲線を songmap の生フィールドから組む。刻みは vaCurve の隣接点の時刻差（0・1000・2000）から1000ミリ秒とする。 */
function toEmotionCurve(): EmotionCurve {
  return {
    stepMs: 1000,
    points: songmap.vaCurve.map((p) => ({ tMs: p.t, valence: p.v, arousal: p.a })),
    median: songmap.valenceArousal.median,
  };
}

/** オンセット選択（#38）の入力を songmap から組む。 */
function toOnsetInput(): OnsetInput {
  return {
    beats: songmap.beats.map((b) => ({ index: b.index, startTimeMs: b.startTime })),
    chorusSegments: songmap.segments
      .filter((s) => s.isChorus)
      .map((s) => ({ startMs: s.startTime, endMs: s.endTime })),
  };
}

/** スロット区間（#36の出力）を全210区間の曲全域被覆で組む。
 *  既存 chordToneSlots.takeover.test.ts は無和音6区間を除外した204区間で組むため、無和音区間を #37 で解決して
 *  210区間へ統合し resolveNoChordRegions を呼ぶ部分は本テストの新規手順である。共有するのはフィールド名の変換の作法だけである。 */
function buildSlots(): ChordToneSlotRegion[] {
  // 1. songmap の生の和音配列を Chord 型へ変換する。生は startTime/endTime/name、#37・#36 は startTimeMs/endTimeMs/chordName を読むため。
  const chords: Chord[] = songmap.chords.map((c) => ({
    index: c.index,
    name: c.name,
    startTimeMs: c.startTime,
    endTimeMs: c.endTime,
    durationMs: c.duration,
  }));

  // 2. 無和音6区間から ncRanges を全て "scale" で作る。"scale" は調の主和音へ解決するため直前和音の有無に依らず
  //    成立し、先頭索引0（開始時刻0で直前和音が無い）でも失敗しない。#39 は音高の値を読まないため treatment 選択は出力に影響しない。
  const ncRanges: NcRange[] = chords
    .filter((c) => c.name === NO_CHORD_SYMBOL)
    .map((c) => ({ startTimeMs: c.startTimeMs, endTimeMs: c.endTimeMs, treatment: "scale" as const }));

  // 3. 無和音区間を解決する（"scale" の解決名はファ短調の主和音 "Fm"）。
  const resolutions = resolveNoChordRegions(chords, ncRanges, TAKEOVER_KEY);
  const resolvedNameByChordIndex = new Map(resolutions.map((r) => [r.chordIndex, r.resolvedChordName]));

  // 4. 全210区間の ResolvedChordRegion を作る（無和音区間は解決名、他は和音名そのもの）。
  const resolvedRegions: ResolvedChordRegion[] = chords.map((c) => ({
    startTimeMs: c.startTimeMs,
    endTimeMs: c.endTimeMs,
    chordName: c.name === NO_CHORD_SYMBOL ? (resolvedNameByChordIndex.get(c.index) as string) : c.name,
  }));

  // 5. スロットを生成する。
  return generateChordToneSlots(resolvedRegions);
}

/** 時刻が属するスロット区間の添字を本体と同じ規則（開始時刻が時刻＋許容差1ミリ秒以下の最後の区間、無ければ先頭）で引く。 */
function regionIndexOf(timeMs: number, slots: ChordToneSlotRegion[]): number {
  let found = -1;
  for (let i = 0; i < slots.length; i++) {
    if (slots[i].startTimeMs <= timeMs + 1) {
      found = i;
    } else {
      break;
    }
  }
  return found < 0 ? 0 : found;
}

describe("譜面パターン適用 実データ検証（Issue #39 受け入れ基準）", () => {
  const loudness = toLoudnessCurve();
  const emotion = toEmotionCurve();
  const onsets = generateOnsetNotes(toOnsetInput());
  const slots = buildSlots();
  const patterned = applyNotePatterns({ notes: onsets, slots, loudness, emotion });

  // 各ノーツの勢い値と所属区間を本体と同じ条件で再計算する。
  const contours = patterned.map((n) => sampleContour(n.timeMs, loudness, emotion, DEFAULT_NOTE_PATTERN_OPTIONS));
  const regions = patterned.map((n) => regionIndexOf(n.timeMs, slots));

  it("スロットは全210区間・各7スロットで曲全域を被覆する", () => {
    expect(slots).toHaveLength(songmap.chords.length);
    expect(slots).toHaveLength(210);
    for (const region of slots) {
      expect(region.pitches).toHaveLength(7);
    }
    expect(slots[0].startTimeMs).toBe(0);
  });

  it("出力ノーツ数はオンセット数（434、単音）と等しく、id が一意かつ入力から保存される", () => {
    expect(patterned).toHaveLength(onsets.length);
    expect(patterned).toHaveLength(434);
    expect(patterned.map((n) => n.id)).toEqual(onsets.map((n) => n.id));
    expect(new Set(patterned.map((n) => n.id)).size).toBe(patterned.length);
  });

  it("全ノーツの slotIndex が1以上7以下に収まる", () => {
    for (const note of patterned) {
      expect(note.slotIndex).toBeGreaterThanOrEqual(1);
      expect(note.slotIndex).toBeLessThanOrEqual(7);
    }
  });

  it("達成基準: 同一和音区間内で、勢い値の上下に slotIndex が追従する（上昇音はy↑）", () => {
    // 勢い値が不感帯を超えて上がる箇所では slotIndex 非減少、下がる箇所では非増加、不感帯の内側では据え置き。
    // 和音区間の境界をまたぐ対は再シードで連続性が切れるため対象外とする。
    const epsilon = DEFAULT_NOTE_PATTERN_OPTIONS.flatEpsilon;
    let comparedPairs = 0;
    for (let i = 1; i < patterned.length; i++) {
      if (regions[i] !== regions[i - 1]) continue;
      comparedPairs++;
      const delta = contours[i] - contours[i - 1];
      if (delta > epsilon) {
        expect(patterned[i].slotIndex).toBeGreaterThanOrEqual(patterned[i - 1].slotIndex);
      } else if (delta < -epsilon) {
        expect(patterned[i].slotIndex).toBeLessThanOrEqual(patterned[i - 1].slotIndex);
      } else {
        expect(patterned[i].slotIndex).toBe(patterned[i - 1].slotIndex);
      }
    }
    expect(comparedPairs).toBeGreaterThan(0);
  });

  it("pattern が確定後の slotIndex 差と一致する（同一区間内の連続ノーツ）", () => {
    for (let i = 1; i < patterned.length; i++) {
      if (regions[i] !== regions[i - 1]) continue;
      const delta = patterned[i].slotIndex - patterned[i - 1].slotIndex;
      const expected = delta > 0 ? "ascending" : delta < 0 ? "descending" : "sameTone";
      expect(patterned[i].pattern).toBe(expected);
    }
  });

  it("退化した動かない譜面ではない（3種の pattern が出現し、同一区間内で slotIndex が十分に動く）", () => {
    // 3種が出現する根拠を先に述べる。区間内ノーツが1個だけの run は同音連打になり、無和音6区間や短い和音区間で
    // 生じるため同音連打が現れる。上昇と下降は勢い値の方向反転が一度でもあれば両方現れる。
    const counts = { ascending: 0, descending: 0, sameTone: 0 };
    for (const note of patterned) counts[note.pattern]++;
    expect(counts.ascending).toBeGreaterThanOrEqual(1);
    expect(counts.descending).toBeGreaterThanOrEqual(1);
    expect(counts.sameTone).toBeGreaterThanOrEqual(1);

    // 変化割合の下限3割の理由を先に述べる。下限の目的は全ノーツが同一スロットに張り付く動かない譜面を排除すること
    // であり、声量サンプルの間隔200ミリ秒に対しオンセット間隔はサビ343ミリ秒・非サビ686ミリ秒で隣接ノーツ間で
    // 声量が変わりやすく、変化割合は3割を十分上回ると見込む。
    let samePairs = 0;
    let changedPairs = 0;
    for (let i = 1; i < patterned.length; i++) {
      if (regions[i] !== regions[i - 1]) continue;
      samePairs++;
      if (patterned[i].slotIndex !== patterned[i - 1].slotIndex) changedPairs++;
    }
    expect(changedPairs / samePairs).toBeGreaterThanOrEqual(0.3);
  });
});

describe("譜面パターン適用 スキーマ適合（Issue #39）", () => {
  it("minimalValidProfile から組んだ入力で付与したノーツに、#40相当のダミー軌跡位置を補うと validateProfile を通る", () => {
    // 入力を minimalValidProfile から組む理由を先に述べる。takeover実データ由来のノーツ（時刻が最大約23万ミリ秒、
    // 拍索引が数百）を minimalValidProfile（曲長4000ミリ秒・拍2個）へ差し替えると、時刻が曲長を超え拍索引が拍数以上に
    // なって validateProfile が必ず落ちるためである。
    const input: OnsetInput = {
      beats: minimalValidProfile.beats.map((b) => ({ index: b.index, startTimeMs: b.startTimeMs })),
      chorusSegments: minimalValidProfile.repetitiveSegments
        .filter((s) => s.isChorus)
        .map((s) => ({ startMs: s.startTimeMs, endMs: s.endTimeMs })),
    };
    const patterned = applyNotePatterns({
      notes: generateOnsetNotes(input),
      slots: minimalValidProfile.slots,
      loudness: minimalValidProfile.loudnessCurve,
      emotion: minimalValidProfile.emotionCurve,
    });
    expect(patterned.length).toBeGreaterThan(0);

    // 仮 trajectoryPosition を補って最終 Note を作る。trajectoryPosition の確定は #40 の責務である。
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
