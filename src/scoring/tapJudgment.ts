// タップ判定の主関数（Issue #48）。1回のタップを最も近いノーツへ対応付け、タイミング精度・音程精度・JUST・床判定を返す。
// 床保証を先に述べる。どのタップも破棄せず必ず結果を返す（出典 docs/idea/concept-final.md §4「どのタップも音は鳴り、
// 楽曲終了後に必ず光点を生む」）。対応ノーツが窓内に無いとき、または音楽時刻が信頼できないフレームのときは床のタップとして返し、
// 下流（音 #52・光点 #51）が対の Reaction から発音と最小光点を生成できるようにする。
// 依存規則（docs/decisions/architecture.md §5）に従い profiles・rendering・tools・three.js を取り込まない。

import { isPitchJust, pitchAccuracy } from "./pitchAccuracy";
import { centeredDiffMs, isTimingJust, timingAccuracy } from "./timingAccuracy";
import type { JudgmentNote, JudgmentResult, JudgmentWindows, TapSample } from "./types";

/** judgeTap の任意設定。 */
export interface JudgeOptions {
  /** 判定窓。既定は src/scoring/defaultWindows.ts の DEFAULT_JUDGMENT_WINDOWS を呼び出し側が渡す。 */
  windows: JudgmentWindows;
  /** 較正による時刻のずれ補正（ミリ秒）。所有は較正UI #50。既定0。 */
  calibrationOffsetMs?: number;
}

/** 床のタップの結果を作る。対応ノーツが無い、または音楽時刻が信頼できないときに用いる。
 *  centeredDiffMs は対応ノーツが無く差が定義できないため非数とする（下流は isFloor で床と判別する）。 */
function floorResult(): JudgmentResult {
  return {
    boundNoteId: null,
    isFloor: true,
    centeredDiffMs: Number.NaN,
    timingAccuracy: 0,
    pitchAccuracy: 0,
    timingJust: false,
    pitchJust: false,
  };
}

/** 対応付けの優先順位を表す並べ替えキー。値が小さいほど優先する。 */
interface CandidateKey {
  /** 第1基準: 中心化済み時間差の絶対値（最も近いノーツ点を優先）。 */
  absDiff: number;
  /** 第2基準: スロット不一致を1、一致を0（同時押しで各指が自分のスロットへ対応するため）。 */
  slotMismatch: number;
  /** 第3基準: ノーツの判定基準時刻（昇順）。 */
  timeMs: number;
  /** 第4基準: ノーツ id（昇順）。決定論を保つ。 */
  id: string;
}

/** 2つのキーを辞書順で比較する。負ならaを優先、正ならbを優先、0は同順。 */
function compareKey(a: CandidateKey, b: CandidateKey): number {
  if (a.absDiff !== b.absDiff) {
    return a.absDiff - b.absDiff;
  }
  if (a.slotMismatch !== b.slotMismatch) {
    return a.slotMismatch - b.slotMismatch;
  }
  if (a.timeMs !== b.timeMs) {
    return a.timeMs - b.timeMs;
  }
  if (a.id < b.id) {
    return -1;
  }
  if (a.id > b.id) {
    return 1;
  }
  return 0;
}

/**
 * タップを対応ノーツへ判定する。
 * 手順を先に述べる。第1に信頼性と音楽時刻の有効性を確かめ、崩れていれば床のタップを返す。第2に外端窓内のノーツから
 * 辞書順（時間差絶対値・スロット一致・時刻・id）で先頭を選ぶ。第3に対応ノーツが無ければ床のタップを返す。
 * 第4に選んだノーツに対しタイミング精度・音程精度・各JUSTを算出して返す。
 */
export function judgeTap(
  tap: TapSample,
  notes: readonly JudgmentNote[],
  options: JudgeOptions
): JudgmentResult {
  const offsetMs = options.calibrationOffsetMs ?? 0;
  const { windows } = options;

  if (!tap.reliableMusicTime || !Number.isFinite(tap.musicTimeMs)) {
    return floorResult();
  }

  let bestNote: JudgmentNote | null = null;
  let bestKey: CandidateKey | null = null;
  let bestDiff = Number.NaN;

  for (const note of notes) {
    if (!Number.isFinite(note.timeMs)) {
      continue;
    }
    const diff = centeredDiffMs(tap.musicTimeMs, note.timeMs, offsetMs);
    const absDiff = Math.abs(diff);
    if (absDiff > windows.outerMs) {
      continue;
    }
    const key: CandidateKey = {
      absDiff,
      slotMismatch: tap.slot0 === note.slot0 ? 0 : 1,
      timeMs: note.timeMs,
      id: note.id,
    };
    if (bestKey === null || compareKey(key, bestKey) < 0) {
      bestNote = note;
      bestKey = key;
      bestDiff = diff;
    }
  }

  if (bestNote === null) {
    return floorResult();
  }

  return {
    boundNoteId: bestNote.id,
    isFloor: false,
    centeredDiffMs: bestDiff,
    timingAccuracy: timingAccuracy(bestDiff, windows),
    pitchAccuracy: pitchAccuracy(tap.slot0, bestNote.slot0),
    timingJust: isTimingJust(bestDiff, windows),
    pitchJust: isPitchJust(tap.slot0, bestNote.slot0),
  };
}
