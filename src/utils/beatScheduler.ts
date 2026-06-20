// 拍同期スケジューラ（曲非依存の純粋ロジック）。拍の開始時刻の昇順配列を読み、描画フレームごとに
// 呼ばれて、直前に処理した時刻から現在時刻までに開始時刻が入る拍を、時刻の昇順でちょうど1回ずつ通知する。
// 視覚演出（#17 ビネット＋色収差・#76 画面揺れ・#23 1文字1拍スマッシュ）が拍に同期して発火するための
// 共通基盤（Issue #16）。
//
// 配置の理由を先に述べる。本モジュールは時刻に基づく純粋なイベントの仲介であり、rendering は
// 「時刻の論理を持たない」（architecture.md §3.3・§5）ため rendering には置かない。一方 src/utils の
// 責務は「数値計算・イベントの仲介」を含み（src/utils/README.md）、描画と判定が共有する純粋評価器を
// engine でなく utils に置いたカメラ軌跡評価器（#13）の前例に倣う。
//
// 駆動単位の理由を先に述べる。docs/research/02-non-text-expression.md §2 は「毎フレームで再生位置を見て、
// 直前の拍を跨いだフレームでその出来事を1回だけ発火させる」と定める。発火対象は判定・得点ではなく
// 視覚演出であり、判定用の固定時間刻み（engine/scheduler.ts）ではなく描画フレーム単位で駆動する
// （architecture.md §6「描画の繰り返しの時刻は演出にのみ使う」）。
//
// 渡す時刻の出所の注意を先に述べる。advance・syncTo に渡す時刻は、ゲームの時計（player.timer.position を
// 平滑化・単調化・ずれ補正したミリ秒。engine の world.gameTimeMs）であり、requestAnimationFrame が渡す
// 時刻ではない。両者を取り違えると拍と演出がずれる（architecture.md §6）。
//
// 時刻の単位はミリ秒で統一する。理由を先に述べる。TextAlive の拍時刻（IBeat.startTime）と再生位置
// （player.timer.position）がともにミリ秒であり（architecture.md §6）、単位変換を挟まない。

// 発火した拍の情報。
export interface BeatEvent {
  // 拍の添字（曲先頭からの拍の序数）。入力配列の添字に一致する。
  readonly index: number;
  // 拍の開始時刻（ミリ秒）。入力配列の値に一致する。
  readonly timeMs: number;
  // 発火した描画フレームの時刻（ミリ秒）。advance に渡した現在時刻に一致する。
  readonly frameTimeMs: number;
  // 拍の開始時刻から発火フレームまでの経過（ミリ秒）。frameTimeMs - timeMs に等しく、常に0以上。
  // 採用理由を先に述べる。フレーム落ち・再同期で発火フレームが拍より遅れることがあり、消費側
  //（#23 のビート一致）はこの経過分だけ演出を進めた状態で開始すると、拍からの見かけのずれを補正できる。
  readonly elapsedSinceBeatMs: number;
}

// 拍同期スケジューラ。advance（フレーム前進と発火）・syncTo（飛びの基準貼り直し）・reset（初期化）を持つ。
export interface BeatScheduler {
  // 現在時刻まで処理を進め、(lastProcessedMs, currentTimeMs] に開始時刻が入る拍を昇順で1回ずつ onBeat へ渡し、
  // 発火した拍の数を返す。初回は基準時刻を確定するだけで発火しない（0を返す）。現在時刻が有限でない、または
  // 直前の処理時刻以下のときは無発火・基準後退なし（0を返す）。
  advance(currentTimeMs: number, onBeat: (event: BeatEvent) => void): number;
  // 基準時刻を timeMs へ貼り直す（無発火）。再生位置の飛び（シーク・再同期・タブ復帰）で多数の拍を
  // 遡及発火させないために使う。timeMs が有限でないときは何もしない。
  syncTo(timeMs: number): void;
  // 初期状態（基準時刻未確定・先頭の拍から未処理）へ戻す。
  reset(): void;
  // 直前に処理した時刻（ミリ秒）。基準時刻が未確定なら null。
  readonly lastProcessedMs: number | null;
}

// beatStartTimesMs[i] > timeMs を満たす最小の添字 i を二分探索で返す（無ければ length）。
// beatStartTimesMs は昇順（非減少）、timeMs は有限を前提とする（呼び出し側 syncTo が保証する）。
// syncTo で基準時刻の直後の拍へ位置づけるのに使い、毎フレームの全走査を避けて対数時間にする。
export function firstBeatIndexAfter(
  beatStartTimesMs: readonly number[],
  timeMs: number
): number {
  let low = 0;
  let high = beatStartTimesMs.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (beatStartTimesMs[mid] > timeMs) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }
  return low;
}

export function createBeatScheduler(
  beatStartTimesMs: readonly number[]
): BeatScheduler {
  // 入力を内部配列へ複製する（スナップショット）。理由を先に述べる。引数の型 readonly number[] は
  // 実行時の配列変更を防げず、生成後に呼び出し側が元配列を変更すると発火が壊れる。生成時に値を複製して
  // 以後は内部配列だけを参照する（カメラ軌跡評価器が times を複製して保持するのと同じ方針）。
  const beats = beatStartTimesMs.slice();

  // 値の検証。理由を先に述べる。advance は次に未処理の拍の添字を前進させるだけで拍を発火するため、
  // 入力が有限でない、または昇順（非減少）でないと跨ぎ判定が破綻する。曲プロファイルの内容不備は
  // 実行時に黙って壊れるより生成時に明確に失敗させる（architecture.md §3.6）。
  for (let i = 0; i < beats.length; i += 1) {
    if (!Number.isFinite(beats[i])) {
      throw new Error("拍の開始時刻は有限の数でなければなりません");
    }
    if (i > 0 && !(beats[i] >= beats[i - 1])) {
      throw new Error("拍の開始時刻は昇順（非減少）でなければなりません");
    }
  }

  // lastProcessedMs が null のときは基準時刻が未確定（初回 advance か reset 直後）。
  // nextIndex は次に未処理の拍の添字。syncTo / advance が常に firstBeatIndexAfter と整合させる。
  let lastProcessedMs: number | null = null;
  let nextIndex = 0;

  function syncTo(timeMs: number): void {
    // 有限でない時刻は無視する（基準を壊さない）。
    if (!Number.isFinite(timeMs)) {
      return;
    }
    lastProcessedMs = timeMs;
    nextIndex = firstBeatIndexAfter(beats, timeMs);
  }

  return {
    advance(currentTimeMs: number, onBeat: (event: BeatEvent) => void): number {
      // 有限でない現在時刻は無視する（基準を壊さない）。clock・scheduler が非有限の入力を早期に弾くのに倣う。
      if (!Number.isFinite(currentTimeMs)) {
        return 0;
      }
      // 初回は基準時刻を確定するだけで発火しない（開始位置以前の拍を遡って一括発火させないため。
      // clock が「最初の有効な位置で必ず合わせる」のと同型）。
      if (lastProcessedMs === null) {
        syncTo(currentTimeMs);
        return 0;
      }
      // 前進のみ。現在時刻が直前の処理時刻以下なら無発火・基準後退なし（ゲーム時刻の単調化と整合）。
      if (currentTimeMs <= lastProcessedMs) {
        return 0;
      }
      // (lastProcessedMs, currentTimeMs] に開始時刻が入る拍を昇順で発火する。
      // nextIndex は lastProcessedMs の直後の拍を指すため、currentTimeMs 以下の拍を順に発火すればよい。
      let firedCount = 0;
      while (nextIndex < beats.length && beats[nextIndex] <= currentTimeMs) {
        const timeMs = beats[nextIndex];
        onBeat({
          index: nextIndex,
          timeMs,
          frameTimeMs: currentTimeMs,
          elapsedSinceBeatMs: currentTimeMs - timeMs,
        });
        nextIndex += 1;
        firedCount += 1;
      }
      lastProcessedMs = currentTimeMs;
      return firedCount;
    },
    syncTo,
    reset(): void {
      lastProcessedMs = null;
      nextIndex = 0;
    },
    get lastProcessedMs(): number | null {
      return lastProcessedMs;
    },
  };
}
