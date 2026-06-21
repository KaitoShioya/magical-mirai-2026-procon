import { describe, expect, it } from "vitest";
import { createPerfBudget, type PerfBudget, type PerfBudgetDecision } from "./performanceBudget";
import {
  PERF_FRAME_DELTA_CLAMP_MS,
  PERF_WINDOW_MS,
} from "./constants";

// 合成したフレーム経過を判定器へ与える補助。fps から1フレームの経過（1000÷fps ミリ秒）を作り、指定の
// 累積時間ぶん与える。段階が変化したら handler を呼ぶ（既定は実効変化ありの通知）。判定器の内部時刻は与えた
// 経過の累積で進むため、ここで足し込む経過（頭打ち後）と内部時刻は一致する。
function feed(
  budget: PerfBudget,
  fps: number,
  durationMs: number,
  onChange?: (decision: PerfBudgetDecision) => void
): void {
  const delta = 1000 / fps;
  const handler = onChange ?? ((): void => budget.notifyApplied(true));
  let elapsed = 0;
  while (elapsed < durationMs) {
    const decision = budget.recordFrame(delta);
    if (decision.changed) {
      handler(decision);
    }
    elapsed += Math.min(delta, PERF_FRAME_DELTA_CLAMP_MS);
  }
}

describe("createPerfBudget", () => {
  it("持続的な低下で1段だけ下降する（窓が満ちる前は変化しない）", () => {
    const budget = createPerfBudget();
    // 窓が満ちる前（2000ミリ秒未満）は判定しないため変化しない。
    feed(budget, 50, PERF_WINDOW_MS - 100);
    expect(budget.state().level).toBe(0);
    // さらに進めて窓が満ちると下降する。
    feed(budget, 50, 300);
    expect(budget.state().level).toBe(1);
  });

  it("低下が続くと画素密度→ブルーム→ブルーム無効へ1段ずつ進み最大段階で止まる", () => {
    const budget = createPerfBudget();
    const seen: number[] = [];
    feed(budget, 50, 12000, (decision) => {
      seen.push(decision.level);
      budget.notifyApplied(true);
    });
    // 1段ずつ進み、飛ばさず、最大段階3で止まる。
    expect(seen).toEqual([1, 2, 3]);
    expect(budget.state().level).toBe(3);
  });

  it("回復が続くと1段ずつ復帰し段階0で止まる", () => {
    const budget = createPerfBudget();
    feed(budget, 50, 9000); // 段階3まで下げる
    expect(budget.state().level).toBe(3);
    const seen: number[] = [];
    feed(budget, 60, 30000, (decision) => {
      seen.push(decision.level);
      budget.notifyApplied(true);
    });
    expect(seen).toEqual([2, 1, 0]);
    expect(budget.state().level).toBe(0);
  });

  it("不感帯（55超58未満）では段階を変えない", () => {
    const budget = createPerfBudget();
    feed(budget, 56.5, 10000, () => {
      throw new Error("不感帯で段階が変化した");
    });
    expect(budget.state().level).toBe(0);
  });

  it("中間段階でも不感帯では段階を変えない", () => {
    const budget = createPerfBudget();
    feed(budget, 50, 6000); // 段階2まで下げる
    expect(budget.state().level).toBe(2);
    feed(budget, 56.5, 12000, () => {
      throw new Error("不感帯で段階が変化した");
    });
    expect(budget.state().level).toBe(2);
  });

  it("下降の直後は下降の滞留時間まで再度の下降をしない", () => {
    const budget = createPerfBudget();
    feed(budget, 50, 2100); // 段階1へ（2000ミリ秒付近）
    expect(budget.state().level).toBe(1);
    // 下降直後から3000ミリ秒未満は再下降しない。
    feed(budget, 50, 2800, () => {
      throw new Error("滞留前に再下降した");
    });
    expect(budget.state().level).toBe(1);
    // 滞留を超えると下降する。
    feed(budget, 50, 400);
    expect(budget.state().level).toBe(2);
  });

  it("復帰の滞留は下降より長い（下降の滞留3000を超えても復帰の滞留8000まで戻らない）", () => {
    const budget = createPerfBudget();
    feed(budget, 50, 2100); // 段階1へ
    expect(budget.state().level).toBe(1);
    // 60フレーム毎秒に切り替え。下降の滞留(3000)を超えても復帰の滞留(8000)未満は戻らない。
    feed(budget, 60, 5000, () => {
      throw new Error("復帰の滞留前に戻った");
    });
    expect(budget.state().level).toBe(1);
    // 復帰の滞留を超えると戻る。
    feed(budget, 60, 4000);
    expect(budget.state().level).toBe(0);
  });

  it("実効変化なしの下降の後は次の下降を時間窓ぶんで許す", () => {
    const budget = createPerfBudget();
    // 最初の下降で実効変化なしを通知すると、次の下降の滞留が時間窓へ短縮される。
    feed(budget, 50, 2100, () => budget.notifyApplied(false));
    expect(budget.state().level).toBe(1);
    // 下降の滞留(3000)未満でも、時間窓(2000)を超えれば次の下降が起きる。
    feed(budget, 50, 2100);
    expect(budget.state().level).toBe(2);
  });

  it("過大な経過(5000ミリ秒)は頭打ちされ単独では下降を起こさない", () => {
    const budget = createPerfBudget();
    feed(budget, 60, 3000); // 窓を60フレーム毎秒で満たす
    expect(budget.state().level).toBe(0);
    budget.recordFrame(5000); // 100ミリ秒へ頭打ちされる1フレーム
    feed(budget, 60, 3000, () => {
      throw new Error("単独の遅延で下降した");
    });
    expect(budget.state().level).toBe(0);
  });

  it("reset は標本を初期化し段階を保持する", () => {
    const budget = createPerfBudget();
    feed(budget, 50, 6000); // 段階2まで下げる
    expect(budget.state().level).toBe(2);
    budget.reset();
    expect(budget.state().level).toBe(2); // 段階は保持
    expect(budget.state().sampleCount).toBe(0); // 標本は初期化
    // reset 直後は窓が満ちるまで判定しない。
    feed(budget, 50, 1900, () => {
      throw new Error("窓が満ちる前に変化した");
    });
    expect(budget.state().level).toBe(2);
    // 窓が満ちると再び下降する。
    feed(budget, 50, 1300);
    expect(budget.state().level).toBe(3);
  });

  it("時間窓の平均と最低の毎秒フレーム数を返す", () => {
    const budget = createPerfBudget();
    feed(budget, 50, 2500);
    const state = budget.state();
    expect(state.avgFps).toBeCloseTo(50, 5);
    expect(state.minFps).toBeCloseTo(50, 5);
    expect(state.windowMs).toBe(PERF_WINDOW_MS);
    expect(state.sampleCount).toBeGreaterThan(0);
  });
});
