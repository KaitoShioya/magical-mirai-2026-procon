// 譜面パターン適用（曲非依存の純粋関数。Issue #39）。
// オンセット選択（#38）で得た中間ノーツ列に、Y軸スロット番号（slotIndex）と譜面パターン名（pattern）を付ける。
// docs/research/04-ux-and-chart-design.md §4 のノーツ生成の第2段（各ノーツへY軸スロットを割り当てる）と
// 第3段（同音連打・上昇下降のパターンを当てて楽曲の感触を映す）にあたる。
//
// slotIndex 空間だけで動かす理由を先に述べる。#36（chordToneSlots.ts）の並び順契約により slots[].pitches は
// MIDIノート番号の昇順であり、slotIndex（pitches の1始まりの添字）が大きいほど音高が高い。よって本モジュールは
// 音高の数値を一切読まず、slotIndex を増やせば音高が上がるという対応にそのまま乗る。slots から読むのは各区間の
// 時刻境界（startTimeMs・endTimeMs）とスロット数（pitches.length）だけである。画面の上下と音の高低の対応は
// 入力写像（#47）の責務であり、本モジュールは関与しない。
//
// 駆動信号（勢い値）の選び方を先に述べる。本作の音程の正解は和音の構成音であり旋律ではない
// （docs/research/04-ux-and-chart-design.md §2）。TAKEOVERでは旋律の音高を測れた文字が全体の6パーセントに
// とどまり旋律は使えない。一方、声量曲線・感情曲線・和音は曲全域を覆う。よって声量と感情の興奮度（arousal）を
// 正規化合成した「勢い値」（範囲0以上1以下）を各ノーツに割り当て、勢い値が上がる箇所では slotIndex を上げ、
// 下がる箇所では下げ、平坦な箇所では据え置く（同音連打）。和音が変わる境界では slotIndex を再シードする。
// 和音が変わるとスロットの音高集合が変わるため、境界をまたいで上昇下降を続けると音高の意味が連続しないからである。
//
// 同時押し（2点から3点）は本モジュールでは扱わず、1オンセットを1ノーツに保つ。理由を先に述べる。タップ総数の母数
// （#44で算出した434）と整合させ、同時押しの母数と予算の意味付けが固まる下流（#46・#48・#55）へ分離するためである。
//
// 依存方針: 取り込みは型のみ。中間ノーツ型 OnsetNote（#38）と、スロット区間・声量曲線・感情曲線の型（スキーマ）だけを
// 取り込み、中核（engine・chart・scoring・input・audio）・rendering・tools・three.js・TextAlive と最終 Note 型は
// 取り込まない（src/profiles/generate/README.md・docs/decisions/architecture.md §5 の依存規則）。

import type { OnsetNote } from "./onsetNotes";
import type { ChordToneSlotRegion, LoudnessCurve, EmotionCurve } from "../schema/profileSchema";

/** 譜面パターン名。上昇（slotIndex が前のノーツより上がる）・下降（下がる）・同音連打（変わらない）の3種。 */
export type NotePattern = "ascending" | "descending" | "sameTone";

/** 譜面パターン適用の入力。すべて時刻昇順・曲全域被覆を前提とする。 */
export interface NotePatternInput {
  /** #38 の中間ノーツ列。時刻昇順前提。 */
  notes: OnsetNote[];
  /** #36 のスロット区間列。時刻昇順・曲全域被覆・全区間でスロット数同一を前提とする。本モジュールは
   *  各区間の時刻境界とスロット数（pitches.length）だけを読み、音高の値は読まない。 */
  slots: ChordToneSlotRegion[];
  /** 声量曲線。等間隔 stepMs 刻みのサンプル列を持つ。 */
  loudness: LoudnessCurve;
  /** 感情曲線。本モジュールは points の arousal を時刻昇順前提で階段補間して読み、stepMs と median は読まない。 */
  emotion: EmotionCurve;
}

/** 譜面パターン適用のオプション。すべて既定値を持ち、曲横展開で上書きできる。 */
export interface NotePatternOptions {
  /** 勢い値合成での正規化声量の重み。 */
  loudnessWeight: number;
  /** 勢い値合成での感情の興奮度（arousal）の重み。 */
  emotionWeight: number;
  /** 同音連打とみなす勢い値差の不感帯（絶対値がこの値以下なら据え置き）。 */
  flatEpsilon: number;
}

/** パターン適用後の中間ノーツ。最終 Note のうち本段で確定する項目を持つ。
 *  カメラ軌跡上の位置（trajectoryPosition）は #40 が後段で付与するため本型は持たない。
 *  密度の出所（sectionKind）は最終 Note の項目でないため引き継がない。 */
export interface PatternedNote {
  /** プロファイル内で一意の識別子（入力ノーツから引き継ぐ）。 */
  id: string;
  /** 演出に使う実時刻（入力ノーツから引き継ぐ）。 */
  timeMs: number;
  /** 判定とJUST認定に使う拍格子の索引（入力ノーツから引き継ぐ）。 */
  beatIndex: number;
  /** Y軸スロット番号。1からスロット数まで。slots の pitches の何番目かを表す。 */
  slotIndex: number;
  /** 譜面パターン名。 */
  pattern: NotePattern;
}

/** 既定オプション。
 *  loudnessWeight=0.5 と emotionWeight=0.5 の採用理由を先に述べる。声量と感情を等価に混ぜる初期値であり、
 *  既存の見せ場生成が声量と歌詞密度を0.5と0.5で合成する前例（types.ts の DEFAULT_SHOWCASE_OPTIONS）に揃える。
 *  flatEpsilon=0.02 の採用理由を先に述べる。勢い値は0以上1以下に正規化済みで、声量サンプルの区間が切り替わる際に
 *  生じる微小な変動を方向の変化と誤認しないための不感帯であり、全幅の2パーセントとする。
 *  いずれも見積もりの初期値であり、実装後のプレイ検証と実データで調整する。 */
export const DEFAULT_NOTE_PATTERN_OPTIONS: NotePatternOptions = {
  loudnessWeight: 0.5,
  emotionWeight: 0.5,
  flatEpsilon: 0.02,
};

/** 所属和音区間を引くときの時刻の許容差（ミリ秒）。
 *  採用理由を先に述べる。スロット区間は曲全域を連続被覆し、その境界時刻は音楽地図由来の浮動小数点で末尾に微小な
 *  揺れがある。検証関数 validateProfile（TIME_TOLERANCE_MS=1）と無和音区間の解決（noChordResolution の同名定数）が
 *  採る許容差1ミリ秒と同じ値・同じ理由で、境界に重なる拍を取りこぼさないようにする。 */
const TIME_TOLERANCE_MS = 1;

/** 値を下限と上限の間に収める。 */
function clamp(value: number, lower: number, upper: number): number {
  return Math.min(Math.max(value, lower), upper);
}

/** 時刻に対応する声量サンプルの添字を返す。
 *  切り捨てる理由を先に述べる。声量は等間隔 stepMs 刻みで、時刻を含むサンプル区間 [添字×step, (添字+1)×step) の
 *  代表値を取るため、時刻を刻みで割った値の整数部を採る。範囲外は端のサンプルに丸める。 */
function loudnessSampleIndex(timeMs: number, stepMs: number, length: number): number {
  return clamp(Math.floor(timeMs / stepMs), 0, length - 1);
}

/** 時刻における感情の興奮度（arousal）を階段補間で返す。
 *  階段補間とする理由を先に述べる。感情曲線は離散点列で、ある時刻で有効な最後の観測値を保持するのが最も素直で
 *  外挿の仮定を増やさないためである。points を時刻昇順前提で走査し、時刻以下で最大の時刻を持つ点の値を採る。
 *  時刻が先頭点より前なら先頭点、最終点より後なら最終点の値を採る。
 *  昇順でない points は未定義動作とし本関数は並べ替えない（onsetNotes が beats の昇順を未定義動作とし
 *  並べ替えない前例に倣う）。 */
function sampleArousal(timeMs: number, points: EmotionCurve["points"]): number {
  let chosen = points[0];
  for (const point of points) {
    if (point.tMs <= timeMs) {
      chosen = point;
    } else {
      break;
    }
  }
  return chosen.arousal;
}

/** 単一時刻の勢い値（0以上1以下）を返す。受け入れ基準を実データで検証するため公開する。
 *  正規化声量を上限1で切る理由を先に述べる。声量の生値は最大声量を超えることがあり（TAKEOVERでは声量曲線の
 *  最大値が最大声量の値を超える）、割り算だけでは1を超えるため、上限1で切って0以上1以下に収める。
 *  負値を0に切り上げる理由を先に述べる。声量曲線は無音センチネル（−1）を含み、無音は最低エネルギーであり、
 *  負値のまま正規化すると負の勢い値になって方向判定が壊れるためである。
 *  重みの合計で割る理由を先に述べる。正規化声量と arousal がともに0以上1以下で、重みの合計で割る凸結合のため、
 *  重みをどの正の値に変えても勢い値が0以上1以下に収まる。 */
export function sampleContour(
  timeMs: number,
  loudness: LoudnessCurve,
  emotion: EmotionCurve,
  options: NotePatternOptions,
): number {
  const index = loudnessSampleIndex(timeMs, loudness.stepMs, loudness.values.length);
  const rawLoudness = Math.max(loudness.values[index], 0);
  const normalizedLoudness = Math.min(rawLoudness / loudness.maxAmplitude, 1);
  const arousal = sampleArousal(timeMs, emotion.points);
  return (
    (options.loudnessWeight * normalizedLoudness + options.emotionWeight * arousal) /
    (options.loudnessWeight + options.emotionWeight)
  );
}

/** 時刻が属するスロット区間の添字を返す。
 *  「開始時刻が時刻以下（許容差1ミリ秒を含む）の最後の区間」を選ぶ。スロット区間は時刻昇順のため、開始時刻が
 *  時刻を超える区間が現れたらそれ以降も超えるので走査を打ち切る。どの区間にも入らない場合（時刻が先頭区間の
 *  開始より前）は先頭区間に寄せる。先頭区間に寄せる理由を先に述べる。スロット区間は0ミリ秒から連続被覆するため
 *  実データではこの状況は起きないが、合成データでの添字未確定（未定義参照）を防ぐためである。 */
function findRegionIndex(timeMs: number, slots: readonly ChordToneSlotRegion[]): number {
  let found = -1;
  for (let i = 0; i < slots.length; i++) {
    if (slots[i].startTimeMs <= timeMs + TIME_TOLERANCE_MS) {
      found = i;
    } else {
      break;
    }
  }
  return found < 0 ? 0 : found;
}

/** 勢い値の差から次のスロット番号を1段だけ動かす。差が不感帯を超えて正なら1段上げ、負なら1段下げ、
 *  不感帯の内側なら据え置く。結果を1からスロット数の範囲に収める。
 *  1段ずつ動かす理由を先に述べる。1ノーツあたり1スロットの階段状の動きにすると、有限のスロット範囲の中で
 *  読み取れる上昇下降になり、長い上昇下降でも範囲に収まりやすいためである。 */
function stepSlotIndex(
  previousSlotIndex: number,
  contourDelta: number,
  flatEpsilon: number,
  slotCount: number,
): number {
  let next = previousSlotIndex;
  if (contourDelta > flatEpsilon) {
    next = previousSlotIndex + 1;
  } else if (contourDelta < -flatEpsilon) {
    next = previousSlotIndex - 1;
  }
  return clamp(next, 1, slotCount);
}

/** run の先頭ノーツのスロット番号を勢い値から決める（再シード）。
 *  エネルギーの水準（0以上1以下の勢い値）をスロット範囲（1からスロット数）へ線形写像し、高いエネルギーの区間ほど
 *  高いスロットから始める。最近接整数で偏り無く割り当て、結果を1からスロット数の範囲に収める。 */
function seedSlotIndex(contour: number, slotCount: number): number {
  return clamp(1 + Math.round(contour * (slotCount - 1)), 1, slotCount);
}

/** スロット番号の差から譜面パターン名を決める。正なら上昇、負なら下降、0なら同音連打。 */
function patternFromDelta(slotIndexDelta: number): NotePattern {
  if (slotIndexDelta > 0) {
    return "ascending";
  }
  if (slotIndexDelta < 0) {
    return "descending";
  }
  return "sameTone";
}

/**
 * 中間ノーツ列に slotIndex と pattern を付けて返す。
 *
 * 手順は次のとおりである。各ノーツの勢い値と所属和音区間を求め、和音区間が変わる箇所を run の区切りとする。
 * run の先頭は勢い値から再シードし、run 内の2ノーツ目以降は直前との勢い値の差で1段ずつ動かす。pattern は
 * 確定後の slotIndex の差から決める。確定後の差から決める理由を先に述べる。天井や床のクランプで slotIndex が
 * 動かない箇所が確実に同音連打になり、表示上のY移動と pattern が必ず一致するためである。run の先頭は同じ run の
 * 直後ノーツとの差で性格付け、run の長さが1または差が0なら同音連打とする。
 *
 * 出力は入力ノーツの順序を保つ。id・timeMs・beatIndex は入力から項目を明示して写し、sectionKind は最終 Note の
 * 項目でないため引き継がない。
 */
export function applyNotePatterns(
  input: NotePatternInput,
  options?: Partial<NotePatternOptions>,
): PatternedNote[] {
  const opts: NotePatternOptions = { ...DEFAULT_NOTE_PATTERN_OPTIONS, ...options };
  const { notes, slots, loudness, emotion } = input;

  if (notes.length === 0) {
    return [];
  }
  if (slots.length === 0) {
    throw new Error("notes が非空のときスロット区間 slots を空にできません");
  }
  const slotCount = slots[0].pitches.length;
  for (let i = 0; i < slots.length; i++) {
    if (slots[i].pitches.length !== slotCount) {
      throw new Error(
        `全スロット区間でスロット数が同一である必要があります。区間[0]は${slotCount}個、区間[${i}]は${slots[i].pitches.length}個です`,
      );
    }
  }
  if (slotCount < 1) {
    throw new Error(`スロット数は1以上である必要がありますが ${slotCount} でした`);
  }
  if (!(loudness.maxAmplitude > 0)) {
    throw new Error(`声量曲線の最大値 maxAmplitude は正である必要がありますが ${loudness.maxAmplitude} でした`);
  }
  if (!(opts.loudnessWeight >= 0) || !(opts.emotionWeight >= 0) || !(opts.loudnessWeight + opts.emotionWeight > 0)) {
    throw new Error(
      `重みは0以上で合計が正である必要がありますが loudnessWeight=${opts.loudnessWeight}、emotionWeight=${opts.emotionWeight} でした`,
    );
  }

  // 第1段: 各ノーツの勢い値・所属区間・slotIndex を確定する。
  const contours: number[] = [];
  const regionIndices: number[] = [];
  const slotIndices: number[] = [];
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    const contour = sampleContour(note.timeMs, loudness, emotion, opts);
    const regionIndex = findRegionIndex(note.timeMs, slots);
    const isRunStart = i === 0 || regionIndex !== regionIndices[i - 1];
    const slotIndex = isRunStart
      ? seedSlotIndex(contour, slotCount)
      : stepSlotIndex(slotIndices[i - 1], contour - contours[i - 1], opts.flatEpsilon, slotCount);
    contours.push(contour);
    regionIndices.push(regionIndex);
    slotIndices.push(slotIndex);
  }

  // 第2段: 確定後の slotIndex の差から pattern を決める。
  const result: PatternedNote[] = [];
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    const isRunStart = i === 0 || regionIndices[i] !== regionIndices[i - 1];
    let pattern: NotePattern;
    if (isRunStart) {
      const nextInSameRun = i + 1 < notes.length && regionIndices[i + 1] === regionIndices[i];
      pattern = nextInSameRun ? patternFromDelta(slotIndices[i + 1] - slotIndices[i]) : "sameTone";
    } else {
      pattern = patternFromDelta(slotIndices[i] - slotIndices[i - 1]);
    }
    result.push({
      id: note.id,
      timeMs: note.timeMs,
      beatIndex: note.beatIndex,
      slotIndex: slotIndices[i],
      pattern,
    });
  }

  return result;
}
