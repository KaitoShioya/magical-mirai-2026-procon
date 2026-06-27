import { describe, it, expect } from "vitest";
import type { LaneNote } from "../types/judgmentLane";
import {
  sortLaneNotesByTime,
  laneProgress,
  laneNoteY,
  isLaneProgressVisible,
  laneFallSpeedPerMs,
  visibleNoteRange,
  maxConcurrentInWindow,
  lanePoolCapacity,
  reachedNoteRange,
  notePhaseRadians,
  sparkDirectionRadians,
} from "./fallingLaneLayout";

// 検査用の固定値。レーンの実定数とは独立に、純粋関数の振る舞いだけを確かめる。
const LEAD_MS = 2000;
const POST_MS = 120;
const WINDOW = { leadMs: LEAD_MS, postTargetMs: POST_MS };
// 2次元層の縦座標。上端 topY、目標線 targetY（上端より下なので小さい値）。
const GEOMETRY = { topY: 0.5, targetY: -0.7 };

function note(id: string, timeMs: number, slotIndex = 1): LaneNote {
  return { id, timeMs, slotIndex };
}

describe("sortLaneNotesByTime（timeMs昇順への複製並べ替え）", () => {
  it("昇順の複製を返し、入力配列を破壊しない", () => {
    const input = [note("c", 300), note("a", 100), note("b", 200)];
    const sorted = sortLaneNotesByTime(input);
    expect(sorted.map((n) => n.id)).toEqual(["a", "b", "c"]);
    // 入力は元の順序のまま（非破壊）。
    expect(input.map((n) => n.id)).toEqual(["c", "a", "b"]);
    // 返り値は新しい配列。
    expect(sorted).not.toBe(input);
  });
});

describe("laneProgress と laneNoteY（落下位置）", () => {
  it("gameTimeMs == noteTimeMs のとき進度0で縦位置が目標線に一致する", () => {
    const p = laneProgress(1000, 1000, LEAD_MS);
    expect(p).toBe(0);
    expect(Math.abs(laneNoteY(p, GEOMETRY) - GEOMETRY.targetY)).toBeLessThan(1e-9);
  });

  it("出現直後（進度1）で縦位置が上端に一致する", () => {
    // noteTimeMs - gameTimeMs == LEAD_MS で進度1。
    const p = laneProgress(1000 + LEAD_MS, 1000, LEAD_MS);
    expect(p).toBe(1);
    expect(Math.abs(laneNoteY(p, GEOMETRY) - GEOMETRY.topY)).toBeLessThan(1e-9);
  });

  it("落下速度が時刻に依らず一定である（線形写像のため丸め誤差のみ許容）", () => {
    const noteTimeMs = 5000;
    // 相異なる2時刻での縦位置の差から速度（1ミリ秒あたり移動量）を求める。
    const t1 = 1000;
    const t2 = 1600;
    const t3 = 3300;
    const t4 = 3700;
    const y = (gameTimeMs: number) => laneNoteY(laneProgress(noteTimeMs, gameTimeMs, LEAD_MS), GEOMETRY);
    const speedA = (y(t2) - y(t1)) / (t2 - t1);
    const speedB = (y(t4) - y(t3)) / (t4 - t3);
    expect(Math.abs(speedA - speedB)).toBeLessThan(1e-9);
    // laneFallSpeedPerMs が同じ一定速度を返す。
    expect(Math.abs(laneFallSpeedPerMs(GEOMETRY, LEAD_MS) - speedA)).toBeLessThan(1e-9);
    // ゲーム時刻が進む（増える）と縦位置は下がる（速度は負）。
    expect(laneFallSpeedPerMs(GEOMETRY, LEAD_MS)).toBeLessThan(0);
  });
});

describe("isLaneProgressVisible（到達直後の表示猶予）", () => {
  const lowerBound = -POST_MS / LEAD_MS;
  it("進度が0〜1の範囲で可視である", () => {
    expect(isLaneProgressVisible(1, WINDOW)).toBe(true);
    expect(isLaneProgressVisible(0.5, WINDOW)).toBe(true);
    expect(isLaneProgressVisible(0, WINDOW)).toBe(true);
  });
  it("到達直後の表示猶予の内側（進度が負で下限以上）で可視、下限を越えると不可視", () => {
    expect(isLaneProgressVisible(lowerBound, WINDOW)).toBe(true);
    expect(isLaneProgressVisible(lowerBound / 2, WINDOW)).toBe(true);
    expect(isLaneProgressVisible(lowerBound - 1e-6, WINDOW)).toBe(false);
  });
  it("出現前（進度が1を越える）で不可視", () => {
    expect(isLaneProgressVisible(1 + 1e-6, WINDOW)).toBe(false);
  });
});

describe("visibleNoteRange（可視ノーツの添字区間。閉区間）", () => {
  // timeMs 昇順の固定列。
  const notes = [
    note("n0", 0),
    note("n1", 1000),
    note("n2", 2000),
    note("n3", 3000),
    note("n4", 5000),
  ];

  it("時間窓 [gameTimeMs - postTargetMs, gameTimeMs + leadMs] に入る添字区間を返す（end は排他）", () => {
    // gameTimeMs=1500。窓 = [1380, 3500]。入るのは n2(2000), n3(3000)。n1(1000)は下端1380未満で除外。
    const range = visibleNoteRange(notes, 1500, WINDOW);
    expect(range).toEqual({ start: 2, end: 4 });
  });

  it("窓の下端・上端にちょうど一致する timeMs のノーツを含む（閉区間）", () => {
    // gameTimeMs=2000。窓 = [1880, 4000]。上端4000ちょうどに一致するノーツは無いが、
    // 下端・上端ちょうどの境界を直接確かめるため専用の列で検査する。
    const edge = [note("a", 1880), note("b", 3000), note("c", 4000)];
    // 窓 = [2000-120, 2000+2000] = [1880, 4000]。下端1880と上端4000の両方を含む。
    const range = visibleNoteRange(edge, 2000, WINDOW);
    expect(range).toEqual({ start: 0, end: 3 });
  });

  it("ゲーム時刻が有限でないときは空区間を返す（防御）", () => {
    expect(visibleNoteRange(notes, Number.NaN, WINDOW)).toEqual({ start: 0, end: 0 });
  });
});


describe("目標線通過後の表示時間が0の構成（円板が中心一致で消える）", () => {
  // 生産の落下式レーンは目標線通過後の表示時間を0にする（円板の中心が目標線に一致した時点で消える）。
  const WINDOW0 = { leadMs: LEAD_MS, postTargetMs: 0 };
  it("進度0（中心が目標線）で可視、進度が負（中心が線の下）で不可視", () => {
    expect(isLaneProgressVisible(1, WINDOW0)).toBe(true);
    expect(isLaneProgressVisible(0, WINDOW0)).toBe(true);
    expect(isLaneProgressVisible(-1e-9, WINDOW0)).toBe(false);
  });
  it("可視選別は中心が目標線に達したノーツ（timeMs==gameTimeMs）を含み、越えたノーツを除く", () => {
    const notes = [note("passed", 900), note("onLine", 1000), note("above", 1500)];
    // gameTimeMs=1000。窓 = [1000, 3000]。passed(900)は下端1000未満で除外、onLine(1000)は含む、above(1500)は含む。
    const range = visibleNoteRange(notes, 1000, WINDOW0);
    expect(range).toEqual({ start: 1, end: 3 });
  });
});

describe("maxConcurrentInWindow と lanePoolCapacity（プール容量算出）", () => {
  it("長さ windowMs の閉区間窓に同時に入る最大ノーツ数を返す", () => {
    // 窓長1000。timeMs: 0,100,200,1000,1000.5,3000。
    // [0,1000] に 0,100,200,1000 の4個（上端1000を含む）。
    const sorted = [
      note("a", 0),
      note("b", 100),
      note("c", 200),
      note("d", 1000),
      note("e", 1000.5),
      note("f", 3000),
    ];
    expect(maxConcurrentInWindow(sorted, 1000)).toBe(4);
  });

  it("窓の上端にちょうど一致する timeMs を同時数に数える（可視選別と同じ閉区間）", () => {
    // 窓長 leadMs+postTargetMs。下端のノーツとちょうど上端のノーツが同じ窓に入る。
    const windowMs = LEAD_MS + POST_MS; // 2120
    const sorted = [note("a", 0), note("b", windowMs)];
    expect(maxConcurrentInWindow(sorted, windowMs)).toBe(2);
  });

  it("容量は最大同時数に余裕を足した値", () => {
    const sorted = [note("a", 0), note("b", 100), note("c", 5000)];
    const cap = lanePoolCapacity(sorted, WINDOW, 4);
    // [0, 2120] に a,b の2個。容量 = 2 + 4 = 6。
    expect(cap).toBe(6);
  });

  it("空のノーツ列でも余裕ぶんの容量を返す", () => {
    expect(lanePoolCapacity([], WINDOW, 4)).toBe(4);
  });
});

describe("laneNoteY（スロットごとに異なる目標Yを与える）", () => {
  it("上端Yは全段共通、目標Yは段ごとに異なり、進度0で各段の目標Yに一致する", () => {
    const topY = 1;
    // 段ごとに異なる目標Y（圧縮帯の各スロット中央を2次元層へ写した値の例）。
    const targets = [0.821, 0.464, -0.25, -0.642];
    for (const targetY of targets) {
      expect(laneNoteY(0, { topY, targetY })).toBeCloseTo(targetY, 10);
      expect(laneNoteY(1, { topY, targetY })).toBeCloseTo(topY, 10);
    }
  });
});

describe("reachedNoteRange（線分到達の瞬間の検出。半開区間 [前時刻, 現時刻)）", () => {
  const notes = [
    note("n0", 0),
    note("n1", 1000),
    note("n2", 2000),
    note("n3", 3000),
    note("n4", 5000),
  ];

  it("前時刻以上・現時刻未満に到達したノーツの添字区間を返す", () => {
    // [900, 1500) に入るのは n1(1000) のみ。
    expect(reachedNoteRange(notes, 900, 1500)).toEqual({ start: 1, end: 2 });
  });

  it("下端ちょうどの timeMs を含み、上端ちょうどの timeMs を含まない（半開区間）", () => {
    // [1000, 2000) に入るのは n1(1000) のみ。n2(2000) は上端で除外。
    expect(reachedNoteRange(notes, 1000, 2000)).toEqual({ start: 1, end: 2 });
  });

  it("現時刻が前時刻以下（停止・巻き戻し）のときは空区間を返す", () => {
    expect(reachedNoteRange(notes, 2000, 2000)).toEqual({ start: 0, end: 0 });
    expect(reachedNoteRange(notes, 2000, 1000)).toEqual({ start: 0, end: 0 });
  });

  it("時刻が有限でないときは空区間を返す", () => {
    expect(reachedNoteRange(notes, Number.NaN, 1000)).toEqual({ start: 0, end: 0 });
    expect(reachedNoteRange(notes, 0, Number.POSITIVE_INFINITY)).toEqual({ start: 0, end: 0 });
  });
});

describe("notePhaseRadians と sparkDirectionRadians（消滅エフェクトの方向）", () => {
  it("基準角度は 0 以上 2π 未満で、整数の種ごとに決定的", () => {
    const twoPi = Math.PI * 2;
    for (const seed of [0, 1, 2, 7, 100]) {
      const phase = notePhaseRadians(seed);
      expect(phase).toBeGreaterThanOrEqual(0);
      expect(phase).toBeLessThan(twoPi);
      // 同じ種では同じ値（決定的）。
      expect(notePhaseRadians(seed)).toBe(phase);
    }
    // 種0は位相0。
    expect(notePhaseRadians(0)).toBe(0);
    // 非有限値は0へ丸める。
    expect(notePhaseRadians(Number.NaN)).toBe(0);
  });

  it("しぶきの方向は等間隔角度に基準角度を足した値", () => {
    const phase = 0.3;
    const count = 5;
    expect(sparkDirectionRadians(0, count, phase)).toBeCloseTo(phase, 10);
    expect(sparkDirectionRadians(count, count, phase)).toBeCloseTo(phase + Math.PI * 2, 10);
    expect(sparkDirectionRadians(2, count, phase)).toBeCloseTo(phase + (2 / count) * Math.PI * 2, 10);
  });
});
