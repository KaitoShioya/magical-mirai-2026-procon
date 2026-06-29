import { describe, it, expect } from "vitest";
import {
  chromaBurstOnBeats,
  glitchOnTransitions,
  invertOnBoundaries,
  drivePostprocessMotionSets,
  type PostprocessTarget,
} from "./postprocessMotionSet";

/** 設定関数の呼び出しを記録する擬似描画層。 */
function makeTarget(): PostprocessTarget & {
  readonly calls: { chroma: number[]; glitch: number[]; glitchTime: number[]; invert: number[] };
} {
  const calls = { chroma: [] as number[], glitch: [] as number[], glitchTime: [] as number[], invert: [] as number[] };
  return {
    calls,
    setChromaBurstIntensity(v) {
      calls.chroma.push(v);
    },
    setGlitchIntensity(v) {
      calls.glitch.push(v);
    },
    setGlitchTimeSec(v) {
      calls.glitchTime.push(v);
    },
    setInvertIntensity(v) {
      calls.invert.push(v);
    },
  };
}

describe("chromaBurstOnBeats", () => {
  it("強拍ちょうどで上限係数、持続後に0へ減衰する", () => {
    const set = chromaBurstOnBeats({ pulseTimesMs: [1000], durationMs: 200, gain: 0.8 });
    const t1 = makeTarget();
    set.drive(1000, t1);
    expect(t1.calls.chroma[0]).toBeCloseTo(0.8, 6);
    const t2 = makeTarget();
    set.drive(1100, t2); // 半分経過 → 直線で0.4 * gain
    expect(t2.calls.chroma[0]).toBeCloseTo(0.4, 6);
    const t3 = makeTarget();
    set.drive(1300, t3); // 持続超過 → 0
    expect(t3.calls.chroma[0]).toBe(0);
  });

  it("契機前は0", () => {
    const set = chromaBurstOnBeats({ pulseTimesMs: [1000], durationMs: 200 });
    const t = makeTarget();
    set.drive(500, t);
    expect(t.calls.chroma[0]).toBe(0);
  });
});

describe("glitchOnTransitions", () => {
  it("シェーダ時刻を量子化した秒で渡し、同じ刻みの区間で同じ値になる", () => {
    const set = glitchOnTransitions({ pulseTimesMs: [0], durationMs: 1000, timeQuantStepMs: 100 });
    const a = makeTarget();
    set.drive(1234, a); // 100刻みの四捨五入で1200ms → 1.2秒
    const b = makeTarget();
    set.drive(1249, b); // 同じ刻みへ丸まる（四捨五入で1200ms） → 同じ1.2秒
    expect(a.calls.glitchTime[0]).toBeCloseTo(1.2, 6);
    expect(b.calls.glitchTime[0]).toBeCloseTo(1.2, 6);
  });

  it("量子化刻みが0以下のときは再生位置をそのまま秒へ", () => {
    const set = glitchOnTransitions({ pulseTimesMs: [0], durationMs: 1000, timeQuantStepMs: 0 });
    const t = makeTarget();
    set.drive(1234, t);
    expect(t.calls.glitchTime[0]).toBeCloseTo(1.234, 6);
  });

  it("場面転換の包絡で強度が立ち上がり減衰する", () => {
    const set = glitchOnTransitions({ pulseTimesMs: [2000], durationMs: 400 });
    const t = makeTarget();
    set.drive(2000, t);
    expect(t.calls.glitch[0]).toBeCloseTo(1, 6);
    const t2 = makeTarget();
    set.drive(2400, t2);
    expect(t2.calls.glitch[0]).toBe(0);
  });
});

describe("invertOnBoundaries", () => {
  it("曲の切れ目で反転度合いが立ち上がる", () => {
    const set = invertOnBoundaries({ pulseTimesMs: [5000], durationMs: 120, shape: "exp" });
    const t = makeTarget();
    set.drive(5000, t);
    expect(t.calls.invert[0]).toBeCloseTo(1, 6);
    const t2 = makeTarget();
    set.drive(5200, t2);
    expect(t2.calls.invert[0]).toBe(0);
  });
});

describe("drivePostprocessMotionSets", () => {
  it("複数セットを1フレームでまとめて駆動する", () => {
    const sets = [
      chromaBurstOnBeats({ pulseTimesMs: [0], durationMs: 100 }),
      invertOnBoundaries({ pulseTimesMs: [0], durationMs: 100 }),
    ];
    const t = makeTarget();
    drivePostprocessMotionSets(sets, 0, t);
    expect(t.calls.chroma.length).toBe(1);
    expect(t.calls.invert.length).toBe(1);
    expect(t.calls.chroma[0]).toBeCloseTo(1, 6);
    expect(t.calls.invert[0]).toBeCloseTo(1, 6);
  });
});
