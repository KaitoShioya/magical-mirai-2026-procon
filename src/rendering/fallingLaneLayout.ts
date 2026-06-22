// 判定UI（落下式レーン Issue #57）の落下位置・可視選別・数字割り当て・プール容量の純粋関数。
// three.js にも文書要素にも依存しないため決定的に単体検証できる。表示物（fallingLane.ts）から呼び出す。
// 状態を読むだけの計算であり、判定・得点・時刻の論理を持たない（依存規則 docs/decisions/architecture.md §5）。

import type { LaneNote } from "../types/judgmentLane";

/** レーンの時間窓。leadMs は出現から目標線到達まで、postTargetMs は目標線通過後の表示猶予（ともにミリ秒）。 */
export interface LaneTimingWindow {
  readonly leadMs: number;
  readonly postTargetMs: number;
}

/** レーンの縦座標（2次元層の単位）。topY は上端、targetY は目標線（上端より下の小さい値）。 */
export interface LaneGeometryY {
  readonly topY: number;
  readonly targetY: number;
}

/** 可視ノーツの添字区間。start は含み、end は含まない（[start, end) 半開）。 */
export interface NoteIndexRange {
  readonly start: number;
  readonly end: number;
}

/**
 * ノーツ列を timeMs 昇順へ複製して並べ替える（入力非破壊）。
 * 可視選別とプール容量算出の二分探索・滑り窓は timeMs 昇順を前提とするため、入力の昇順保証に
 * 依存せず内部で昇順を確定する。
 */
export function sortLaneNotesByTime(notes: readonly LaneNote[]): LaneNote[] {
  return notes.slice().sort((a, b) => a.timeMs - b.timeMs);
}

/** 進度。1 はレーン上端（出現直後）、0 は目標線（叩く瞬間）、負は目標線を越えた直下。 */
export function laneProgress(noteTimeMs: number, gameTimeMs: number, leadMs: number): number {
  return (noteTimeMs - gameTimeMs) / leadMs;
}

/** 進度から2次元層の縦位置を求める。進度に対して線形。 */
export function laneNoteY(progress: number, geometry: LaneGeometryY): number {
  return geometry.targetY + progress * (geometry.topY - geometry.targetY);
}

/**
 * 落下速度（2次元層の単位の、ゲーム時刻1ミリ秒あたりの移動量）。
 * y は (noteTimeMs − gameTimeMs)/leadMs に比例するため、gameTimeMs についての変化率は
 * −(topY − targetY)/leadMs で時刻に依らず一定になる。ゲーム時刻が進むと縦位置は下がるため負になる。
 */
export function laneFallSpeedPerMs(geometry: LaneGeometryY, leadMs: number): number {
  return -(geometry.topY - geometry.targetY) / leadMs;
}

/**
 * 進度が表示範囲内か。表示範囲は −postTargetMs/leadMs 以上 1 以下（両端を含む）。
 * 進度が非数のときは不可視として扱う（比較が偽になるため自然に false を返す）。
 */
export function isLaneProgressVisible(progress: number, window: LaneTimingWindow): boolean {
  const lowerBound = -window.postTargetMs / window.leadMs;
  return progress >= lowerBound && progress <= 1;
}

/**
 * 数字図版のセル添字。slotIndex を 0 始まりのセル添字へ写す。
 * slotIndex が整数でない、1未満、またはセル数を越えるときは、対応するセルが無いため null を返す。
 */
export function digitCellIndex(slotIndex: number, cellCount: number): number | null {
  if (!Number.isInteger(slotIndex) || slotIndex < 1 || slotIndex > cellCount) {
    return null;
  }
  return slotIndex - 1;
}

/** timeMs 昇順の列で、timeMs が value 以上になる最初の添字を返す（無ければ末尾の長さ）。 */
function lowerBoundByTime(sortedNotes: readonly LaneNote[], value: number): number {
  let lo = 0;
  let hi = sortedNotes.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sortedNotes[mid].timeMs < value) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

/** timeMs 昇順の列で、timeMs が value より大きくなる最初の添字を返す（無ければ末尾の長さ）。 */
function upperBoundByTime(sortedNotes: readonly LaneNote[], value: number): number {
  let lo = 0;
  let hi = sortedNotes.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sortedNotes[mid].timeMs <= value) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

/**
 * timeMs 昇順のノーツ列から、可視ノーツの添字区間を求める。
 * 時間窓は [gameTimeMs − postTargetMs, gameTimeMs + leadMs] の閉区間（両端を含む）。
 * 端点ちょうどの timeMs のノーツも含めるため、下端は「value 以上」、上端は「value より大きい」で区切る。
 * ゲーム時刻が有限でないときは、寸法未確定の瞬間にノーツを画面端へ飛ばさないため空区間を返す。
 */
export function visibleNoteRange(
  sortedNotes: readonly LaneNote[],
  gameTimeMs: number,
  window: LaneTimingWindow
): NoteIndexRange {
  if (!Number.isFinite(gameTimeMs)) {
    return { start: 0, end: 0 };
  }
  const low = gameTimeMs - window.postTargetMs;
  const high = gameTimeMs + window.leadMs;
  const start = lowerBoundByTime(sortedNotes, low);
  const end = upperBoundByTime(sortedNotes, high);
  return { start, end };
}

/**
 * timeMs 昇順の列で、長さ windowMs の閉区間 [t, t + windowMs] に同時に入るノーツ数の最大値を求める。
 * 連続して動く可視窓に同時に入るノーツ数が最大になるのは、窓の下端がいずれかのノーツの timeMs に一致する
 * ときであるため、各ノーツを下端に置いた窓ごとにノーツ数を数えて最大を採る。窓の上端はノーツの timeMs が
 * 増えるにつれ単調に増えるため、上端側の走査位置を後戻りさせず全体を一度の走査で求める。
 */
export function maxConcurrentInWindow(sortedNotes: readonly LaneNote[], windowMs: number): number {
  const n = sortedNotes.length;
  let maxCount = 0;
  let upper = 0;
  for (let i = 0; i < n; i += 1) {
    if (upper < i) {
      upper = i;
    }
    const windowEnd = sortedNotes[i].timeMs + windowMs;
    while (upper < n && sortedNotes[upper].timeMs <= windowEnd) {
      upper += 1;
    }
    const count = upper - i;
    if (count > maxCount) {
      maxCount = count;
    }
  }
  return maxCount;
}

/**
 * ノーツ点プールの容量。可視窓と同じ長さ leadMs + postTargetMs の窓に同時に入る最大ノーツ数に、
 * 余裕 margin を足した値。最も密集する窓で可視ノーツを取りこぼさないために最大同時数ぶんを確保し、
 * 窓境界の丸めや実機の時刻揺れで瞬間的に増える分への備えとして余裕を足す。
 * 入力は timeMs 昇順であること（sortLaneNotesByTime を通したもの）を前提とする。
 */
export function lanePoolCapacity(
  sortedNotes: readonly LaneNote[],
  window: LaneTimingWindow,
  margin: number
): number {
  const windowMs = window.leadMs + window.postTargetMs;
  return maxConcurrentInWindow(sortedNotes, windowMs) + margin;
}
