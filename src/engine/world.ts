// 進行中シミュレーション状態の最小実体。固定刻みでゲーム時刻と刻み回数を進める。
// 将来 chart/scoring がここへノーツ進行・得点状態を足す接合点。本Issueでは最小に留める。
//
// 下流（判定・得点）が参照する時刻源は必ず gameTimeMs とし、stepCount は診断専用に限定する。
// 理由: 再同期と超過では gameTimeMs だけを即合わせ stepCount は増やさないため、
// stepCount × 固定時間刻み をゲーム時刻として扱うと再同期・超過の後に時刻がずれる。

export interface World {
  /** 現在のゲーム時刻（ミリ秒）。下流の時刻源はこれを使う。 */
  readonly gameTimeMs: number;
  /** 実行した固定刻みの回数（診断専用）。 */
  readonly stepCount: number;
  /** 固定刻みの終端の絶対ゲーム時刻で進む。 */
  step(stepEndGameTimeMs: number): void;
  /** 再同期で時刻を即合わせる（刻み回数は変えない。シミュレーション刻みではないため）。 */
  syncTo(gameTimeMs: number): void;
  /** 再挑戦時の初期化。 */
  reset(): void;
}

export function createWorld(): World {
  let gameTimeMs = 0;
  let stepCount = 0;

  return {
    get gameTimeMs(): number {
      return gameTimeMs;
    },
    get stepCount(): number {
      return stepCount;
    },
    step(stepEndGameTimeMs: number): void {
      gameTimeMs = stepEndGameTimeMs;
      stepCount += 1;
    },
    syncTo(nextGameTimeMs: number): void {
      gameTimeMs = nextGameTimeMs;
    },
    reset(): void {
      gameTimeMs = 0;
      stepCount = 0;
    },
  };
}
