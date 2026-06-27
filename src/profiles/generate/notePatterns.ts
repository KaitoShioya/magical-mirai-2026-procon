// 譜面パターン適用＝音程番号（slotIndex）割当（曲非依存の純粋関数。Issue #39 を再設計＝不満②の根治）。
// オンセット選択（#38再設計）で得た中間ノーツ列に、Y軸スロット番号（slotIndex）と譜面パターン名（pattern）を付ける。
//
// 旧実装の単調さ（実測で裏取り済み）と本再設計の対処を先に述べる。
//   - 中央集中（slot3〜5に92%・最上7が1件・最下1が2件）: 起点の再シードが勢い値（約0.5に張り付く）だけで決まり常に
//     中央（約4）を返していた。本再設計は起点をコード区間索引と所属サビ反復役割から決定論的に音域へ分散する（基準B）。
//   - 長い同番号連続（最大6）: 反単調規則で同一slotIndexの連続を最大2に抑える（基準A）。
//   - 這うような±1移動（変化の92.7%が±1）: 配置語彙（階段=±1連続・トリル=±1往復・跳躍=|差|≥2・意図的同音）を
//     声量・小節内拍位置から決定論的に選び、跳躍をフレーズ先頭・コード境界・強拍へ優先配置する（基準C・H）。
//   - サビ3反復の対比: 同一 beatOffset に対し役割（主題=基準音域・変奏=音域帯移動か輪郭反転・回帰=音域拡大）で
//     番号を変える決定論的変換を置く（基準G）。
//
// slotIndex 空間だけで動かす契約は維持する。#36（chordToneSlots.ts）の並び順契約により slots[].pitches は MIDI 昇順で、
// slotIndex（1始まりの添字）が大きいほど高音である。本モジュールは音高の数値を一切読まず、slotIndex を増やせば音高が
// 上がるという対応に乗る。slots から読むのは各区間の時刻境界とスロット数（pitches.length）だけである。
//
// 依存方針: 取り込みは型のみ。中間ノーツ型 OnsetNote（#38）と、スロット区間・声量曲線・感情曲線・反復区間の型（スキーマ）
// だけを取り込み、中核（engine 等）・rendering・tools・three.js・TextAlive と最終 Note 型は取り込まない。

import type { OnsetNote } from "./onsetNotes";
import type {
  ChordToneSlotRegion,
  LoudnessCurve,
  DiversityZone,
} from "../schema/profileSchema";

/** 譜面パターン名。上昇（slotIndex が前のノーツより上がる）・下降（下がる）・同音連打（変わらない）の3種。 */
export type NotePattern = "ascending" | "descending" | "sameTone";

/** 番号割当が読む拍の最小形。各ノーツの beatIndex から小節内拍位置を引くために使う。 */
export interface NotePatternBeat {
  index: number;
  position: number;
  lengthInBar: number;
  startTimeMs: number;
}

/** 譜面パターン適用の入力。すべて時刻昇順・曲全域被覆を前提とする。 */
export interface NotePatternInput {
  /** #38 の中間ノーツ列。時刻昇順前提。 */
  notes: OnsetNote[];
  /** #36 のスロット区間列。時刻昇順・曲全域被覆・全区間でスロット数同一を前提とする。各区間の時刻境界とスロット数だけを読む。 */
  slots: ChordToneSlotRegion[];
  /** 声量曲線。配置語彙の選択に使う。 */
  loudness: LoudnessCurve;
  /** 拍配列（index・position・lengthInBar・startTimeMs）。各ノーツの小節内拍位置の参照に使う。 */
  beats: NotePatternBeat[];
  /** フレーズ先頭時刻配列（昇順想定）。跳躍優先順位の第1条件（フレーズ先頭）の判定に使う。 */
  phraseOnsetsMs: number[];
  /** サビ反復の区間と役割。反復別の音域変換（基準G）に使う。 */
  diversityZones: DiversityZone[];
}

/** 譜面パターン適用のオプション。すべて既定値を持ち、曲横展開で上書きできる。 */
export interface NotePatternOptions {
  /** 同一slotIndex の連続上限（基準A）。これを超えそうなら隣接番号へずらす。 */
  maxRun: number;
  /** 大きい声量とみなす正規化声量の閾値。これ以上の拍では跳躍・階段の振幅を大きくする。 */
  loudThreshold: number;
  /** 跳躍候補（コード境界・強拍）の間引きストライド。この個数に1個だけ跳躍させる（基準Cの帯に収める）。 */
  leapStride: number;
}

/** パターン適用後の中間ノーツ。最終 Note のうち本段で確定する項目を持つ。 */
export interface PatternedNote {
  id: string;
  timeMs: number;
  beatIndex: number;
  /** Y軸スロット番号。1からスロット数まで。 */
  slotIndex: number;
  pattern: NotePattern;
}

/** 既定オプション。
 *  maxRun=2 の根拠を先に述べる。四分音符グリッドで同一番号3連続は同一スロットの縦連で単調・疲労を生むため2に抑える（基準A）。
 *  loudThreshold=0.5 は正規化声量の中点で、大小の二値分岐を素直に分ける初期値（プレイ検証で調整）。
 *  leapStride=4 の根拠を先に述べる。フレーズ先頭は常に跳躍し、コード境界・強拍は4個に1個だけ跳躍させる。サビ密度を
 *  0.5へ下げてサビのノーツが疎になると跳躍の割合が上がるため、間引きを3から4へ強めて跳躍を番号変化のうち2〜4割
 *  （基準C：20〜45%）に収め、過度な跳躍で難易度が上がるのを防ぐ。プレイ検証で調整する。 */
export const DEFAULT_NOTE_PATTERN_OPTIONS: NotePatternOptions = {
  maxRun: 2,
  loudThreshold: 0.5,
  leapStride: 4,
};

/** 所属和音区間を引くときの時刻の許容差（ミリ秒）。validateProfile・noChordResolution と同値・同理由（境界の取りこぼし防止）。 */
const TIME_TOLERANCE_MS = 1;

function clamp(value: number, lower: number, upper: number): number {
  return Math.min(Math.max(value, lower), upper);
}

/** 時刻に対応する正規化声量（0以上1以下）。負値は0、最大超過は1に丸める。 */
function normalizedLoudnessAt(timeMs: number, loudness: LoudnessCurve): number {
  if (!(loudness.maxAmplitude > 0) || loudness.values.length === 0) return 0;
  const idx = clamp(Math.floor(timeMs / loudness.stepMs), 0, loudness.values.length - 1);
  const raw = Math.max(loudness.values[idx], 0);
  return Math.min(raw / loudness.maxAmplitude, 1);
}

/** 時刻が属するスロット区間の添字を返す（開始時刻が時刻＋許容差以下の最後の区間、無ければ先頭）。 */
function findRegionIndex(timeMs: number, slots: readonly ChordToneSlotRegion[]): number {
  let found = -1;
  for (let i = 0; i < slots.length; i++) {
    if (slots[i].startTimeMs <= timeMs + TIME_TOLERANCE_MS) found = i;
    else break;
  }
  return found < 0 ? 0 : found;
}

/** スロット番号の差から譜面パターン名を決める。正なら上昇、負なら下降、0なら同音連打。 */
function patternFromDelta(slotIndexDelta: number): NotePattern {
  if (slotIndexDelta > 0) return "ascending";
  if (slotIndexDelta < 0) return "descending";
  return "sameTone";
}

/** 役割を表す数値オフセット。基準音域からの音域帯の移動量（スロット番号単位）を返す。
 *  採用理由を先に述べる。主題=基準（0）、変奏=音域帯を下へ移す（−2）、回帰=音域を上へ広げる（+2）とし、
 *  同一 beatOffset に対し役割で番号を確実に変える（基準G）。値はスロット数7に対し帯を3分割する大きさである。 */
function roleBandOffset(role: DiversityZone["role"] | undefined): number {
  if (role === "variation") return -2;
  if (role === "reprise") return 2;
  return 0; // theme または非サビ。
}

/** 循環序数（フレーズ通番またはコード区間索引）と役割から起点スロットを決定論的に音域へ分散する（基準B：中央偏りの回避）。
 *  採用理由を先に述べる。起点を勢い値だけで決めると中央に張り付くため、循環序数を循環させて全音域へ散らし、
 *  さらに役割の音域帯オフセットで反復間の起点も変える。循環の係数3はスロット数7と互いに素で、序数が増えるたびに
 *  起点が 1→4→7→3→6→2→5→1… と全7スロットを巡る（占有の偏りを抑える）。引数は呼び出し側でフレーズ通番にも
 *  コード区間索引にも使うため、特定の意味に縛らず循環序数として受ける。 */
function seedSlotByOrdinal(cycleOrdinal: number, role: DiversityZone["role"] | undefined, slotCount: number): number {
  const cyclic = ((cycleOrdinal * 3) % slotCount) + 1; // 1..slotCount を全周する。
  return clamp(cyclic + roleBandOffset(role), 1, slotCount);
}

/** 配置語彙。階段の昇降（±1連続）・トリル（±1往復）・跳躍（|差|≥2）・意図的同音の4種。 */
type Vocabulary = "stairUp" | "stairDown" | "trill" | "leap" | "hold";

/** 跳躍を置く位置の優先度を返す（高いほど跳躍に適する）。0は跳躍に不適。
 *  優先順位（再設計プラン基準C・H）: 第1フレーズ先頭(3)・第2コード境界(2)・第3小節内強拍(1)。
 *  比率（基準C：番号が変わった移動の20〜45%）を保つため、跳躍は全候補に置かず、優先度の高い候補から
 *  決定論的に間引いて置く（呼び出し側がストライドで絞る）。 */
function leapPriority(isPhraseStart: boolean, isChordBoundary: boolean, isStrongBeat: boolean): number {
  if (isPhraseStart) return 3;
  if (isChordBoundary) return 2;
  if (isStrongBeat) return 1;
  return 0;
}

/** 跳躍でない位置の配置語彙を、声量・小節内拍位置から決定論的に選ぶ。
 *  声量が大きいなら階段（昇降を位置の偶奇で交互）、小さいなら弱拍でトリル・強拍寄りで意図的同音にして緩急を作る。 */
function nonLeapVocabulary(loud: number, position: number, loudThreshold: number): Vocabulary {
  if (loud >= loudThreshold) {
    return position % 2 === 0 ? "stairUp" : "stairDown";
  }
  return position % 2 === 0 ? "trill" : "hold";
}

/** 語彙から次の slotIndex を決める。trillUp は直前の往復の向きを引数 prevTrillUp で記憶する。 */
function applyVocabulary(
  vocab: Vocabulary,
  prevSlot: number,
  prevTrillUp: boolean,
  loud: number,
  loudThreshold: number,
  slotCount: number,
): { slot: number; trillUp: boolean } {
  switch (vocab) {
    case "stairUp":
      return { slot: clamp(prevSlot + 1, 1, slotCount), trillUp: prevTrillUp };
    case "stairDown":
      return { slot: clamp(prevSlot - 1, 1, slotCount), trillUp: prevTrillUp };
    case "trill": {
      // ±1の往復。直前の向きを反転して交互にする。
      const up = !prevTrillUp;
      const next = up ? prevSlot + 1 : prevSlot - 1;
      return { slot: clamp(next, 1, slotCount), trillUp: up };
    }
    case "leap": {
      // |差|≥2 の跳躍。声量が大きいほど跳躍幅を大きくする（2 か 3）。音域端に当たる向きを反転する。
      const span = loud >= loudThreshold ? 3 : 2;
      const upCandidate = prevSlot + span;
      const downCandidate = prevSlot - span;
      // 上に跳べる余地があれば上、無ければ下へ跳ぶ。両方不可（スロット数が小さい）なら範囲内へクランプ。
      let next: number;
      if (upCandidate <= slotCount) next = upCandidate;
      else if (downCandidate >= 1) next = downCandidate;
      else next = clamp(prevSlot + span, 1, slotCount);
      // クランプで跳躍にならなかった場合は反対向きへ跳ぶ。
      if (Math.abs(next - prevSlot) < 2) {
        const alt = next === clamp(upCandidate, 1, slotCount) ? clamp(downCandidate, 1, slotCount) : clamp(upCandidate, 1, slotCount);
        if (Math.abs(alt - prevSlot) >= 2) next = alt;
      }
      return { slot: next, trillUp: prevTrillUp };
    }
    case "hold":
    default:
      return { slot: prevSlot, trillUp: prevTrillUp };
  }
}

/** 時刻が「いずれかの基準時刻配列の近接（許容差以内）」かを判定する。フレーズ先頭・コード境界の判定に使う。 */
function isNearAny(timeMs: number, sortedTimesMs: readonly number[], toleranceMs: number): boolean {
  for (const t of sortedTimesMs) {
    if (Math.abs(timeMs - t) <= toleranceMs) return true;
    if (t > timeMs + toleranceMs) break;
  }
  return false;
}

/** 各ノーツのフレーズ先頭判定。フレーズ先頭時刻の直後の最初のノーツを真とする。
 *  「直後の最初」を取る理由を先に述べる。フレーズ先頭時刻と拍時刻は厳密一致しないため、各フレーズ先頭時刻以上で
 *  最小の timeMs を持つノーツ1個をそのフレーズの先頭ノーツとみなす。 */
function computePhraseStartFlags(notes: OnsetNote[], phraseOnsetsMs: readonly number[]): boolean[] {
  const flags = new Array<boolean>(notes.length).fill(false);
  for (const onset of phraseOnsetsMs) {
    let chosen = -1;
    for (let i = 0; i < notes.length; i++) {
      if (notes[i].timeMs >= onset) {
        chosen = i;
        break;
      }
    }
    if (chosen >= 0) flags[chosen] = true;
  }
  return flags;
}

/** 役割の音域変換: 主題の slotIndex 列を役割で決定論的に変換する（基準G）。
 *  変奏は音域帯を2スロット下へ、回帰は2スロット上へ平行移動する。平行移動を採る理由を先に述べる。中央から距離を
 *  広げる拡大変換は連続する番号の差を増幅して跳躍が過半になり、配置語彙の多様（基準H）を崩すためである。平行移動は
 *  主題の輪郭（隣接の差）をそのまま保つので語彙分布が主題と同じに保たれ、かつ変奏（下）と回帰（上）で音域が分かれて
 *  反復間の番号対比（基準G）も成立する。端は範囲内へ収める。 */
function transformSlotByRole(baseSlot: number, role: DiversityZone["role"], slotCount: number): number {
  if (role === "theme") return baseSlot;
  if (role === "variation") {
    return clamp(baseSlot - 2, 1, slotCount);
  }
  // reprise: 音域帯を上へ平行移動する。
  return clamp(baseSlot + 2, 1, slotCount);
}

/**
 * 中間ノーツ列に slotIndex と pattern を付けて返す。
 *
 * 手順:
 * 1. まず非サビ・主題サビを通常の語彙駆動で割り当てる（起点=コード区間索引+役割の分散、配置語彙=声量・拍位置・
 *    跳躍優先位置、反単調規則で連続抑制）。
 * 2. サビ3反復は同一の拍選別（同一 beatOffset 集合、#38が保証）を共有するため、主題サビで確定した
 *    「beatOffset → slotIndex」を、変奏・回帰では役割変換して写す。これで3反復の番号が役割で対比する（基準G）。
 * 3. pattern は確定後の slotIndex 差から決める（既存方式）。
 *
 * 出力は入力ノーツの順序を保つ。id・timeMs・beatIndex は入力から写す。
 */
export function applyNotePatterns(
  input: NotePatternInput,
  options?: Partial<NotePatternOptions>,
): PatternedNote[] {
  const opts: NotePatternOptions = { ...DEFAULT_NOTE_PATTERN_OPTIONS, ...options };
  const { notes, slots, loudness } = input;

  if (notes.length === 0) return [];
  if (slots.length === 0) throw new Error("notes が非空のときスロット区間 slots を空にできません");

  const slotCount = slots[0].pitches.length;
  for (let i = 0; i < slots.length; i++) {
    if (slots[i].pitches.length !== slotCount) {
      throw new Error(
        `全スロット区間でスロット数が同一である必要があります。区間[0]は${slotCount}個、区間[${i}]は${slots[i].pitches.length}個です`,
      );
    }
  }
  if (slotCount < 1) throw new Error(`スロット数は1以上である必要がありますが ${slotCount} でした`);
  if (!(loudness.maxAmplitude > 0)) {
    throw new Error(`声量曲線の最大値 maxAmplitude は正である必要がありますが ${loudness.maxAmplitude} でした`);
  }

  // 各ノーツの所属スロット区間・小節内拍位置・声量・各種フラグを先に確定する。
  const beatByIndex = new Map<number, NotePatternBeat>();
  for (const b of input.beats) beatByIndex.set(b.index, b);
  const chordChangeTimes = slots.map((s) => s.startTimeMs); // スロット区間境界＝コード境界。
  const phraseStartFlags = computePhraseStartFlags(notes, input.phraseOnsetsMs);

  const regionIndices = notes.map((n) => findRegionIndex(n.timeMs, slots));
  const loudnessOf = notes.map((n) => normalizedLoudnessAt(n.timeMs, loudness));
  const positionOf = notes.map((n) => beatByIndex.get(n.beatIndex)?.position ?? 1);
  const chordBoundaryOf = notes.map((n) => isNearAny(n.timeMs, chordChangeTimes, TIME_TOLERANCE_MS + 1));

  // サビ反復区間と役割。timeMs から所属反復を引く。
  const zonesSorted = [...input.diversityZones].sort((a, b) => a.startTimeMs - b.startTimeMs);
  function zoneOf(timeMs: number): DiversityZone | undefined {
    return zonesSorted.find((z) => timeMs >= z.startTimeMs && timeMs < z.endTimeMs);
  }
  const themeZone = zonesSorted.find((z) => z.role === "theme");

  // 主題サビの beatOffset → slotIndex を記録する（変奏・回帰へ写すため）。
  const themeAnchorBeatIndex = (() => {
    if (!themeZone) return undefined;
    const themeNotes = notes.filter((n) => n.timeMs >= themeZone.startTimeMs && n.timeMs < themeZone.endTimeMs);
    return themeNotes.length > 0 ? themeNotes[0].beatIndex : undefined;
  })();
  const themeSlotByOffset = new Map<number, number>();

  // 第1段: 連続歩行で slotIndex を逐次決める。サビは主題のみ歩行し、変奏・回帰は第2段で役割変換する。
  //
  // 設計の要点（基準B・基準C の両立）を先に述べる。コード区間ごとに起点を全音域へ散らすと、コード区間が210もある
  // TAKEOVERでは区間先頭ごとに大きな段差（跳躍）が連発し、基準C（番号変化の20〜45%が跳躍）を大きく超える。そこで
  // 起点の再シードはフレーズ先頭にのみ行い（フレーズ単位で音域を巡らせて中央偏りを防ぐ＝基準B）、フレーズ内は
  // 連続歩行（主に±1の階段・トリル・同音）でつなぐ。跳躍はフレーズ先頭の再シードに加え、コード境界・強拍を候補に
  // ストライドで間引いて置く（音楽の節目に跳躍が乗りつつ件数を基準Cの帯に収める）。
  const slotIndices = new Array<number>(notes.length).fill(1);
  let prevTrillUp = false;
  let phraseCounter = 0; // フレーズ先頭の再シードを全音域へ巡らせるカウンタ（基準B）。
  let prevSlot = seedSlotByOrdinal(phraseCounter, undefined, slotCount);
  // 跳躍カウンタ。コード境界・強拍の跳躍候補を leapStride に1回だけ跳躍させる。
  let leapCandidateCounter = 0;

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    const zone = zoneOf(note.timeMs);
    const isChorus = zone !== undefined;
    const isVariationOrReprise = isChorus && zone.role !== "theme";

    const isPhraseStart = phraseStartFlags[i];

    if (isVariationOrReprise && themeZone && themeAnchorBeatIndex !== undefined) {
      slotIndices[i] = prevSlot; // 仮値。第2段で上書きする。
      continue;
    }

    let next: number;
    if (i === 0) {
      next = prevSlot; // 曲頭の起点。
    } else if (isPhraseStart) {
      // フレーズ先頭で再シード（全音域を巡る起点・役割の音域帯オフセット込み）。これ自体が音楽の節目の跳躍になる。
      phraseCounter++;
      next = seedSlotByOrdinal(phraseCounter, zone?.role, slotCount);
      prevTrillUp = false;
    } else {
      // フレーズ内: コード境界・強拍を跳躍候補にストライドで間引き、それ以外は連続歩行。
      const prio = leapPriority(false, chordBoundaryOf[i], positionOf[i] === 1);
      let doLeap = false;
      if (prio > 0) {
        doLeap = leapCandidateCounter % opts.leapStride === 0;
        leapCandidateCounter++;
      }
      if (doLeap) {
        const applied = applyVocabulary("leap", prevSlot, prevTrillUp, loudnessOf[i], opts.loudThreshold, slotCount);
        next = applied.slot;
      } else {
        const vocab = nonLeapVocabulary(loudnessOf[i], positionOf[i], opts.loudThreshold);
        const applied = applyVocabulary(vocab, prevSlot, prevTrillUp, loudnessOf[i], opts.loudThreshold, slotCount);
        next = applied.slot;
        prevTrillUp = applied.trillUp;
      }
    }

    slotIndices[i] = next;
    prevSlot = next;

    if (isChorus && zone.role === "theme" && themeAnchorBeatIndex !== undefined) {
      themeSlotByOffset.set(note.beatIndex - themeAnchorBeatIndex, next);
    }
  }

  // 第2段: 変奏・回帰サビの slotIndex を、主題の同一 beatOffset から役割変換して確定する（基準G）。
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    const zone = zoneOf(note.timeMs);
    if (!zone || zone.role === "theme") continue;
    const zoneNotes = notes.filter((n) => n.timeMs >= zone.startTimeMs && n.timeMs < zone.endTimeMs);
    const anchor = zoneNotes.length > 0 ? zoneNotes[0].beatIndex : note.beatIndex;
    const offset = note.beatIndex - anchor;
    const themeSlot = themeSlotByOffset.get(offset);
    if (themeSlot !== undefined) {
      slotIndices[i] = transformSlotByRole(themeSlot, zone.role, slotCount);
    } else {
      slotIndices[i] = clamp(seedSlotByOrdinal(regionIndices[i], zone.role, slotCount), 1, slotCount);
    }
  }

  // 第3段（反単調規則）: 全体（拍索引昇順＝notes順）で同一 slotIndex の連続が上限を超えないよう走査してずらす（基準A）。
  // 区間境界・役割変換後にも3連続が生じうるため、最終列で一括に抑える。ずらす向きは音域端を避ける向き。
  {
    let run = { slot: slotIndices[0], count: 1 };
    for (let i = 1; i < notes.length; i++) {
      let s = slotIndices[i];
      if (s === run.slot && run.count >= opts.maxRun) {
        s = s + 1 <= slotCount ? s + 1 : s - 1 >= 1 ? s - 1 : s;
        slotIndices[i] = s;
      }
      if (s === run.slot) run.count++;
      else run = { slot: s, count: 1 };
    }
  }

  // 第3段: 確定後の slotIndex 差から pattern を決める。区間境界の先頭は同区間直後との差で性格付ける（既存方式）。
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
