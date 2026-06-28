// 残響（余韻）の応答特性（インパルス応答）の標本列を、コードで手続き的に生成する純関数。
// AudioContext には依存しない（標本列の計算のみ）。AudioBuffer への積み込みと配線は voiceGraph.ts が担う。
// 規約により人工知能生成音源や権利のある録音を組み込めないため、減衰する擬似雑音をコードで作って応答特性とする。
// すべて標本（サンプル）単位で扱い、時刻は標本番号を標本化周波数で割って秒へ直す。

// 決定的な疑似乱数を返す関数を作る。同じ種からは常に同じ数列が出るため、実機でも単体テストでも同じ応答特性を再現できる。
// 戻り値は0以上1未満の数を返す関数。広く用いられる mulberry32 という小さな疑似乱数の式を使う。
function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 標本列の二乗平均平方根（全体の大きさの指標）を求める。空配列は0を返す。 */
export function rootMeanSquare(samples: Float32Array): number {
  if (samples.length === 0) {
    return 0;
  }
  let sumOfSquares = 0;
  for (let i = 0; i < samples.length; i += 1) {
    sumOfSquares += samples[i] * samples[i];
  }
  return Math.sqrt(sumOfSquares / samples.length);
}

/**
 * 残響の応答特性の標本列を作る。
 * 中身は、決定的な疑似乱数で作った雑音に、指数関数で減衰する包絡を掛けたものである。
 * 減衰の時定数は、終端で冒頭に対し十分小さく（音の大きさで約60デシベル下、振幅で約1000分の1）になるよう定める。
 * 採用理由を先に述べる。60デシベル下は残響の尾が聞こえなくなる慣用の水準であり、終端でこの水準まで落ちると
 * 余韻が自然に消える。指数の式 exp(−経過秒÷時定数) が終端（経過秒＝残響の長さ）で1000分の1になる条件から、
 * 時定数＝残響の長さ÷自然対数1000 とする（自然対数1000は約6.908）。
 * 最後に、標本列全体の二乗平均平方根が目標値になるよう一律に拡大・縮小する。
 * 採用理由を先に述べる。残響ノードの正規化を切る（voiceGraph.ts で normalize=false）ため、残響の音量を
 * 応答特性の大きさで明示的に決められるよう、二乗平均平方根を目標値にそろえる。
 *
 * @param sampleRate 標本化周波数（ヘルツ）。1秒あたりの標本数。
 * @param durationSeconds 残響の長さ（秒）。
 * @param seed 疑似乱数の種（整数）。同じ種で同じ応答特性を再現する。
 * @param targetRootMeanSquare 標本列全体の二乗平均平方根の目標値（0以上）。
 */
export function generateReverbImpulse(
  sampleRate: number,
  durationSeconds: number,
  seed: number,
  targetRootMeanSquare: number
): Float32Array {
  const length = Math.max(1, Math.round(sampleRate * durationSeconds));
  const samples = new Float32Array(length);
  // 終端で振幅が冒頭の1000分の1になる時定数。durationSeconds が0以下なら減衰させず（時定数を正の無限大相当に）扱う。
  const decayTimeConstant = durationSeconds > 0 ? durationSeconds / Math.log(1000) : Number.POSITIVE_INFINITY;
  const nextRandom = createSeededRandom(seed);
  for (let i = 0; i < length; i += 1) {
    const elapsedSeconds = i / sampleRate;
    // 雑音は−1以上1未満の一様乱数。減衰包絡は指数関数。
    const noise = nextRandom() * 2 - 1;
    const envelope = Math.exp(-elapsedSeconds / decayTimeConstant);
    samples[i] = noise * envelope;
  }
  // 二乗平均平方根を目標値へそろえる。元の二乗平均平方根が0（全て0）なら拡大できないためそのまま返す。
  const currentRootMeanSquare = rootMeanSquare(samples);
  if (currentRootMeanSquare > 0 && targetRootMeanSquare >= 0) {
    const scale = targetRootMeanSquare / currentRootMeanSquare;
    for (let i = 0; i < length; i += 1) {
      samples[i] *= scale;
    }
  }
  return samples;
}
