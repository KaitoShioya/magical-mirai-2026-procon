// 見せ場マップ生成の手順2-3・手順3（climax の chorus 選定と非chorusピークの選定）。純粋関数のみ。
// 合成ボルテージ曲線（配列）を受け取って働き、信号処理モジュールには依存しない。
// 出典 docs/decisions/app-overall-decisions.md §3.5・§3.6、docs/research/04-ux-and-chart-design.md。

import { binCenterMs } from "./showcaseSignals";
import type { ChorusSegment, NonChorusPeak, TimeRange } from "./types";

/**
 * 時刻から区間までの距離（区間内は0）。
 * 採用理由を先に述べる。climax を「アンカーを含む chorus、無ければ最も近い chorus」と一意に決めるには、
 * 区間に対する距離が要る。アンカーが区間より前なら開始までの差、後ろなら終了からの差、内側なら0とする。
 */
export function distanceToRange(timeMs: number, range: TimeRange): number {
  if (timeMs < range.startMs) return range.startMs - timeMs;
  if (timeMs >= range.endMs) return timeMs - range.endMs;
  return 0;
}

/**
 * climax にする chorus 区間の番号を選ぶ。
 * 採用理由を先に述べる。§3.5 は終盤の最終区間に最大の発展を置き、§3.6 は189秒地点を最大重みとする。
 * アンカーを含む chorus があればそれ、無ければアンカーに最も近い chorus とし、距離が同じなら最も早い区間を
 * 採って決定論にする。chorus が無い曲では -1 を返し、呼び出し側が非chorusピーク最大を climax とする。
 */
export function selectClimaxChorusIndex(chorusSegments: ChorusSegment[], anchorMs: number): number {
  if (chorusSegments.length === 0) return -1;
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < chorusSegments.length; i++) {
    const d = distanceToRange(anchorMs, chorusSegments[i]);
    if (d < bestDistance) {
      bestDistance = d;
      bestIndex = i;
    }
  }
  return bestIndex;
}

/**
 * 時刻が候補から除外されるかを判定する。
 * 採用理由を先に述べる。chorus 区間はすでに見せ場なので内側を除外する。songmap の区間終端は次区間の開始と
 * 一致する排他境界のため右半開（開始以上・終了未満）で扱う。climax 窓の前後ガード帯は、climax 自身の
 * エネルギーの裾を別の見せ場として数えないためで、境界ちょうどのビンで実装とテストがずれないよう両端を含む。
 * climaxWindow が無い（chorus が無い曲で climax 未確定）ときはガードを適用しない。
 */
export function isTimeExcluded(
  timeMs: number,
  chorusSegments: ChorusSegment[],
  climaxWindow: TimeRange | null,
  climaxGuardMs: number
): boolean {
  for (const seg of chorusSegments) {
    if (timeMs >= seg.startMs && timeMs < seg.endMs) return true;
  }
  if (climaxWindow) {
    if (timeMs >= climaxWindow.startMs - climaxGuardMs && timeMs <= climaxWindow.endMs + climaxGuardMs) {
      return true;
    }
  }
  return false;
}

/**
 * 合成ボルテージの全体最大を求める（信頼比の分母）。
 * 採用理由を先に述べる。信頼比は各ピークの強さを曲全体の最高到達点に対して測るので、分母は曲全体の最大値
 * （chorus を含む）とする。値は非負なので0始まりで走査する。
 */
export function maxValue(values: number[]): number {
  let max = 0;
  for (const v of values) {
    if (v > max) max = v;
  }
  return max;
}

/** 非chorusピーク選定のエラー（適格ビンが必要数に満たない）。 */
export class NotEnoughPeaksError extends Error {
  constructor(requested: number, found: number) {
    super(`非chorus見せ場の候補が不足している（要求${requested}、確保${found}）`);
    this.name = "NotEnoughPeaksError";
  }
}

/**
 * 合成曲線から非chorusピークを貪欲に選ぶ。
 * 採用理由を先に述べる。「局所最大」は平坦部・同値・端の扱いが曖昧になるため、全体最大を選んで周辺を抑制する
 * 方式にする。これは平坦部でも一意に1点へ収束し、実装によらず同じ結果を返す。同点の比較は浮動小数の厳密比較で
 * 行い（許容差は使わない。許容差を使うと最大値近傍の別の山を同点と誤認しうる）、最大値に等しいビンが複数あれば
 * 最も早い時刻（最小のビン番号）を選ぶ。選んだ点の前後 minSpacingMs 以内を抑制して次を選ぶことで、同一の
 * 盛り上がりに2つの見せ場が重なるのを防ぐ。合成値が0のビンは無音かつ歌詞無しで盛り上がりが無いため候補にしない。
 * 必要数に達する前に適格ビンが尽きたら、6個ちょうどの契約を満たせないため NotEnoughPeaksError を投げる。
 * 計算量は採用数×ビン数に比例する（採用数ごとに全ビンを1回走査する）。
 * 戻り値は代表時刻（ビン中心）の昇順で、各ピークの信頼比（ピーク位置の合成値÷全体最大）を持つ。
 */
export function selectPeaksFromCurve(
  values: number[],
  gridMs: number,
  isTimeExcludedFn: (timeMs: number) => boolean,
  count: number,
  minSpacingMs: number,
  globalMaxValue: number
): NonChorusPeak[] {
  const n = values.length;
  const suppressed = new Array<boolean>(n).fill(false);
  const selected: { timeMs: number; compositeRatio: number }[] = [];
  for (let s = 0; s < count; s++) {
    let bestIndex = -1;
    let bestValue = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < n; i++) {
      if (suppressed[i]) continue;
      if (!(values[i] > 0)) continue;
      if (isTimeExcludedFn(binCenterMs(i, gridMs))) continue;
      if (values[i] > bestValue) {
        bestValue = values[i];
        bestIndex = i;
      }
    }
    if (bestIndex < 0) {
      throw new NotEnoughPeaksError(count, selected.length);
    }
    const timeMs = binCenterMs(bestIndex, gridMs);
    selected.push({
      timeMs,
      compositeRatio: globalMaxValue > 0 ? values[bestIndex] / globalMaxValue : 0,
    });
    for (let i = 0; i < n; i++) {
      if (Math.abs(binCenterMs(i, gridMs) - timeMs) <= minSpacingMs) suppressed[i] = true;
    }
  }
  selected.sort((a, b) => a.timeMs - b.timeMs);
  return selected;
}
