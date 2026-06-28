import { describe, it, expect } from "vitest";
import { generateReverbImpulse, rootMeanSquare } from "./reverbImpulse";

// 終端区間と冒頭区間の長さの割合。応答特性の前後を比べて減衰を確かめるため、全体の1割ずつを取る。
const SEGMENT_RATIO = 0.1;

/** 標本列の一部区間の二乗平均平方根を求める。 */
function segmentRootMeanSquare(samples: Float32Array, start: number, length: number): number {
  return rootMeanSquare(samples.slice(start, start + length));
}

describe("generateReverbImpulse", () => {
  const sampleRate = 44100;
  const durationSeconds = 0.35;
  const seed = 1337;
  const targetRms = 0.05;

  it("標本数が標本化周波数と長さの積になる", () => {
    const impulse = generateReverbImpulse(sampleRate, durationSeconds, seed, targetRms);
    expect(impulse.length).toBe(Math.round(sampleRate * durationSeconds));
  });

  it("全ての標本が有限値である", () => {
    const impulse = generateReverbImpulse(sampleRate, durationSeconds, seed, targetRms);
    for (let i = 0; i < impulse.length; i += 1) {
      expect(Number.isFinite(impulse[i])).toBe(true);
    }
  });

  it("同じ種では完全に同じ標本列になる（再現性）", () => {
    const a = generateReverbImpulse(sampleRate, durationSeconds, seed, targetRms);
    const b = generateReverbImpulse(sampleRate, durationSeconds, seed, targetRms);
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i += 1) {
      expect(a[i]).toBe(b[i]);
    }
  });

  it("異なる種では異なる標本列になる", () => {
    const a = generateReverbImpulse(sampleRate, durationSeconds, seed, targetRms);
    const b = generateReverbImpulse(sampleRate, durationSeconds, seed + 1, targetRms);
    let anyDifferent = false;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) {
        anyDifferent = true;
        break;
      }
    }
    expect(anyDifferent).toBe(true);
  });

  it("全体の二乗平均平方根が目標値になる（誤差は目標値の1パーセント以内）", () => {
    const impulse = generateReverbImpulse(sampleRate, durationSeconds, seed, targetRms);
    const rms = rootMeanSquare(impulse);
    expect(Math.abs(rms - targetRms)).toBeLessThanOrEqual(targetRms * 0.01);
  });

  it("終端区間のエネルギーが冒頭区間の20分の1未満まで減衰する", () => {
    // 単一の最大振幅ではなく区間のエネルギー（二乗平均平方根）で判定する。理由を先に述べる。
    // 疑似乱数の局所的な山に左右されず、区間全体の減衰を安定して測れるため。
    // 20分の1（0.05）を基準にする理由を先に述べる。終端は冒頭に対し設計上およそ1000分の1まで落ちるため、
    // それより十分緩い20分の1を確実に下回ることで、減衰が起きていることを取りこぼしなく確かめられる。
    const impulse = generateReverbImpulse(sampleRate, durationSeconds, seed, targetRms);
    const segmentLength = Math.floor(impulse.length * SEGMENT_RATIO);
    const headRms = segmentRootMeanSquare(impulse, 0, segmentLength);
    const tailRms = segmentRootMeanSquare(impulse, impulse.length - segmentLength, segmentLength);
    expect(headRms).toBeGreaterThan(0);
    expect(tailRms).toBeLessThan(headRms * 0.05);
  });

  it("長さが0以下でも長さ1以上の標本列を返す（例外を出さない）", () => {
    const impulse = generateReverbImpulse(sampleRate, 0, seed, targetRms);
    expect(impulse.length).toBeGreaterThanOrEqual(1);
    for (let i = 0; i < impulse.length; i += 1) {
      expect(Number.isFinite(impulse[i])).toBe(true);
    }
  });
});
