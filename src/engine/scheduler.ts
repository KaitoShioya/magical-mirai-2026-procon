// 最終処理時刻を保持し、目標ゲーム時刻まで固定時間刻みで進める純粋ロジック。
// 各刻みに絶対ゲーム時刻を渡し、時計の時刻と処理済み時刻のずれを生まない。
// 累積器方式の出典: https://gafferongames.com/post/fix_your_timestep/

import { FIXED_STEP_MS, MAX_SIMULATION_STEPS_PER_FRAME } from "./constants";

export interface AdvanceResult {
  /** このフレームで実行した固定刻みの回数。 */
  steps: number;
  /** 最大刻み回数に達してなお目標へ届かなかった（捨てずに呼び出し側が現在時刻へ合わせるべき）なら真。 */
  overflow: boolean;
}

export interface Scheduler {
  /** 目標ゲーム時刻まで固定刻みで進める。各刻みの終端の絶対ゲーム時刻を onStep へ渡す。 */
  advanceTo(targetGameTimeMs: number, onStep: (stepEndGameTimeMs: number) => void): AdvanceResult;
  /** 最終処理時刻を即座に合わせる（再同期・上限超過時）。補間係数を0に戻す。 */
  syncTo(gameTimeMs: number): void;
  /** 最終処理時刻と補間係数を初期化する（再挑戦時）。 */
  reset(): void;
  /** 直近の補間係数（目標と最終処理時刻の差 ÷ 固定刻み、0以上1未満）。将来の描画補間に使う。 */
  readonly interpolationAlpha: number;
}

export function createScheduler(): Scheduler {
  // 最後に処理（onStep を呼んだ）ゲーム時刻。
  let lastProcessedMs = 0;
  let alpha = 0;

  return {
    get interpolationAlpha(): number {
      return alpha;
    },

    advanceTo(targetGameTimeMs: number, onStep: (stepEndGameTimeMs: number) => void): AdvanceResult {
      let steps = 0;
      while (
        lastProcessedMs + FIXED_STEP_MS <= targetGameTimeMs &&
        steps < MAX_SIMULATION_STEPS_PER_FRAME
      ) {
        lastProcessedMs += FIXED_STEP_MS;
        onStep(lastProcessedMs);
        steps += 1;
      }
      // 上限に達してなお目標へ届いていなければ超過。余剰は捨てず、呼び出し側が syncTo で合わせる。
      const overflow = lastProcessedMs + FIXED_STEP_MS <= targetGameTimeMs;
      if (overflow) {
        alpha = 0;
      } else {
        const remainder = targetGameTimeMs - lastProcessedMs;
        alpha = Number.isFinite(remainder) && remainder > 0 ? remainder / FIXED_STEP_MS : 0;
      }
      return { steps, overflow };
    },

    syncTo(gameTimeMs: number): void {
      if (!Number.isFinite(gameTimeMs)) {
        return;
      }
      lastProcessedMs = gameTimeMs;
      alpha = 0;
    },

    reset(): void {
      lastProcessedMs = 0;
      alpha = 0;
    },
  };
}
