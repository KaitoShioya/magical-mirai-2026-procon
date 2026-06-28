// 最終段の柔らかい飽和制限（ソフトクリップ）の特性曲線を作る純関数。AudioContext には依存しない。
// 目的を先に述べる。出力がデジタルの最大値1.0に達して歪む（クリップする）ことを、どの端末でも構造的に防ぐ。
// 膝の高さ（knee）より小さい絶対値の入力はそのまま通して音量・音色を変えず、それより大きい入力だけを滑らかに
// 1.0未満へ抑える。WaveShaperNode の特性曲線は入力[-1,1]を配列の添字[0,要素数-1]へ線形に対応づけ、[-1,1]の外の
// 入力は両端の値に張り付くため、両端を1.0未満にすることで、1.0を超える入力でも出力は1.0未満に収まる。

/**
 * 1つの入力値に対するソフトクリップの出力値を返す。
 * 膝より小さい絶対値はそのまま返し（恒等）、大きい絶対値は双曲線正接で天井（ceiling）へ漸近させる。
 * 出力の絶対値の上限を先に述べる。双曲線正接 tanh は値域が(-1,1)で1に達しないが、入力が大きいと浮動小数では1.0に
 * 丸まり得る。そこで漸近先を1.0でなく天井（1.0未満）にし、出力の絶対値が knee + (ceiling-knee)×1 = ceiling を
 * 超えないようにして、どの入力でも出力を天井（1.0未満）以下に保つ。
 * @param knee これより小さい絶対値の入力はそのまま通す境目（0より大きく ceiling より小さい）。
 * @param ceiling 出力の絶対値の上限（0より大きく1未満）。大きい入力はこの値へ漸近する。
 */
export function softClipValue(x: number, knee: number, ceiling: number): number {
  const magnitude = Math.abs(x);
  if (magnitude <= knee) {
    return x;
  }
  const sign = x < 0 ? -1 : 1;
  // 膝から先の超過分を、膝から1.0までの幅で正規化し、双曲線正接で滑らかに天井へ寄せる。
  const over = (magnitude - knee) / (1 - knee);
  return sign * (knee + (ceiling - knee) * Math.tanh(over));
}

/**
 * ソフトクリップの特性曲線（WaveShaperNode に与える配列）を作る。
 * 配列の各要素は、入力[-1,1]を等間隔に並べた点での出力値である。
 * @param sampleCount 曲線の要素数（2以上）。多いほど曲線が滑らかになる。
 * @param knee これより小さい絶対値の入力はそのまま通す境目（0より大きく ceiling より小さい）。
 * @param ceiling 出力の絶対値の上限（0より大きく1未満）。
 */
export function generateSoftClipCurve(
  sampleCount: number,
  knee: number,
  ceiling: number
): Float32Array<ArrayBuffer> {
  const count = Math.max(2, Math.floor(sampleCount));
  const curve = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    // 添字 i を入力[-1,1]へ写す。両端 i=0 が −1、i=count−1 が +1 になる。
    const x = (i / (count - 1)) * 2 - 1;
    curve[i] = softClipValue(x, knee, ceiling);
  }
  return curve;
}
