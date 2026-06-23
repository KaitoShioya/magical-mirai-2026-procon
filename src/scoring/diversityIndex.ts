// 多様性逓減の前計算インデックス（Issue #56）。
// 反復区間（diversityZones）とノーツ列から、各ノーツの「所属区間・区間内の拍オフセット・正解スロット」を前計算する純粋関数。
// 目的関数統合（objectiveFunction.ts）が1タップごとに多様性係数 D を求める際、前回の同リズム区間の正解スロットと
// プレイヤーの操作スロットを「同じリズム位置」で引くために使う。
//
// 依存規則（docs/decisions/architecture.md §5、src/scoring/README.md）に従い profiles・rendering・tools・three.js を
// 取り込まない。曲固有の値は曲プロファイル型ではなく、本ファイルの最小入力型（DiversityNoteInput・DiversityZoneInput）で受け取る。
//
// この関数は渡された反復区間が同リズム系列であるかを検証しない。同リズムであることの保証は呼び出し側（曲プロファイル生成
// Issue #42・#46）の責務である。本ファイルは時刻順に並べた区間の直前を前回区間とみなすだけである。

/** 1ノーツ分の最小入力。曲プロファイルの Note の id・timeMs・beatIndex・slotIndex を写す。slotIndex は1始まり。 */
export interface DiversityNoteInput {
  id: string;
  timeMs: number;
  beatIndex: number;
  slotIndex: number;
}

/** 反復区間の最小入力。境界だけを写す。役割や区間名は得点層では持たない（得点計算に不要なため）。 */
export interface DiversityZoneInput {
  startTimeMs: number;
  endTimeMs: number;
}

/** ノーツの区間内位置。beatOffset は区間内で最初に現れるノーツの beatIndex を0とした相対拍位置（同じリズム位置の対応に使う）。 */
export interface NotePosition {
  zoneIndex: number;
  beatOffset: number;
  correctSlot0: number;
}

/** 前計算した索引。区間索引はすべて startTimeMs 昇順に整列した後の順序を基準とする。 */
export interface DiversityIndex {
  /** ノーツ識別子から区間内位置への写像。どの区間にも入らないノーツは登録しない。 */
  byNoteId: ReadonlyMap<string, NotePosition>;
  /** 区間ごとの「拍オフセット→正解スロット（0始まり）」。前回区間の正解スロット参照に使う。 */
  zoneCorrectSlots: ReadonlyArray<ReadonlyMap<number, number>>;
  /** 区間ごとの前回区間索引。先頭区間は undefined。整列後の直前区間を前回とする。 */
  previousZoneIndex: ReadonlyArray<number | undefined>;
}

/**
 * 反復区間とノーツ列から DiversityIndex を前計算する。
 *
 * 手順:
 * 1. 区間を startTimeMs 昇順へ整列する（受け取り順に依存しないため）。
 * 2. 各区間について、timeMs が半開区間 [startTimeMs, endTimeMs) に入るノーツを集め、timeMs 昇順に並べる。
 *    どの区間にも入らないノーツは byNoteId に登録しない（その区間外タップの多様性係数は呼び出し側で 1.0 になる）。
 * 3. 区間内で最初に現れるノーツの beatIndex を基準に beatOffset = beatIndex − 区間先頭ノーツの beatIndex を振る。
 *    正解スロットは slotIndex − 1（判定エンジンと同じ0始まり）。
 * 4. previousZoneIndex は整列後の位置 p の前回を p−1 とする（p=0 は undefined）。
 *
 * 拍オフセットの基準を区間内の最初のノーツとするため、反復区間の先頭ノーツが各区間で同じリズム位置に揃っている前提に立つ。
 * 区間冒頭に休符や欠落ノーツが入る楽曲へ広げる場合は、この基準の取り方を見直す必要がある。
 */
export function buildDiversityIndex(
  notes: ReadonlyArray<DiversityNoteInput>,
  zones: ReadonlyArray<DiversityZoneInput>,
): DiversityIndex {
  const sortedZones = [...zones].sort((a, b) => a.startTimeMs - b.startTimeMs);

  const byNoteId = new Map<string, NotePosition>();
  const zoneCorrectSlots: Array<Map<number, number>> = [];
  const previousZoneIndex: Array<number | undefined> = [];

  for (let zoneIndex = 0; zoneIndex < sortedZones.length; zoneIndex += 1) {
    const zone = sortedZones[zoneIndex];
    const inZone = notes
      .filter((note) => note.timeMs >= zone.startTimeMs && note.timeMs < zone.endTimeMs)
      .sort((a, b) => a.timeMs - b.timeMs);

    const correctSlots = new Map<number, number>();
    if (inZone.length > 0) {
      const anchorBeatIndex = inZone[0].beatIndex;
      for (const note of inZone) {
        const beatOffset = note.beatIndex - anchorBeatIndex;
        const correctSlot0 = note.slotIndex - 1;
        byNoteId.set(note.id, { zoneIndex, beatOffset, correctSlot0 });
        correctSlots.set(beatOffset, correctSlot0);
      }
    }

    zoneCorrectSlots.push(correctSlots);
    previousZoneIndex.push(zoneIndex === 0 ? undefined : zoneIndex - 1);
  }

  return { byNoteId, zoneCorrectSlots, previousZoneIndex };
}
