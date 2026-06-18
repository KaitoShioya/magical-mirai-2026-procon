import { describe, it, expect } from "vitest";
import { createClock } from "./clock";
import { PAUSED_RESYNC_THRESHOLD_MS, RESYNC_THRESHOLD_MS } from "./constants";

describe("clock", () => {
  it("初期化: 最初の更新でゲーム時刻が報告値になり再同期扱い、hasSample が真になる", () => {
    const clock = createClock();
    expect(clock.hasSample).toBe(false);
    const sample = clock.update(1000, true, 16);
    expect(sample.gameTimeMs).toBe(1000);
    expect(sample.didResync).toBe(true);
    expect(clock.hasSample).toBe(true);
    expect(clock.gameTimeMs).toBe(1000);
  });

  it("単調性: 再生中に報告値が前後へ揺れてもゲーム時刻は後退しない", () => {
    const clock = createClock();
    clock.update(1000, true, 16);
    let previous = clock.gameTimeMs;
    // 報告値が予測の前後で小さく揺れる系列（いずれも再同期閾値内）。
    for (const reported of [1010, 1005, 1030, 1020, 1050]) {
      const sample = clock.update(reported, true, 16);
      expect(sample.didResync).toBe(false);
      expect(sample.gameTimeMs).toBeGreaterThanOrEqual(previous);
      previous = sample.gameTimeMs;
    }
  });

  it("前方再同期: 再生中に報告値が閾値を超えて前へ飛ぶと即合わせる", () => {
    const clock = createClock();
    clock.update(1000, true, 16);
    const sample = clock.update(1000 + RESYNC_THRESHOLD_MS + 500, true, 16);
    expect(sample.didResync).toBe(true);
    expect(sample.gameTimeMs).toBe(1000 + RESYNC_THRESHOLD_MS + 500);
  });

  it("後方シーク: 再生中に報告値が大きく減ると再同期しゲーム時刻が後退する", () => {
    const clock = createClock();
    clock.update(5000, true, 16);
    const sample = clock.update(1000, true, 16);
    expect(sample.didResync).toBe(true);
    expect(sample.gameTimeMs).toBe(1000);
    expect(clock.gameTimeMs).toBe(1000);
  });

  it("停止中: 閾値内の揺れは据え置き、閾値超の変化は再同期する", () => {
    const clock = createClock();
    clock.update(1000, true, 16);
    // 停止中・閾値内の揺れ: 据え置き。
    const held = clock.update(1000 + PAUSED_RESYNC_THRESHOLD_MS, false, 16);
    expect(held.didResync).toBe(false);
    expect(held.gameTimeMs).toBe(1000);
    // 停止中・閾値超の変化（シーク）: 再同期。
    const seeked = clock.update(1000 + PAUSED_RESYNC_THRESHOLD_MS + 50, false, 16);
    expect(seeked.didResync).toBe(true);
    expect(seeked.gameTimeMs).toBe(1000 + PAUSED_RESYNC_THRESHOLD_MS + 50);
  });

  it("再同期閾値ちょうどの差では再同期しない（境界は超過のときだけ）", () => {
    const clock = createClock();
    clock.update(1000, true, 0);
    // realDelta=0 なので predicted=1000。差がちょうど閾値（超過ではない）なら平滑化に進み再同期しない。
    const sample = clock.update(1000 + RESYNC_THRESHOLD_MS, true, 0);
    expect(sample.didResync).toBe(false);
  });

  it("無効値ガード: 非有限の報告は前回のゲーム時刻を据え置く", () => {
    const clock = createClock();
    clock.update(1000, true, 16);
    const sample = clock.update(Number.NaN, true, 16);
    expect(sample.didResync).toBe(false);
    expect(sample.gameTimeMs).toBe(1000);
    expect(clock.gameTimeMs).toBe(1000);
  });

  it("強制再同期: 非有限値では何もせず偽を返し、有限値では即合わせて真を返す", () => {
    const clock = createClock();
    clock.update(1000, true, 16);
    expect(clock.forceResync(Number.NaN)).toBe(false);
    expect(clock.gameTimeMs).toBe(1000);
    expect(clock.forceResync(3000)).toBe(true);
    expect(clock.gameTimeMs).toBe(3000);
  });
});
