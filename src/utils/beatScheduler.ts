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
