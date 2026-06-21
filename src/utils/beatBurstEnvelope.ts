// 拍バースト包絡（曲非依存の純粋ロジック）。強拍（小節頭）の発火時刻からの経過に対し、指数的に減衰する
// 強度（0から1）を返す。拍同期ポストエフェクトの色収差バースト（Issue #17）が、強拍直後に最大、時間とともに
// 0へ向かう強度を得るために使う。
//
// 配置の理由を先に述べる。本モジュールは時刻に基づく純粋な強度の評価であり、rendering は「時刻の論理を
// 持たない」（architecture.md §3.3・§5）ため rendering には置かない。src/utils の責務は数値計算を含み
// （src/utils/README.md）、描画と判定が共有する純粋評価器を utils に置いた拍同期スケジューラ（#16）・
// カメラ軌跡評価器（#13）の前例に倣う。
//
// 渡す時刻の出所の注意を先に述べる。trigger・intensityAt に渡す時刻は、ゲームの時計（engine の
// world.gameTimeMs）であり、requestAnimationFrame が渡す時刻ではない。両者を取り違えると拍と演出がずれる
// （architecture.md §6）。時刻の単位はミリ秒で統一する（拍時刻 IBeat.startTime と再生位置がミリ秒のため）。

// 拍バースト包絡。trigger（強拍発火）・intensityAt（現在強度）・reset（初期化）を持つ。
export interface BeatBurst {
  // 強拍を発火させる。beatTimeMs は拍の真の開始時刻（ミリ秒）。elapsedSinceBeatMs は発火フレームが拍より
  // 遅れた経過（ミリ秒、BeatEvent.elapsedSinceBeatMs）。
  // 基準時刻を発火フレーム時刻でなく拍の真の開始時刻に置く理由を先に述べる。フレーム落ちで発火が遅れても、
  // 最初の intensityAt の時点で経過分だけ減衰した値が返り、拍からの実時間に同期する。これにより
  // elapsedSinceBeatMs は基準時刻（beatTimeMs）から自動的に反映されるため、強度式では明示的に引かない。
  trigger(beatTimeMs: number, elapsedSinceBeatMs: number): void;
  // 現在時刻 timeMs における包絡強度（0から1）を返す。発火前、timeMs が拍の開始時刻より前、timeMs が
  // 有限でないときは0を返す。
  intensityAt(timeMs: number): number;
  // 初期状態（未発火）へ戻す。
  reset(): void;
}

export function createBeatBurst(decayTauMs: number): BeatBurst {
  // 値の検証。理由を先に述べる。減衰時定数が有限の正の数でないと exp(マイナス経過 ÷ 時定数)が発散または
  // 0除算で破綻する。生成時に明確に失敗させる（architecture.md §3.6）。
  if (!Number.isFinite(decayTauMs) || decayTauMs <= 0) {
    throw new Error("減衰時定数は有限の正の数でなければなりません");
  }

  // 直近に発火した強拍の真の開始時刻（ミリ秒）。未発火なら null。
  let onsetTimeMs: number | null = null;

  return {
    trigger(beatTimeMs: number, _elapsedSinceBeatMs: number): void {
      // 有限でない拍時刻は無視する（基準を壊さない。拍同期スケジューラの syncTo が非有限を弾くのに倣う）。
      if (!Number.isFinite(beatTimeMs)) {
        return;
      }
      onsetTimeMs = beatTimeMs;
    },
    intensityAt(timeMs: number): number {
      // 未発火・非有限・拍開始より前は強度0。
      if (onsetTimeMs === null || !Number.isFinite(timeMs) || timeMs < onsetTimeMs) {
        return 0;
      }
      return Math.exp(-(timeMs - onsetTimeMs) / decayTauMs);
    },
    reset(): void {
      onsetTimeMs = null;
    },
  };
}
