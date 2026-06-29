// 和音名→音高集合パーサー（曲非依存の純粋関数。Issue #35）。
// TextAlive App API が文字列で提供する和音名（"Fm"・"DbM7"・"Ab/Eb" など）を、構成音を2オクターブに
// 展開したMIDIノート番号の昇順集合へ変換する。下流の Issue #36（JUST音程7スロット生成）が、ここで得た
// 根音・品質・音高集合から安全付加音を加えてY軸の7スロットへ正規化する。
//
// 依存方針の理由を先に述べる。本モジュールは入力型を本ファイル内で独立に定義し、src/profiles/schema を
// 取り込まない。これは utils が特定サブシステムや曲プロファイル型へ依存しない最下層であるという規則
// （src/utils/README.md、architecture.md §5）に従い、依存方向を一方向に保つためである。
//
// 音高表現の理由を先に述べる。音高はMIDIノート番号で表す。A音（音高番号69）を440ヘルツとする標準変換
// （周波数 = 440 × 2^((音高番号 − 69) / 12)）が市販楽曲と整合するためである（docs/research/07-feasibility-and-parameters.md §1.3）。
// 実際の発音周波数の導出と可聴帯域（1キロヘルツから4キロヘルツ）への整形は操作音の Issue #52 が担う。
//
// 無和音 "N" は本モジュールでは音高化せず例外とする。無和音区間を直前和音または調の音階へ解決する処理は
// Issue #37 の責務であり、解決後の実在和音名を本モジュールへ渡す（profileSchema.ts の ChordToneSlotRegion 注釈）。

/** 和音の品質。実在和音に対応し、将来の曲のために拡張可能な列挙とする。
 *  TAKEOVER の16種に加え、アフター・ザ・カーテンに出現する属七の懸垂四度・減七・属九・短九・属七の変十三度を加える。 */
export type ChordQuality =
  | "major"
  | "minor"
  | "augmented"
  | "dominantSeventh"
  | "majorSeventh"
  | "minorSeventh"
  | "majorSixth"
  | "dominantSeventhSus4"
  | "diminishedSeventh"
  | "dominantNinth"
  | "minorNinth"
  | "dominantSeventhFlatThirteenth";

/** 構造化された和音の解析結果。下流 #36・#37 が根音と品質と低音を文字列の再解析なしに再利用するために返す。 */
export interface ParsedChord {
  /** 根音の音高クラス。0をハ（C）として0〜11。 */
  rootPitchClass: number;
  quality: ChordQuality;
  /** 分数和音の低音の音高クラス。分数和音でなければ null。音高集合へは注入せず記録のみとする（判断5）。 */
  bassPitchClass: number | null;
}

/** 2オクターブ展開の基準を上書きする任意指定。 */
export interface ChordPitchOptions {
  /** 2オクターブ展開の下のオクターブにおける、ハ音（音高クラス0）のMIDIノート番号。
   *  根音のMIDIノート番号は、この値に根音の音高クラスを足して求める。既定は定数 CHORD_PITCH_BASE_C_MIDI。 */
  baseCMidi?: number;
}

/** MIDIノート番号の下限。 */
const MIDI_MIN = 0;
/** MIDIノート番号の上限。 */
const MIDI_MAX = 127;
/** 1オクターブの半音数。 */
const SEMITONES_PER_OCTAVE = 12;

/** 音名の文字から音高クラスへの対応。根音（大文字A〜G）の自然音を表し、変化記号は別に加減する。 */
export const NOTE_LETTER_TO_PITCH_CLASS: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

/** 和音の品質ごとの、根音からの半音間隔。出典は標準的な和声。
 *  属七の懸垂四度（7sus4）は第三音を完全四度（5半音）へ吊り上げ第七音（10半音）を加える。減七（dim7）は短三度を積む（0,3,6,9）。
 *  属九（9）は属七に長九度（14半音）を、短九（m9）は短七に長九度を加える。属七の変十三度（7(b13)）は属七に短十三度＝増五度（8半音）を加える。 */
export const CHORD_QUALITY_INTERVALS: Record<ChordQuality, readonly number[]> = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  augmented: [0, 4, 8],
  dominantSeventh: [0, 4, 7, 10],
  majorSeventh: [0, 4, 7, 11],
  minorSeventh: [0, 3, 7, 10],
  majorSixth: [0, 4, 7, 9],
  dominantSeventhSus4: [0, 5, 7, 10],
  diminishedSeventh: [0, 3, 6, 9],
  dominantNinth: [0, 4, 7, 10, 14],
  minorNinth: [0, 3, 7, 10, 14],
  dominantSeventhFlatThirteenth: [0, 4, 7, 10, 8],
};

/** 品質を表す文字列から品質への対応。根音と分数和音の低音を除いた残り文字列を完全一致で引く。
 *  完全一致で引くため "M7"（長七）・"m7"（短七）・"m"（短三和音）が確実に区別される。 */
export const QUALITY_TOKEN_TO_QUALITY: Record<string, ChordQuality> = {
  "": "major",
  m: "minor",
  aug: "augmented",
  "7": "dominantSeventh",
  M7: "majorSeventh",
  m7: "minorSeventh",
  "6": "majorSixth",
  "7sus4": "dominantSeventhSus4",
  dim7: "diminishedSeventh",
  "9": "dominantNinth",
  m9: "minorNinth",
  "7(b13)": "dominantSeventhFlatThirteenth",
  // 「こたえて」のサスペンド和音。第3音を持たないため最も近い基本品質へ写す（sus2・sus4 は長三和音）。
  // sus2(#7) は長7度を伴うため長七和音へ写す。音高値（slots[].pitches）は現在の操作モデルでは実行時に読まれないため、
  // 基本品質への近似で足りる（撤去や別表現が要るなら chordToneSlots とともに見直す）。
  sus2: "major",
  sus4: "major",
  "sus2(#7)": "majorSeventh",
};

/** 2オクターブ展開の下のオクターブにおける、ハ音（音高クラス0）のMIDIノート番号。★暫定。
 *  72 は C5（A音=69 から数えて正しくC5）。根音はこの値に根音の音高クラスを足して置くため、根音は72〜83に収まる。
 *  協和はオクターブ等価で基準に依存しないため、実発音の帯域整形は #52 が担う（判断2）。 */
export const CHORD_PITCH_BASE_C_MIDI = 72;

/** TextAlive が無和音区間に与える記号。 */
const NO_CHORD_SYMBOL = "N";

/** 無和音記号かどうかを判定する。前後の空白は無視する。 */
export function isNoChordSymbol(name: string): boolean {
  return name.trim() === NO_CHORD_SYMBOL;
}

/** 文字列の先頭から音名（大文字A〜G ＋ 任意の変化記号 b または #）を1つ読み、音高クラスと残り文字列を返す。 */
function readNote(text: string): { pitchClass: number; rest: string } {
  const letter = text[0];
  const base = letter === undefined ? undefined : NOTE_LETTER_TO_PITCH_CLASS[letter];
  if (base === undefined) {
    throw new Error(`和音記号の音名が不正です: "${text}"`);
  }
  const accidental = text[1];
  if (accidental === "b") {
    return { pitchClass: (base + SEMITONES_PER_OCTAVE - 1) % SEMITONES_PER_OCTAVE, rest: text.slice(2) };
  }
  if (accidental === "#") {
    return { pitchClass: (base + 1) % SEMITONES_PER_OCTAVE, rest: text.slice(2) };
  }
  return { pitchClass: base, rest: text.slice(1) };
}

/** 和音記号を構造化して解析する。
 *  無和音「N」・解析不能な記号・未対応の品質・不正な根音や低音では、明確なメッセージの例外を出す。 */
export function parseChordSymbol(name: string): ParsedChord {
  const trimmed = name.trim();
  if (trimmed === "") {
    throw new Error("和音記号が空です");
  }
  if (isNoChordSymbol(trimmed)) {
    throw new Error('無和音記号 "N" は音高化できません。無和音区間の解決は Issue #37 が担います');
  }

  const slashIndex = trimmed.indexOf("/");
  const chordPart = slashIndex >= 0 ? trimmed.slice(0, slashIndex) : trimmed;
  const bassPart = slashIndex >= 0 ? trimmed.slice(slashIndex + 1) : null;

  const root = readNote(chordPart);
  const quality = QUALITY_TOKEN_TO_QUALITY[root.rest];
  if (quality === undefined) {
    throw new Error(`和音記号の品質が未対応です: "${name}"（品質部分 "${root.rest}"）`);
  }

  let bassPitchClass: number | null = null;
  if (bassPart !== null) {
    const bass = readNote(bassPart);
    if (bass.rest !== "") {
      throw new Error(`分数和音の低音が不正です: "${name}"`);
    }
    bassPitchClass = bass.pitchClass;
  }

  return { rootPitchClass: root.pitchClass, quality, bassPitchClass };
}

/** 解析済みの和音を、構成音を2オクターブ展開したMIDIノート番号の昇順集合へ変換する。
 *  各構成音の音高クラスを基準オクターブとその1つ上のオクターブに置く（音高クラスごとに2個）。
 *  分数和音の低音は集合へ注入しない（判断5。演奏可能化の判断は安全付加音を扱う #36 に属する）。 */
export function expandChordToPitchSet(parsed: ParsedChord, options?: ChordPitchOptions): number[] {
  const baseCMidi = options?.baseCMidi ?? CHORD_PITCH_BASE_C_MIDI;
  const rootMidi = baseCMidi + parsed.rootPitchClass;
  // 型注釈で undefined を許すのは、型検査を経ない呼び出し元が契約外の品質を渡した場合に
  // 明確なメッセージで失敗させるためである（parseChordSymbol 経由では常に定義済みになる）。
  const intervals: readonly number[] | undefined = CHORD_QUALITY_INTERVALS[parsed.quality];
  if (intervals === undefined) {
    throw new Error(`和音の品質が未対応です: "${String(parsed.quality)}"`);
  }

  const pitches = new Set<number>();
  for (const interval of intervals) {
    pitches.add(rootMidi + interval);
    pitches.add(rootMidi + interval + SEMITONES_PER_OCTAVE);
  }

  const sorted = [...pitches].sort((a, b) => a - b);
  for (const pitch of sorted) {
    if (!Number.isInteger(pitch) || pitch < MIDI_MIN || pitch > MIDI_MAX) {
      throw new Error(
        `展開後の音高がMIDIの範囲（0〜127の整数）を外れました: ${pitch}。基準 baseCMidi=${baseCMidi} を見直してください`
      );
    }
  }
  return sorted;
}

/** 和音記号から直接、2オクターブ展開のMIDI音高集合を得る便宜関数（parseChordSymbol と expandChordToPitchSet の合成）。
 *  無和音・解析不能では例外を出す。 */
export function chordSymbolToPitchSet(name: string, options?: ChordPitchOptions): number[] {
  return expandChordToPitchSet(parseChordSymbol(name), options);
}
