// 同時上限の算出（純粋関数）。固定値でなく、文字の開始時刻列と表示残存時間から最大同時数を走査して求める。
// 理由: 同時に存在しうる文字数は密度の平均でなく、実際の開始時刻の集中と表示残存時間で決まるため
// （docs/analysis/takeover.songmap.json の実測で、文字自身の継続時間では同時数1だが、表示残存を与えると増える）。

/**
 * 開始時刻列の各文字が [開始, 開始＋表示残存) の間だけ存在するとみなしたときの、同時存在の最大数。
 * 境界の扱い: 同時刻では終了を開始より先に数える。理由: ある文字が終わる瞬間に次が始まる配置を
 * 重なりとみなさないため（[0,150) と [150,300) は同時数1）。
 */
export function computeMaxConcurrent(startTimesMs: number[], residenceMs: number): number {
  if (startTimesMs.length === 0) {
    return 0;
  }
  // 開始で+1、終了で-1の事象を時刻順に走査する。同時刻は -1（終了）を +1（開始）より先に処理する。
  const events: Array<[number, number]> = [];
  for (const start of startTimesMs) {
    events.push([start, 1]);
    events.push([start + residenceMs, -1]);
  }
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let current = 0;
  let max = 0;
  for (const [, delta] of events) {
    current += delta;
    if (current > max) {
      max = current;
    }
  }
  return max;
}

/**
 * 幅 windowMs のスライド窓に入る開始時刻の最大本数。
 * 各文字の開始時刻を窓の右端とし、その時刻から過去 windowMs 以内（windowMs ちょうど前は含めない）に
 * 開始した文字数の最大を返す。採用理由: 受け入れ基準の「N秒内にM字」を、各開始時刻を右端とする
 * 幅 windowMs の窓で数えるのが定義に一致するため。短時間の出現集中の度合いを表す。
 */
export function maxStartsInWindow(startTimesMs: number[], windowMs: number): number {
  if (startTimesMs.length === 0) {
    return 0;
  }
  const sorted = [...startTimesMs].sort((a, b) => a - b);
  let max = 0;
  let left = 0;
  for (let right = 0; right < sorted.length; right += 1) {
    while (sorted[left] <= sorted[right] - windowMs) {
      left += 1;
    }
    const count = right - left + 1;
    if (count > max) {
      max = count;
    }
  }
  return max;
}

/**
 * 単一文字層の同時上限。最大同時数に余裕の割合を掛けて切り上げる。
 * headroomRatio の採用理由は呼び出し側で述べる（表示残存の調整と窓端の重なりの吸収）。
 */
export function computeSingleLayerLimit(maxConcurrent: number, headroomRatio: number): number {
  return Math.ceil(maxConcurrent * (1 + headroomRatio));
}

/**
 * 一括文字層の同時上限。全文一括表示の最長フレーズ文字数に、同一語句の増殖の枠を加える。
 */
export function computeBatchedLayerLimit(
  maxPhraseChars: number,
  duplicationReserve: number
): number {
  return maxPhraseChars + duplicationReserve;
}
