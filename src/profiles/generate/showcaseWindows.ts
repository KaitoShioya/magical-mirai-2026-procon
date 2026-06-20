// 見せ場マップ生成の手順2-4・手順4（窓の決定）。純粋関数のみで、入力を破壊しない。
// chorus 窓と climax 窓は不変、非chorus窓だけを拍数えで作って重なりを切り詰める。
// 出典 docs/research/04-ux-and-chart-design.md、docs/decisions/app-overall-decisions.md §3.6。

import type { ShowcaseWindow, TimeRange } from "./types";

/**
 * 拍配列が窓生成に使えるかを判定する。
 * 採用理由を先に述べる。拍を数えて窓を作るには2つ以上の拍が要り、拍は時刻順に進む必要がある。空・要素2未満、
 * または狭義単調増加でない（等値＝同時刻の重複や逆順を含む）と拍番号や拍数えが定まらないため使えないとする。
 * 等値を許すと同じ時刻の拍が複数あって16拍数えても時間が進まないため、等値も弾く。
 */
export function beatsUsable(beatsMs: number[]): boolean {
  if (beatsMs.length < 2) return false;
  for (let i = 1; i < beatsMs.length; i++) {
    if (!(beatsMs[i] > beatsMs[i - 1])) return false;
  }
  return true;
}

/**
 * 時刻に最も近い拍の番号を返す（同距離なら早い拍）。
 * 採用理由を先に述べる。窓の中心となる拍を一意に決めるため、最小距離の拍を選び、距離が同じなら最小番号
 * （早い拍）を選んで決定論にする。beatsUsable が真であることを前提とする。
 */
export function nearestBeatIndex(beatsMs: number[], timeMs: number): number {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < beatsMs.length; i++) {
    const d = Math.abs(beatsMs[i] - timeMs);
    if (d < bestDistance) {
      bestDistance = d;
      bestIndex = i;
    }
  }
  return bestIndex;
}

function clampIndex(index: number, length: number): number {
  if (index < 0) return 0;
  if (index > length - 1) return length - 1;
  return index;
}

/**
 * 非chorus窓を拍を数えて作る（最近接スナップは使わない）。
 * 採用理由を先に述べる。音楽的な見せ場は1フレーズの長さを持つ。代表時刻の拍から片側 windowHalfBeats 拍ぶん
 * 前後を数え、開始は16拍前・終了は16拍後と方向を固定するので、開始が終了を追い越す曖昧さが生じない。拍番号が
 * 配列範囲を外れる場合は先頭・末尾でクランプする。拍が使えない曲では拍数えをやめ、代表時刻の前後 fallback 幅を
 * 窓とする（この幅は目標曲の片側16拍に相当する）。
 */
export function buildBeatWindow(
  representativeMs: number,
  beatsMs: number[],
  windowHalfBeats: number,
  windowHalfMsFallback: number
): TimeRange {
  if (!beatsUsable(beatsMs)) {
    return { startMs: representativeMs - windowHalfMsFallback, endMs: representativeMs + windowHalfMsFallback };
  }
  const center = nearestBeatIndex(beatsMs, representativeMs);
  const startMs = beatsMs[clampIndex(center - windowHalfBeats, beatsMs.length)];
  const endMs = beatsMs[clampIndex(center + windowHalfBeats, beatsMs.length)];
  return { startMs, endMs };
}

function clampToDuration(value: number, durationMs: number): number {
  if (value < 0) return 0;
  if (value > durationMs) return durationMs;
  return value;
}

/**
 * climax 窓の終端を最大重み時点（引数 anchorMs）まで延長する。anchorMs は曲別の最大重み時点で、TAKEOVER では
 * 189000ミリ秒。本関数は曲固有値を内部に持たず、呼び出し側が渡した anchorMs だけを使う汎用関数である。
 * 採用理由を先に述べる。§3.6 は最大重み時点に最大重みの見せ場を要求する。chorus 区間は終端がアンカーの手前で
 * 終わることがあるため、終端をアンカーまで延ばして見せ場がアンカー地点を覆うようにする。アンカーが曲長を超える
 * 曲では延長しない（曲外へはみ出さない）。直後に chorus がある一般の曲では、延長で次の chorus に食い込まないよう
 * 次 chorus 開始で頭打ちにする。最後に窓を[0, durationMs]内へ収める。
 */
export function extendClimaxWindow(
  base: TimeRange,
  anchorMs: number,
  durationMs: number,
  nextChorusStartMs: number | null
): TimeRange {
  let endMs = base.endMs;
  if (anchorMs <= durationMs) {
    endMs = Math.max(anchorMs, base.endMs);
  }
  if (nextChorusStartMs !== null) {
    endMs = Math.min(endMs, nextChorusStartMs);
  }
  return {
    startMs: clampToDuration(base.startMs, durationMs),
    endMs: clampToDuration(endMs, durationMs),
  };
}

/** 不変窓（切り詰めで動かさない）かを判定する。chorus 窓と climax 窓が不変。 */
function isImmutable(window: ShowcaseWindow): boolean {
  return window.source === "chorus" || window.isClimax;
}

/** 切り詰め後の非chorus窓が短すぎる（minWindowMs 未満）。設計上起きてはならない退化入力で発火する。 */
export class WindowTooShortError extends Error {
  constructor(lengthMs: number, minWindowMs: number) {
    super(`非chorus窓が短すぎる（長さ${lengthMs}ms、下限${minWindowMs}ms）`);
    this.name = "WindowTooShortError";
  }
}

/** 不変窓どうしが重なった（設計上起きてはならない。climax 延長が後続 chorus へ食い込んだ等）。 */
export class OverlappingImmutableWindowsError extends Error {
  constructor() {
    super("不変窓どうしが重なっている");
    this.name = "OverlappingImmutableWindowsError";
  }
}

/**
 * 窓の重なりを決定論的に解消する（手順4-3）。
 * 採用理由を先に述べる。スキーマ検証は見せ場区間の重複を禁じる。chorus と climax の境界を動かすと達成基準を
 * 破るため、調整は非chorus窓に限定する。3つ以上の窓が連鎖して重なる場合に処理順で結果が変わらないよう、代表
 * 時刻の昇順に並べて左から右へ隣接ペアだけを順に処理する。片方が不変窓なら非chorus窓側をその境界へ寄せ、両方
 * 非chorus窓なら2つの代表時刻の中点で分ける。最後に全窓を[0, durationMs]内へ収め、非chorus窓の長さが minWindowMs
 * 未満になったら退化入力として WindowTooShortError を投げる。validateProfile は start<end しか見ないため、投下の
 * 対象として知覚できる最小限の長さをここで保証する。
 */
export function resolveWindows(
  windows: ShowcaseWindow[],
  durationMs: number,
  minWindowMs: number
): ShowcaseWindow[] {
  const sorted = windows
    .map((w) => ({ ...w }))
    .sort((a, b) => a.representativeMs - b.representativeMs);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (prev.endMs <= cur.startMs) continue;
    const prevImmutable = isImmutable(prev);
    const curImmutable = isImmutable(cur);
    if (prevImmutable && curImmutable) {
      throw new OverlappingImmutableWindowsError();
    } else if (prevImmutable && !curImmutable) {
      cur.startMs = prev.endMs;
    } else if (!prevImmutable && curImmutable) {
      prev.endMs = cur.startMs;
    } else {
      const mid = (prev.representativeMs + cur.representativeMs) / 2;
      prev.endMs = Math.min(prev.endMs, mid);
      cur.startMs = Math.max(cur.startMs, mid);
    }
  }
  for (const w of sorted) {
    w.startMs = clampToDuration(w.startMs, durationMs);
    w.endMs = clampToDuration(w.endMs, durationMs);
    if (!isImmutable(w)) {
      const lengthMs = w.endMs - w.startMs;
      if (lengthMs < minWindowMs) throw new WindowTooShortError(lengthMs, minWindowMs);
    }
  }
  return sorted;
}
