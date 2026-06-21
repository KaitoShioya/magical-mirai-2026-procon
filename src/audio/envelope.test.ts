import { describe, it, expect } from "vitest";
import { computeNaturalEnvelope, computeStealEnvelope } from "./envelope";
import {
  SYNTH_ATTACK_MS,
  SYNTH_DECAY_MS,
  SYNTH_RELEASE_TAIL_MS,
  SYNTH_STEAL_FADE_MS,
  SYNTH_STEAL_STOP_MARGIN_MS,
  SYNTH_ENVELOPE_EPSILON,
  SYNTH_VOICE_PEAK,
} from "./synthConstants";

// 秒どうしの比較の許容。ミリ秒を1000で割る単位変換の浮動小数点誤差を吸収するため、
// 可聴上は無関係な十分小さい1兆分の1秒を許容にする。
const EPS = 1e-9;

describe("computeNaturalEnvelope", () => {
  it("各時刻点が開始時刻と定数の和で決まる", () => {
    const start = 5;
    const env = computeNaturalEnvelope(start);
    expect(env.startTime).toBe(start);
    expect(Math.abs(env.attackEndTime - (start + SYNTH_ATTACK_MS / 1000))).toBeLessThanOrEqual(EPS);
    expect(
      Math.abs(env.decayEndTime - (start + (SYNTH_ATTACK_MS + SYNTH_DECAY_MS) / 1000))
    ).toBeLessThanOrEqual(EPS);
    expect(
      Math.abs(
        env.stopTime -
          (start + (SYNTH_ATTACK_MS + SYNTH_DECAY_MS + SYNTH_RELEASE_TAIL_MS) / 1000)
      )
    ).toBeLessThanOrEqual(EPS);
  });

  it("時刻が開始→頂点→減衰終点→停止の順で単調に増える", () => {
    const env = computeNaturalEnvelope(0);
    expect(env.attackEndTime).toBeGreaterThan(env.startTime);
    expect(env.decayEndTime).toBeGreaterThan(env.attackEndTime);
    expect(env.stopTime).toBeGreaterThan(env.decayEndTime);
  });

  it("指数減衰の始点（頂点）が正の値で、終点が0より大きい", () => {
    const env = computeNaturalEnvelope(0);
    expect(env.peakGain).toBe(SYNTH_VOICE_PEAK);
    expect(env.peakGain).toBeGreaterThan(0);
    expect(env.endGain).toBe(SYNTH_ENVELOPE_EPSILON);
    expect(env.endGain).toBeGreaterThan(0);
  });
});

describe("computeStealEnvelope", () => {
  it("フェード終点が現在時刻＋消音時間、停止が消音終了＋余裕になる", () => {
    const now = 3;
    const steal = computeStealEnvelope(now);
    expect(Math.abs(steal.fadeEndTime - (now + SYNTH_STEAL_FADE_MS / 1000))).toBeLessThanOrEqual(
      EPS
    );
    expect(
      Math.abs(steal.stopTime - (now + (SYNTH_STEAL_FADE_MS + SYNTH_STEAL_STOP_MARGIN_MS) / 1000))
    ).toBeLessThanOrEqual(EPS);
  });

  it("停止はフェード終点より後にある", () => {
    const steal = computeStealEnvelope(0);
    expect(steal.stopTime).toBeGreaterThan(steal.fadeEndTime);
  });
});
