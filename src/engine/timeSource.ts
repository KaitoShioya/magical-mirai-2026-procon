// 時間源の接合面。engine と TextAlive 統合（Issue #4）の継ぎ目。
// engine は TextAlive を直接 import せず、この接合面を通じて再生位置を受け取る（依存規則 docs/decisions/architecture.md §5）。

export interface TimeSource {
  /** 楽曲再生位置（ミリ秒）。時間源が未確定の間（isReady が偽）は呼ばない。 */
  positionMs(): number;
  /** 再生中なら真。 */
  isPlaying(): boolean;
  /** 再生位置が有効になっていれば真（TextAlive の onTimerReady 後に真）。 */
  isReady(): boolean;
}
