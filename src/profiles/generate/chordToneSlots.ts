// JUST音程7スロット自動生成（曲非依存の純粋関数。Issue #36）。
// その瞬間の和音から、画面Y軸のスロットに割り当てる音高（MIDIノート番号）の並びを生成する。
// 前段 Issue #35（src/utils/chordPitch.ts）が和音名を根音と品質へ分解するところまでを担い、本モジュールは
// その根音と品質から、安全な付加音を含めた「ちょうどスロット数（既定7）」の協和する音高の並びを作る。
// 出力は曲プロファイルの slots フィールド（src/profiles/schema/profileSchema.ts の ChordToneSlotRegion）に適合する。
//
// 協和の定義（採用理由を先に述べる）。プレイヤーは1回のタップで1スロットの音高を選び、その音高が伴奏の和音の上で
// 単独に鳴る。よって本作で言う協和とは「その音高が和音構成音、または和音構成音と半音衝突しない安全な付加音であり、
// 和音に収まること」を意味し、スロット間の音程関係ではなく各スロット音高と和音の関係で定義する。これは作品上の定義であり、
// 音響学で言う厳密な協和とは別である（七の和音の第7音は和音構成音であるため本定義では協和に含める）。
//
// 並び順の契約（採用理由を先に述べる）。出力配列はMIDIノート番号の昇順であり、画面Y軸のスロットの並び順そのものではない。
// 画面の上端と下端のどちらを高音に対応させるかは判定・入力層（Issue #48・#49）と入力写像（src/input/coordinateMapping.ts、
// Issue #47、スロット番号0が画面最上部）の責務である。本モジュールはMIDI昇順を出力の契約として明示し、画面方向への変換は下流が行う。
// 既存の入力写像はスロット番号0を画面最上部に割り当てるため、配列の並びと画面の並びを取り違えると音程の上下が反転する。
// 取り違えを防ぐため、出力の並びの意味をここで一点に定める。
//
// 無和音「N」は本モジュールでは扱わず例外とする。無和音区間を直前和音または楽曲の調の音階へ解決する処理は Issue #37 の責務であり、
// 解決後の実在和音名を本モジュールへ渡す（profileSchema.ts の ChordToneSlotRegion 注釈）。
//
// 依存方針の理由を先に述べる。本モジュールは曲プロファイルの1フィールドを生成する処理であり、見せ場マップ生成（Issue #41、
// src/profiles/generate/showcases.ts）と責務が同種であるため src/profiles/generate に置く。中核（engine・chart・scoring・
// input・audio）・tools・rendering・three.js は import しない（src/profiles/generate/README.md、architecture.md §5 の依存規則）。

import {
  parseChordSymbol,
  CHORD_QUALITY_INTERVALS,
  CHORD_PITCH_BASE_C_MIDI,
  type ParsedChord,
  type ChordQuality,
} from "../../utils/chordPitch";
import {
  PITCH_SLOT_COUNT_DEFAULT,
  PITCH_SLOT_COUNT_MIN,
  PITCH_SLOT_COUNT_MAX,
} from "../../config/tuning";
import type { ChordToneSlotRegion } from "../schema/profileSchema";

/** MIDIノート番号の下限。 */
const MIDI_MIN = 0;
/** MIDIノート番号の上限。 */
const MIDI_MAX = 127;
/** 1オクターブの半音数。 */
const SEMITONES_PER_OCTAVE = 12;

/** 安全付加音の区分。長調系の和音には長調系の付加音を、短調系の和音には短調系の付加音を使う。 */
export type ToneCategory = "majorType" | "minorType";

/** 和音の品質ごとの安全付加音の区分。
 *  長調系（長三和音・増三和音・属七和音・長七和音・長六和音・属七の懸垂四度・属九・属七の変十三度）は長調系の付加音、
 *  短調系（短三和音・短七和音・短九）は短調系の付加音を使う。減七和音は短三度を含むため短調系とする。
 *  区分の選び方の根拠を先に述べる。区分は根音の上に重ねる安全付加音（長調系=長九度と長六度、短調系=完全四度と短七度）を
 *  決める。長三度を含む属系（属七の懸垂四度は三度を持たないが属七の機能を継ぐ）は長調系、短三度を含む短系と減七は短調系とする。
 *  いずれの品質も付加後の協和音高クラスが相異なり、2オクターブ展開でスロット数（最大9）以上の候補が得られることを確認済みである。
 *  出典 docs/research/07-feasibility-and-parameters.md §1.3。 */
export const QUALITY_TO_TONE_CATEGORY: Record<ChordQuality, ToneCategory> = {
  major: "majorType",
  augmented: "majorType",
  dominantSeventh: "majorType",
  majorSeventh: "majorType",
  majorSixth: "majorType",
  dominantSeventhSus4: "majorType",
  dominantNinth: "majorType",
  dominantSeventhFlatThirteenth: "majorType",
  minor: "minorType",
  minorSeventh: "minorType",
  minorNinth: "minorType",
  diminishedSeventh: "minorType",
  // 減三和音は短3度を持つため短調系の付加音（完全4度・♭7度）を使う。完全4度は減5度と半音隣接で除外され、♭7度が採られ、
  // 構成音[0,3,6]に♭7度を加えた[0,3,6,10]（半減七の和音の構成音）になる。減5度は構成音として保たれ床の整合を保つ。
  diminished: "minorType",
  // 二度保留和音は第3音を持たないため、長短いずれにも倒さない付加音として短調系（完全4度・♭7度）を使う。
  // 結果は[0,2,5,7,10]の保留五音音階となり、第3音を含まないまま協和する。
  suspendedSecond: "minorType",
};

/** 安全付加音の根音からの半音数（度数の小さい順）。
 *  長調系=9度（長2度、2半音）と6度（長6度、9半音）、短調系=11度（完全4度、5半音）と♭7度（10半音）。
 *  度数の小さい順に並べる理由を先に述べる。候補を試す順序を固定することで結果を一意（決定論的）にし、低音域寄りの安全音を先に採るためである。
 *  出典 docs/research/07-feasibility-and-parameters.md §1.3。 */
export const SAFE_ADDED_TONE_SEMITONES: Record<ToneCategory, readonly number[]> = {
  majorType: [2, 9],
  minorType: [5, 10],
};

/** 2オクターブ展開の基準とスロット数を上書きする任意指定。 */
export interface ChordToneSlotOptions {
  /** スロット数。既定は PITCH_SLOT_COUNT_DEFAULT（7）。範囲は PITCH_SLOT_COUNT_MIN〜PITCH_SLOT_COUNT_MAX（5〜9）。 */
  slotCount?: number;
  /** 2オクターブ展開の基準となる、ハ音（音高クラス0）のMIDIノート番号。根音のMIDIノート番号はこの値に根音の音高クラスを足して求める。
   *  既定は CHORD_PITCH_BASE_C_MIDI（#35 と同じ72）。 */
  baseCMidi?: number;
}

/** 解決済みの和音区間。chordName は Issue #37 解決済みで無和音「N」を含まない実在の和音名とする。 */
export interface ResolvedChordRegion {
  startTimeMs: number;
  endTimeMs: number;
  chordName: string;
}

/** 2つの音高クラスの半音距離を、12を法とする循環距離として返す。距離が1なら半音隣接である。
 *  循環距離を使う理由を先に述べる。音高クラスは12を法とする循環構造のため、単純な差の絶対値では「シ(11)とド(0)」のような
 *  循環をまたぐ半音隣接を見逃す。循環距離はこれを正しく捉える。単体テストで循環の正しさを直接確かめるために公開する。
 *  引数の契約: a と b は音高クラス（0以上11以下の整数）を渡す。12を法とする剰余で正規化するため範囲外でも剰余で吸収するが、想定する入力は音高クラスである。 */
export function circularSemitoneDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % SEMITONES_PER_OCTAVE;
  return Math.min(d, SEMITONES_PER_OCTAVE - d);
}

/** 和音の品質から、根音からの音程（半音数）の集合として安全協和音高クラス集合を構築する。
 *  構成音は常に採用し、安全付加音の候補は「重複でなく、かつ既存のどの音高クラスとも半音隣接でない」場合だけ採用する。
 *  採否を2段階にする理由を先に述べる。長六和音は6度が構成音そのものであり、重複追加を黙って許すと要素数や後段の展開が崩れる。
 *  また増三和音の6度は増5度と半音隣接になり協和を崩す。よって重複チェックと半音隣接チェックの両方を通った付加音だけを採る。 */
export function buildSafeConsonanceIntervals(quality: ChordQuality): number[] {
  const chordIntervals = CHORD_QUALITY_INTERVALS[quality];
  const category = QUALITY_TO_TONE_CATEGORY[quality];
  // 網羅性検査。parseChordSymbol が返す品質を各表も網羅するが、将来 ChordQuality に品質が追加され表の更新が漏れた場合に、
  // 誤った値を黙って使わず発生源で止めるための検査である。
  if (chordIntervals === undefined || category === undefined) {
    throw new Error(`和音の品質に対応する音程表がありません（内部不整合）: "${String(quality)}"`);
  }

  const intervals = [...chordIntervals];
  const presentPitchClasses = new Set<number>(intervals.map((iv) => iv % SEMITONES_PER_OCTAVE));

  for (const added of SAFE_ADDED_TONE_SEMITONES[category]) {
    const addedPitchClass = added % SEMITONES_PER_OCTAVE;
    if (presentPitchClasses.has(addedPitchClass)) {
      continue; // 重複チェック: 既に構成音または採用済み付加音と同じ音高クラスなら採らない。
    }
    let adjacent = false;
    for (const present of presentPitchClasses) {
      if (circularSemitoneDistance(present, addedPitchClass) === 1) {
        adjacent = true;
        break;
      }
    }
    if (adjacent) {
      continue; // 半音隣接チェック: 既存のいずれかと半音差なら協和を崩すため採らない。
    }
    intervals.push(added);
    presentPitchClasses.add(addedPitchClass);
  }

  // 重複チェックの帰結を明示する。短七和音は♭7度が構成音そのものであり重複として除外されるため、採用される付加音は11度だけになり、
  // 結果の音程集合は短三和音と同じ [0,3,5,7,10] になる。属七和音は6度が♭7度と半音隣接で除外され、増三和音は6度が増5度と半音隣接で除外される。
  return intervals.sort((a, b) => a - b);
}

/** スロット数を検証して確定する。整数でなく、または範囲外なら例外を出す。
 *  下限を PITCH_SLOT_COUNT_MIN（5）に固定する理由を先に述べる。作品仕様でスロット数の調整範囲が5以上9以下と定まっているためである
 *  （src/config/tuning.ts、docs/research/07-feasibility-and-parameters.md §2.3）。この下限により等間隔抽出の分母 N−1 は4以上となり、ゼロによる除算も同時に防がれる。 */
function resolveSlotCount(requested: number | undefined): number {
  const slotCount = requested ?? PITCH_SLOT_COUNT_DEFAULT;
  if (!Number.isInteger(slotCount) || slotCount < PITCH_SLOT_COUNT_MIN || slotCount > PITCH_SLOT_COUNT_MAX) {
    throw new Error(
      `スロット数が範囲外です（${PITCH_SLOT_COUNT_MIN}以上${PITCH_SLOT_COUNT_MAX}以下の整数が必要）: ${String(slotCount)}`
    );
  }
  return slotCount;
}

/** 構造化済みの和音から、Y軸スロットの音高の並び（MIDIノート番号の昇順配列、要素数=スロット数）を返す中核関数。
 *  手順は次のとおりである。安全協和音高クラス集合を根音からの音程として構築し、根音のMIDIノート番号を下端に2オクターブ展開して
 *  候補列を作り、候補列から等間隔にスロット数ぶんを抜き出す。協和の保証・並び順の契約・各しきい値の採用理由は本ファイル冒頭に記す。 */
export function generateSlotPitches(parsed: ParsedChord, options?: ChordToneSlotOptions): number[] {
  const slotCount = resolveSlotCount(options?.slotCount);
  const baseCMidi = options?.baseCMidi ?? CHORD_PITCH_BASE_C_MIDI;
  // 基準音は整数であることを入口で検査する。理由を先に述べる。基準音が整数でないと展開後の全音高が整数でなくなる。
  // 候補生成の範囲検査でも捕捉できるが、原因が基準音だと一目で分かる内容の例外を、候補列を回す前に早期に出すためである。
  if (!Number.isInteger(baseCMidi)) {
    throw new Error(`基準音 baseCMidi は整数である必要があります: ${String(baseCMidi)}`);
  }
  const intervals = buildSafeConsonanceIntervals(parsed.quality);
  const rootMidi = baseCMidi + parsed.rootPitchClass;

  // 2オクターブ展開。各音程を rootMidi に足し、その1オクターブ上にも置く。全音程が0以上11以下のため、候補列は rootMidi から始まり根音が最低音になる。
  // 範囲検査は候補生成の時点で行う。後段の等間隔抽出の後に検査すると外れ値が偶然落ちて検査をすり抜ける場合があり、原因の特定も遅れるためである。
  // 候補列に同じMIDIノート番号が重複しない根拠を述べる。安全協和音高クラス集合は音高クラスが相異なり（presentPitchClasses で管理）、
  // 各音高クラスを下のオクターブとその1つ上にだけ置くため、相異なる音程 iv1 と iv2（ともに0以上11以下）に対し rootMidi+iv1+12 と rootMidi+iv2 が一致することはない。
  const candidates: number[] = [];
  for (const interval of intervals) {
    for (const pitch of [rootMidi + interval, rootMidi + interval + SEMITONES_PER_OCTAVE]) {
      if (!Number.isInteger(pitch) || pitch < MIDI_MIN || pitch > MIDI_MAX) {
        throw new Error(
          `展開後の音高がMIDIの範囲（${MIDI_MIN}以上${MIDI_MAX}以下の整数）を外れました: ${pitch}。` +
            `根音の音高クラス=${parsed.rootPitchClass}、品質=${parsed.quality}、基準音 baseCMidi=${baseCMidi} を見直してください`
        );
      }
      candidates.push(pitch);
    }
  }
  candidates.sort((a, b) => a - b);

  const candidateCount = candidates.length;
  if (candidateCount < slotCount) {
    throw new Error(
      `相異なる協和スロットを作れません。品質=${parsed.quality}、根音の音高クラス=${parsed.rootPitchClass}、` +
        `候補数=${candidateCount}、要求スロット数=${slotCount}`
    );
  }

  // 等間隔抽出。両端（最低音=根音、最高音）を必ず含み、間を均等に取る。スロット数は5以上9以下のため分母は4以上であり、ゼロによる除算は起こらない。
  const selectedIndices: number[] = [];
  for (let k = 0; k < slotCount; k++) {
    selectedIndices.push(Math.round((k * (candidateCount - 1)) / (slotCount - 1)));
  }

  // 実装側の事後条件。数学的根拠で破れは起きないが、将来の改変や境界条件の見落としで不変条件が崩れた際に、誤った値を黙って下流へ渡さず発生源で止める。
  for (let k = 1; k < selectedIndices.length; k++) {
    if (selectedIndices[k] <= selectedIndices[k - 1]) {
      throw new Error(
        `等間隔抽出の添字が狭義単調増加になりませんでした（内部不整合）: ${JSON.stringify(selectedIndices)}`
      );
    }
  }
  if (selectedIndices.length !== slotCount) {
    throw new Error(`抽出したスロット数が要求と一致しません（内部不整合）: ${selectedIndices.length} != ${slotCount}`);
  }

  return selectedIndices.map((index) => candidates[index]);
}

/** 和音名から直接、Y軸スロットの音高の並びを返す便宜関数（parseChordSymbol と generateSlotPitches の合成）。
 *  無和音「N」・解析不能・未対応の品質では parseChordSymbol が例外を出す。候補不足や範囲外では和音名を添えた例外にする。 */
export function chordNameToSlotPitches(name: string, options?: ChordToneSlotOptions): number[] {
  const parsed = parseChordSymbol(name);
  try {
    return generateSlotPitches(parsed, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`和音 "${name}" のスロット生成に失敗しました: ${message}`);
  }
}

/** 解決済みの和音区間の配列から、曲プロファイルの slots 配列（ChordToneSlotRegion[]）を作る配列版。
 *  chordName は Issue #37 解決済みで無和音「N」を含まないことを契約とする。本モジュールは無和音を入力として受け付けず、
 *  万一「N」や解析不能な和音が来た場合は黙って飛ばさず例外を出す（中核関数の例外を伝える二重の防御）。
 *  例外の内容には原因の和音名に加えて配列内の区間添字を含める。理由を先に述べる。複数区間をまとめて処理するため、どの区間が原因かを
 *  添字で特定できないと曲プロファイル生成（Issue #45・#46）の原因究明が困難になるためである。 */
export function generateChordToneSlots(
  regions: ResolvedChordRegion[],
  options?: ChordToneSlotOptions
): ChordToneSlotRegion[] {
  return regions.map((region, index) => {
    let pitches: number[];
    try {
      pitches = chordNameToSlotPitches(region.chordName, options);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`区間[${index}]（和音 "${region.chordName}"）のスロット生成に失敗しました: ${message}`);
    }
    return {
      startTimeMs: region.startTimeMs,
      endTimeMs: region.endTimeMs,
      chordName: region.chordName,
      pitches,
    };
  });
}
