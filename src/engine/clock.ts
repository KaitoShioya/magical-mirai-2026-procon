// 再生位置を平滑化・単調化・ずれ補正してゲームの時計を出す純粋ロジック。
// 描画合図にもタブ表示イベントにも依存しない（決定的に単体検証するため）。
// 時計の性質の出典: docs/decisions/architecture.md §3.2・§6（移動平均で平滑化・単調化・閾値超で再同期）。

import { PAUSED_RESYNC_THRESHOLD_MS, RESYNC_THRESHOLD_MS, SMOOTHING_FACTOR } from "./constants";

export interface ClockSample {
  /** 平滑化・単調化・ずれ補正の後のゲーム時刻（ミリ秒）。 */
  gameTimeMs: number;
  /** このフレームで報告位置へ即座に合わせ直した（再同期した）なら真。 */
  didResync: boolean;
}

export interface Clock {
  /** 1フレームぶん進める。報告位置・再生中か・実経過ミリ秒を受け取りゲーム時刻を返す。 */
  update(reportedMs: number, isPlaying: boolean, realDeltaMs: number): ClockSample;
  /** 推定値を報告位置へ即座に合わせる（単調化を通さない）。合わせたら真、非有限値で何もしなければ偽を返す。 */
  forceResync(reportedMs: number): boolean;
  /** 未初期化へ戻す（再挑戦時）。 */
  reset(): void;
  /** 現在のゲーム時刻（未初期化なら0）。 */
  readonly gameTimeMs: number;
  /** 一度でも有効な位置を受け取り初期化済みなら真。 */
  readonly hasSample: boolean;
}

export function createClock(): Clock {
  // 推定値。未初期化のあいだは null。
  let estimate: number | null = null;

  return {
    get gameTimeMs(): number {
      return estimate ?? 0;
    },
    get hasSample(): boolean {
      return estimate !== null;
    },

    update(reportedMs: number, isPlaying: boolean, realDeltaMs: number): ClockSample {
      // 無効値ガード: 非有限の報告は前回値を据え置く（時計の非数汚染を防ぐ）。
      if (!Number.isFinite(reportedMs)) {
        return { gameTimeMs: estimate ?? 0, didResync: false };
      }

      // 初期化: 最初の有効な位置で必ず合わせる。
      if (estimate === null) {
        estimate = reportedMs;
        return { gameTimeMs: estimate, didResync: true };
      }

      // 停止中: 予測で進めない。報告位置の変化が停止中再同期閾値を超えたら実シークとみなし再同期。
      if (!isPlaying) {
        if (Math.abs(reportedMs - estimate) > PAUSED_RESYNC_THRESHOLD_MS) {
          estimate = reportedMs;
          return { gameTimeMs: estimate, didResync: true };
        }
        return { gameTimeMs: estimate, didResync: false };
      }

      // 再生中: 予測値と報告値の差が再同期閾値を超えたら、単調化を通さず即合わせ（前後どちらの飛びも受容）。
      const predicted = estimate + realDeltaMs;
      if (Math.abs(reportedMs - predicted) > RESYNC_THRESHOLD_MS) {
        estimate = reportedMs;
        return { gameTimeMs: estimate, didResync: true };
      }

      // 平滑化（一次低域通過＝指数移動平均）。最後に単調化（再生中のみ、前回推定値以上に丸める）。
      const smoothed = predicted + (reportedMs - predicted) * SMOOTHING_FACTOR;
      estimate = Math.max(smoothed, estimate);
      return { gameTimeMs: estimate, didResync: false };
    },

    forceResync(reportedMs: number): boolean {
      if (!Number.isFinite(reportedMs)) {
        return false;
      }
      estimate = reportedMs;
      return true;
    },

    reset(): void {
      estimate = null;
    },
  };
}
