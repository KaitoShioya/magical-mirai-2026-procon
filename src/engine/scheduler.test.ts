import { describe, it, expect } from "vitest";
import { createScheduler } from "./scheduler";
import { FIXED_STEP_MS, MAX_SIMULATION_STEPS_PER_FRAME } from "./constants";

describe("scheduler", () => {
  it("フレーム数非依存: 同じ目標への到達は分割の有無に依らず刻みの終端時刻列と回数が一致する", () => {
    const target = 100;

    const whole = createScheduler();
    whole.syncTo(0);
    const wholeSteps: number[] = [];
    whole.advanceTo(target, (t) => wholeSteps.push(t));

    const split = createScheduler();
    split.syncTo(0);
    const splitSteps: number[] = [];
    // 100 へ向けて不規則に分割した目標を順に与える。
    for (const partial of [16, 33, 50, 66, 83, 100]) {
      split.advanceTo(partial, (t) => splitSteps.push(t));
    }

    expect(wholeSteps).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    expect(splitSteps).toEqual(wholeSteps);
  });

  it("端数の保持と補間係数: 刻み境界に満たない端は補間係数に表れ、syncTo と reset で0に戻る", () => {
    const scheduler = createScheduler();
    scheduler.syncTo(0);
    const steps: number[] = [];
    const result = scheduler.advanceTo(25, (t) => steps.push(t));
    expect(steps).toEqual([10, 20]);
    expect(result.overflow).toBe(false);
    // 端数 5 ミリ秒 ÷ 固定刻み 10 ミリ秒 = 0.5。
    expect(scheduler.interpolationAlpha).toBeCloseTo((25 - 20) / FIXED_STEP_MS, 10);
    scheduler.syncTo(20);
    expect(scheduler.interpolationAlpha).toBe(0);
    scheduler.advanceTo(25, () => {});
    expect(scheduler.interpolationAlpha).toBeCloseTo(0.5, 10);
    scheduler.reset();
    expect(scheduler.interpolationAlpha).toBe(0);
  });

  it("上限超過: 目標が大きく離れると刻みは最大回数以下に収まり超過を返し、syncTo で合わせ直せる", () => {
    const scheduler = createScheduler();
    scheduler.syncTo(0);
    let count = 0;
    const result = scheduler.advanceTo(100000, () => {
      count += 1;
    });
    expect(result.steps).toBe(MAX_SIMULATION_STEPS_PER_FRAME);
    expect(count).toBe(MAX_SIMULATION_STEPS_PER_FRAME);
    expect(result.overflow).toBe(true);

    scheduler.syncTo(100000);
    const after = scheduler.advanceTo(100000, () => {
      throw new Error("超過後に現在時刻へ合わせたら刻みは生じないはず");
    });
    expect(after.steps).toBe(0);
    expect(after.overflow).toBe(false);
  });

  it("境界: 目標がちょうど1刻みぶん先なら1回だけ刻み、目標が過去なら刻まない", () => {
    const exact = createScheduler();
    exact.syncTo(0);
    const steps: number[] = [];
    const exactResult = exact.advanceTo(FIXED_STEP_MS, (t) => steps.push(t));
    expect(steps).toEqual([FIXED_STEP_MS]);
    expect(exactResult.steps).toBe(1);
    expect(exact.interpolationAlpha).toBe(0);

    const past = createScheduler();
    past.syncTo(1000);
    const pastResult = past.advanceTo(500, () => {
      throw new Error("目標が過去なら刻みは生じないはず");
    });
    expect(pastResult.steps).toBe(0);
    expect(pastResult.overflow).toBe(false);
    expect(past.interpolationAlpha).toBe(0);
  });
});
