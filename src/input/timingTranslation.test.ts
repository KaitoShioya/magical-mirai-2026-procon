import { describe, expect, it } from "vitest";
import {
  noteDistanceWindows,
  timeWindowToDistance,
  trajectoryDistanceFromNote,
  type JudgeWindowsMs,
  type TrajectoryTimingSource,
} from "./timingTranslation";
import { createCameraTrajectory, type CameraTrajectoryKeyframe } from "../utils/cameraTrajectory";

// ノーツ時刻のズレの許容（ミリ秒）。採用理由を先に述べる。Issue #49 の受け入れ基準は時刻ズレを
// 「±1フレーム（≦16.7ミリ秒）」と定める。本作の性能目標は毎秒60フレームであり、1フレームは
// 1000ミリ秒 ÷ 60 = 16.67ミリ秒である。1フレーム未満のズレは画面更新1回より細かく知覚されない。
// なお #13 のテストは受け入れ基準の文面が「±16ミリ秒」だったため16ミリ秒を用いた。#49 は文面が
// 「≦16.7ミリ秒」のためこの値を用いる。差0.7ミリ秒は 1000 ÷ 60 = 16.67 の端数である。
const MAX_NOTE_TIME_DEVIATION_MS = 16.7;

// 線形化が成立する区間の相対速さ変化の上限。採用理由を先に述べる。点速度 s0 による近似
// speedAt(noteTimeMs) × Δt の時刻ズレはおよそ ε × Δt ÷ 2 であり、ε は窓 Δt の間の相対速さ変化である。
// 最大の時間窓 Δt ＝ 90ミリ秒で時刻ズレを16.7ミリ秒以内に抑える条件は ε × 90 ÷ 2 ≦ 16.7、
// すなわち ε ≦ 0.371（約37パーセント）である。テスト軌跡が線形化の前提を満たすことを補助検査で確かめる。
const RELATIVE_SPEED_CHANGE_LIMIT = 0.371;

// 判定窓の代表値（src/config/tuning.ts の JUDGE_PERFECT_WINDOW_MS ほかと同じ値）。
const JUDGE_WINDOWS_MS: JudgeWindowsMs = { perfectMs: 40, decayOuterMs: 90, pointMs: 60 };

/** 合成スタブを作る。範囲外の時刻は端点へクランプして実評価器の挙動に揃える。 */
function makeStub(options: {
  startTimeMs?: number;
  endTimeMs?: number;
  speedAt?: (timeMs: number) => number;
  distanceAt?: (timeMs: number) => number;
}): TrajectoryTimingSource {
  const startTimeMs = options.startTimeMs ?? 0;
  const endTimeMs = options.endTimeMs ?? 1000;
  const clamp = (timeMs: number) => Math.min(Math.max(timeMs, startTimeMs), endTimeMs);
  return {
    startTimeMs,
    endTimeMs,
    speedAt: options.speedAt ?? (() => 1),
    distanceAt: options.distanceAt ?? ((timeMs) => clamp(timeMs)),
  };
}

describe("timeWindowToDistance（合成スタブ・厳密な算術）", () => {
  it("距離窓は速さと時間窓の積に厳密一致する", () => {
    const stub = makeStub({ speedAt: () => 0.003 });
    expect(timeWindowToDistance(stub, 500, 40)).toBeCloseTo(0.12, 12);
    expect(timeWindowToDistance(stub, 500, 90)).toBeCloseTo(0.27, 12);
  });

  it("速さ4倍の地点では同一時間窓が4倍の距離になる（比例性）", () => {
    const stub = makeStub({ speedAt: (timeMs) => (timeMs < 500 ? 1 : 4) });
    const slow = timeWindowToDistance(stub, 100, 40);
    const fast = timeWindowToDistance(stub, 600, 40);
    expect(slow).toBe(40);
    expect(fast).toBe(160);
    expect(fast / slow).toBe(4);
  });

  it("時間窓が0なら距離窓は0", () => {
    expect(timeWindowToDistance(makeStub({ speedAt: () => 0.005 }), 500, 0)).toBe(0);
  });

  it("速さが0なら距離窓は0", () => {
    expect(timeWindowToDistance(makeStub({ speedAt: () => 0 }), 500, 40)).toBe(0);
  });

  it("非有限のノーツ時刻で例外", () => {
    const stub = makeStub({});
    expect(() => timeWindowToDistance(stub, Number.NaN, 40)).toThrow();
    expect(() => timeWindowToDistance(stub, Number.POSITIVE_INFINITY, 40)).toThrow();
  });

  it("ノーツ時刻が軌跡の時刻範囲外で例外", () => {
    const stub = makeStub({ startTimeMs: 0, endTimeMs: 1000 });
    expect(() => timeWindowToDistance(stub, -1, 40)).toThrow();
    expect(() => timeWindowToDistance(stub, 1001, 40)).toThrow();
  });

  it("非有限または負の時間窓で例外", () => {
    const stub = makeStub({});
    expect(() => timeWindowToDistance(stub, 500, Number.NaN)).toThrow();
    expect(() => timeWindowToDistance(stub, 500, -1)).toThrow();
  });

  it("速さが負を返す軌跡で例外", () => {
    const stub = makeStub({ speedAt: () => -1 });
    expect(() => timeWindowToDistance(stub, 500, 40)).toThrow();
  });

  it("速さが非有限を返す軌跡で例外", () => {
    expect(() => timeWindowToDistance(makeStub({ speedAt: () => Number.NaN }), 500, 40)).toThrow();
    expect(() =>
      timeWindowToDistance(makeStub({ speedAt: () => Number.POSITIVE_INFINITY }), 500, 40),
    ).toThrow();
  });

  it("距離窓がオーバーフローして非有限になる場合に例外（戻り値検査）", () => {
    // 速さも時間窓も有限だが、両者が大きいと積が表現範囲を超えて非有限になる。
    const stub = makeStub({ speedAt: () => Number.MAX_VALUE });
    expect(() => timeWindowToDistance(stub, 500, Number.MAX_VALUE)).toThrow();
  });

  it("軌跡の時刻範囲が非有限、または開始が終了以上で例外", () => {
    expect(() => timeWindowToDistance(makeStub({ startTimeMs: Number.NaN }), 500, 40)).toThrow();
    expect(() => timeWindowToDistance(makeStub({ endTimeMs: Number.POSITIVE_INFINITY }), 500, 40)).toThrow();
    expect(() => timeWindowToDistance(makeStub({ startTimeMs: 1000, endTimeMs: 1000 }), 500, 40)).toThrow();
    expect(() => timeWindowToDistance(makeStub({ startTimeMs: 1000, endTimeMs: 0 }), 500, 40)).toThrow();
  });
});

describe("noteDistanceWindows（合成スタブ・厳密な算術）", () => {
  it("3値が各窓への timeWindowToDistance の適用値に一致する", () => {
    const stub = makeStub({ speedAt: () => 0.01 });
    const windows = noteDistanceWindows(stub, 500, JUDGE_WINDOWS_MS);
    expect(windows.perfectDistance).toBeCloseTo(0.4, 12);
    expect(windows.decayOuterDistance).toBeCloseTo(0.9, 12);
    expect(windows.pointDistance).toBeCloseTo(0.6, 12);
  });

  it("窓の順序を保存する（満点 ≦ 点推定 ≦ 減衰外端）", () => {
    const stub = makeStub({ speedAt: () => 0.01 });
    const windows = noteDistanceWindows(stub, 500, JUDGE_WINDOWS_MS);
    expect(windows.perfectDistance).toBeLessThanOrEqual(windows.pointDistance);
    expect(windows.pointDistance).toBeLessThanOrEqual(windows.decayOuterDistance);
  });

  it("いずれかの窓が負または非有限で例外（3窓とも対象）", () => {
    const stub = makeStub({ speedAt: () => 0.01 });
    expect(() => noteDistanceWindows(stub, 500, { perfectMs: -1, decayOuterMs: 90, pointMs: 60 })).toThrow();
    expect(() =>
      noteDistanceWindows(stub, 500, { perfectMs: 40, decayOuterMs: Number.NaN, pointMs: 60 }),
    ).toThrow();
    expect(() => noteDistanceWindows(stub, 500, { perfectMs: 40, decayOuterMs: 90, pointMs: -1 })).toThrow();
    expect(() =>
      noteDistanceWindows(stub, 500, { perfectMs: 40, decayOuterMs: 90, pointMs: Number.POSITIVE_INFINITY }),
    ).toThrow();
  });
});

describe("trajectoryDistanceFromNote（合成スタブ・厳密な算術）", () => {
  it("入力がノーツより後で正、前で負になる", () => {
    const stub = makeStub({ distanceAt: (timeMs) => Math.min(Math.max(timeMs, 0), 1000) });
    expect(trajectoryDistanceFromNote(stub, 200, 260)).toBe(60);
    expect(trajectoryDistanceFromNote(stub, 200, 140)).toBe(-60);
    expect(trajectoryDistanceFromNote(stub, 200, 200)).toBe(0);
  });

  it("微小な時間差では速さと時間差の積に一致する", () => {
    // 距離 = 3 × 時刻 の軌跡（速さ3が一定）。距離差は 3 × 時間差になる。
    const stub = makeStub({ distanceAt: (timeMs) => 3 * Math.min(Math.max(timeMs, 0), 1000) });
    expect(trajectoryDistanceFromNote(stub, 500, 510)).toBeCloseTo(30, 12);
    expect(trajectoryDistanceFromNote(stub, 500, 490)).toBeCloseTo(-30, 12);
  });

  it("入力時刻が範囲外でも例外を投げず、端点クランプの有限値を返す", () => {
    const stub = makeStub({ startTimeMs: 0, endTimeMs: 1000, distanceAt: (timeMs) => Math.min(Math.max(timeMs, 0), 1000) });
    const before = trajectoryDistanceFromNote(stub, 500, -1000);
    const after = trajectoryDistanceFromNote(stub, 500, 999999);
    expect(Number.isFinite(before)).toBe(true);
    expect(Number.isFinite(after)).toBe(true);
    expect(before).toBe(0 - 500);
    expect(after).toBe(1000 - 500);
  });

  it("非有限のノーツ時刻・入力時刻で例外（NaNと無限大の両方）", () => {
    const stub = makeStub({});
    expect(() => trajectoryDistanceFromNote(stub, Number.NaN, 500)).toThrow();
    expect(() => trajectoryDistanceFromNote(stub, 500, Number.NaN)).toThrow();
    expect(() => trajectoryDistanceFromNote(stub, Number.POSITIVE_INFINITY, 500)).toThrow();
    expect(() => trajectoryDistanceFromNote(stub, 500, Number.POSITIVE_INFINITY)).toThrow();
  });

  it("距離差がオーバーフローして非有限になる場合に例外（最終戻り値検査）", () => {
    // ノーツ側と入力側の距離は各々有限だが、両端の極端値の差が表現範囲を超えて非有限になる。
    const stub = makeStub({
      distanceAt: (timeMs) => (timeMs <= 500 ? -Number.MAX_VALUE : Number.MAX_VALUE),
    });
    expect(() => trajectoryDistanceFromNote(stub, 500, 600)).toThrow();
  });

  it("ノーツ時刻が軌跡の時刻範囲外で例外", () => {
    const stub = makeStub({ startTimeMs: 0, endTimeMs: 1000 });
    expect(() => trajectoryDistanceFromNote(stub, -1, 500)).toThrow();
    expect(() => trajectoryDistanceFromNote(stub, 1001, 500)).toThrow();
  });

  it("ノーツ側と入力側の距離が非有限のとき、それぞれ別の文言で例外", () => {
    const noteBroken = makeStub({ distanceAt: (timeMs) => (timeMs === 200 ? Number.NaN : timeMs) });
    expect(() => trajectoryDistanceFromNote(noteBroken, 200, 500)).toThrow(/ノーツ時刻/);
    const inputBroken = makeStub({ distanceAt: (timeMs) => (timeMs === 500 ? Number.NaN : timeMs) });
    expect(() => trajectoryDistanceFromNote(inputBroken, 200, 500)).toThrow(/入力時刻/);
  });
});

// 実評価器による検証。速い区間と遅い区間を持ち、各区間は秒の単位で構成して90ミリ秒の窓の中で
// 速さがほぼ一定に保たれる軌跡を使う。位置はx軸上を動かし、区間内は等間隔の制御点で速さを一定にする。
// 遅い区間（0から6000ミリ秒）は2000ミリ秒あたり2単位（速さ0.001単位毎ミリ秒）、
// 速い区間（8000から14000ミリ秒）は2000ミリ秒あたり20単位（速さ0.01単位毎ミリ秒）で、速さの比は約10倍である。
const fastSlowKeyframes: CameraTrajectoryKeyframe[] = [
  { timeMs: 0, position: { x: 0, y: 2, z: 0 }, target: { x: 0, y: 2, z: -10 } },
  { timeMs: 2000, position: { x: 2, y: 2, z: 0 }, target: { x: 2, y: 2, z: -10 } },
  { timeMs: 4000, position: { x: 4, y: 2, z: 0 }, target: { x: 4, y: 2, z: -10 } },
  { timeMs: 6000, position: { x: 6, y: 2, z: 0 }, target: { x: 6, y: 2, z: -10 } },
  { timeMs: 8000, position: { x: 26, y: 2, z: 0 }, target: { x: 26, y: 2, z: -10 } },
  { timeMs: 10000, position: { x: 46, y: 2, z: 0 }, target: { x: 46, y: 2, z: -10 } },
  { timeMs: 12000, position: { x: 66, y: 2, z: 0 }, target: { x: 66, y: 2, z: -10 } },
  { timeMs: 14000, position: { x: 86, y: 2, z: 0 }, target: { x: 86, y: 2, z: -10 } },
];

// 遅い区間の内側のノーツ（前後90ミリ秒の余白が区間内に収まる）。
const SLOW_NOTE_TIME_MS = 3000;
// 速い区間の内側のノーツ。
const FAST_NOTE_TIME_MS = 11000;

describe("実評価器による比例性と線形化精度", () => {
  const trajectory = createCameraTrajectory(fastSlowKeyframes);

  it("速い区間と遅い区間の距離窓の比が、その2地点の速さの比に一致する", () => {
    const window = JUDGE_WINDOWS_MS.decayOuterMs;
    const slowDistance = timeWindowToDistance(trajectory, SLOW_NOTE_TIME_MS, window);
    const fastDistance = timeWindowToDistance(trajectory, FAST_NOTE_TIME_MS, window);
    const speedRatio = trajectory.speedAt(FAST_NOTE_TIME_MS) / trajectory.speedAt(SLOW_NOTE_TIME_MS);
    expect(fastDistance / slowDistance).toBeCloseTo(speedRatio, 9);
    // 速さの比は4倍以上のストレス条件である。
    expect(speedRatio).toBeGreaterThanOrEqual(4);
  });

  for (const noteTimeMs of [SLOW_NOTE_TIME_MS, FAST_NOTE_TIME_MS]) {
    it(`ノーツ時刻 ${noteTimeMs} で前後90ミリ秒の相対速さ変化が37パーセント以内（線形化の前提）`, () => {
      const center = trajectory.speedAt(noteTimeMs);
      const before = trajectory.speedAt(noteTimeMs - 90);
      const after = trajectory.speedAt(noteTimeMs + 90);
      const relativeChange = Math.max(Math.abs(after - center), Math.abs(before - center)) / center;
      expect(relativeChange).toBeLessThanOrEqual(RELATIVE_SPEED_CHANGE_LIMIT);
    });

    it(`ノーツ時刻 ${noteTimeMs} で各時間窓の時刻ズレが前後両方向とも16.7ミリ秒以内`, () => {
      const baseDistance = trajectory.distanceAt(noteTimeMs);
      for (const windowMs of [JUDGE_WINDOWS_MS.perfectMs, JUDGE_WINDOWS_MS.decayOuterMs, JUDGE_WINDOWS_MS.pointMs]) {
        const distanceWindow = timeWindowToDistance(trajectory, noteTimeMs, windowMs);
        const forwardTime = trajectory.timeAtDistance(baseDistance + distanceWindow) - noteTimeMs;
        const backwardTime = trajectory.timeAtDistance(baseDistance - distanceWindow) - noteTimeMs;
        expect(Math.abs(forwardTime - windowMs)).toBeLessThanOrEqual(MAX_NOTE_TIME_DEVIATION_MS);
        expect(Math.abs(backwardTime - -windowMs)).toBeLessThanOrEqual(MAX_NOTE_TIME_DEVIATION_MS);
      }
    });
  }
});
