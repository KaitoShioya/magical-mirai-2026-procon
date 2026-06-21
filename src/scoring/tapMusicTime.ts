// 入力の時刻を音楽の時刻へ変換する純粋関数（Issue #48・3時刻分離の核）。
// 採用する式の根拠を先に述べる。event.timeStamp とフレームの実時計（performance.now が渡す時刻）は同じ高精度時刻基準のため、
// その差でフレーム内のタップの発生時刻のずれが分かる。これをそのフレームのゲーム時計（musicPositionMs）に足すと、
// タップが起きた瞬間の音楽時刻を復元できる。フレーム内補正を入れる理由は、1フレーム約16.7ミリ秒が1拍343ミリ秒の約5パーセントに当たり、
// タップがフレームのどこで起きたかを無視すると最大でこの幅の誤差が判定に乗るためである（出典 docs/research/04-ux-and-chart-design.md §1
// 「入力の時刻：タップのイベントが持つ時刻を使う。描画のフレームの時刻と混同しない」）。

import type { FrameTimeSample } from "./types";

/**
 * 入力イベントの時刻とフレーム時刻標本から、タップが起きた瞬間の音楽時刻（ミリ秒）を返す。
 * musicTimeAtTap = musicPositionMs + (eventTimeMs - frameWallTimeMs)。
 * 非有限値ガード: eventTimeMs・frameWallTimeMs のいずれかが非有限ならフレーム内補正を行わず musicPositionMs を返し、
 * musicPositionMs も非有限なら0を返す（時計の非数汚染を避ける）。
 */
export function tapMusicTimeMs(eventTimeMs: number, frame: FrameTimeSample): number {
  if (!Number.isFinite(frame.musicPositionMs)) {
    return 0;
  }
  if (!Number.isFinite(eventTimeMs) || !Number.isFinite(frame.frameWallTimeMs)) {
    return frame.musicPositionMs;
  }
  return frame.musicPositionMs + (eventTimeMs - frame.frameWallTimeMs);
}
