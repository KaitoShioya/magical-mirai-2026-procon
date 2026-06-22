// 較正補正値の推定（曲非依存の純粋ロジック）。一定周期で表示した点滅の実表示時刻列と、利用者のタップ時刻列から、
// 入力の遅れの補正値（ミリ秒）の初期値を推定する。較正方式の正典は docs/research/04-ux-and-chart-design.md §1
// 「較正の方法」であり、4回のタップによる測定と手動の調整つまみを組み合わせる軽量な方式を採る。本関数は前者の
// 「4回のタップによる測定」を担い、最終値は較正UIの確認段階で利用者が視覚の一致を見ながら微調整する。
//
// 配置の理由を先に述べる。本モジュールは引数だけに依存する数値計算であり、特定のサブシステムに依存しない
// （src/utils/README.md の責務「数値計算」）。判定の補正値の永続化（src/scoring/calibrationStore.ts）や
// 較正UI（src/app/calibration）から再利用できるよう、副作用と設定値の取り込みを持たない純関数にする。
//
// 符号の規約の理由を先に述べる。補正値は正が「入力が一貫して遅れる量」である。判定では
// centeredDiff = tapMusicTimeMs - noteMusicTimeMs - calibrationOffsetMs（src/scoring/timingAccuracy.ts）で
// 補正値を差し引くため、タップが点滅より遅れている量（tap - blink が正）をそのまま補正値にすると、判定窓の
// 中心が遅れ側へ移動して体感に一致する。よって本関数は差分の中央値を符号反転せずに返す。

// 較正補正値の推定結果。補正値と、外れ値を除いた後に採用したタップ数を返す。
export interface CalibrationEstimate {
  // 補正値（ミリ秒）。正＝入力が一貫して遅れる量。
  offsetMs: number;
  // 採用したタップ数（1点滅1タップの集約と外れ値除外の後）。0のとき推定不能で offsetMs は fallbackMs。
  sampleCount: number;
}

// 数値の中央値を返す。偶数個のときは中央2値の平均にする。
// 採用理由を先に述べる。少数のタップでは1から2回が大きく外れることがあり、平均は外れ値1つで大きくぶれるが、
// 中央値は半数が正常なら頑健である。配列は空でない前提（呼び出し側が空を弾く）。
function median(values: readonly number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * 点滅の実表示時刻列とタップ時刻列から補正値の初期値を推定する。両者は同一時刻系（performance.now 原点のミリ秒）。
 * 手順:
 *   1. 各タップを最も近い点滅へ対応付け、差分 (タップ時刻 − 点滅時刻) を求める。最近傍対応にする理由を先に述べる。
 *      利用者が途中の点滅を1回見逃しても、順番に対応付けると以後の対応が全部ずれるが、最近傍なら見逃しに強い。
 *   2. 点滅ごとに、最も近い1タップだけを残す（1点滅1タップの集約）。理由を先に述べる。同じ点滅へ二度押しすると
 *      推定が歪むため、点滅あたりのタップを1つに正規化する。
 *   3. 集約後の差分のうち、絶対値が outlierThresholdMs 以下のものだけを採る。理由を先に述べる。拍に合わせた
 *      タップは人間の揺れの範囲に収まり、最近傍点滅から大きく離れたタップはその点滅を狙っていないとみなせる。
 *   4. 採用が1つ以上あればその中央値を補正値として返す。無ければ採用数0と fallbackMs を返す。
 * 非有限のタップ・点滅は無視する（時計の非数汚染を避けるため）。本関数はクランプを行わない（範囲制限は較正UIの
 * つまみ範囲と永続化の保存時クランプが担う）。
 */
export function estimateCalibrationOffsetMs(
  blinkTimesMs: readonly number[],
  tapTimesMs: readonly number[],
  options: { outlierThresholdMs: number; fallbackMs: number }
): CalibrationEstimate {
  const blinks = blinkTimesMs.filter((value) => Number.isFinite(value));
  const taps = tapTimesMs.filter((value) => Number.isFinite(value));
  if (blinks.length === 0 || taps.length === 0) {
    return { offsetMs: options.fallbackMs, sampleCount: 0 };
  }

  // 点滅ごとに、これまで見た中で最も近いタップの差分を保持する。
  const nearestDiffByBlink = new Map<number, number>();
  for (const tap of taps) {
    let nearestBlinkIndex = 0;
    let nearestDistance = Math.abs(tap - blinks[0]);
    for (let i = 1; i < blinks.length; i += 1) {
      const distance = Math.abs(tap - blinks[i]);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestBlinkIndex = i;
      }
    }
    const diff = tap - blinks[nearestBlinkIndex];
    const existing = nearestDiffByBlink.get(nearestBlinkIndex);
    if (existing === undefined || Math.abs(diff) < Math.abs(existing)) {
      nearestDiffByBlink.set(nearestBlinkIndex, diff);
    }
  }

  const accepted: number[] = [];
  for (const diff of nearestDiffByBlink.values()) {
    if (Math.abs(diff) <= options.outlierThresholdMs) {
      accepted.push(diff);
    }
  }

  if (accepted.length === 0) {
    return { offsetMs: options.fallbackMs, sampleCount: 0 };
  }
  return { offsetMs: median(accepted), sampleCount: accepted.length };
}
