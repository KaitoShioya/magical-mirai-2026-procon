// 決定的な疑似乱数。AudioContext には依存しない（数値の計算のみ）。
// 同じ種からは常に同じ数列が出るため、実機でも単体テストでも同じ結果を再現できる。
// 残響の応答特性（reverbImpulse.ts）と打楽器の雑音（percussion.ts）の双方が、再現可能な雑音を作るために共有して使う。

/**
 * 種から決定的な疑似乱数を返す関数を作る。
 * 戻り値は0以上1未満の数を返す関数。広く用いられる mulberry32 という小さな疑似乱数の式を使う。
 */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 種から、−1以上1未満の決定的な疑似雑音の標本列を作る。
 * 打楽器（スネア・シェイカーなど）の雑音成分の素材として使う。同じ種で同じ標本列を再現できる。
 * @param length 標本数（0以上の整数。0以下は長さ0の配列を返す）。
 * @param seed 疑似乱数の種（整数）。
 */
export function generateWhiteNoise(length: number, seed: number): Float32Array {
  const count = Math.max(0, Math.floor(length));
  const samples = new Float32Array(count);
  const nextRandom = createSeededRandom(seed);
  for (let i = 0; i < count; i += 1) {
    samples[i] = nextRandom() * 2 - 1;
  }
  return samples;
}
