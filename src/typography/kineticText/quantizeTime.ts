// コマ落ち（時間の間引き）の時刻量子化。
// 設計根拠: docs/decisions/visual-expression-design.md §2.1.2（コマ落ち＝数コマ飛ばして表示しカクつかせる）・
// §5.1（コマ落ちは演出へ渡す時刻を量子化するだけで費用は実質ゼロ）。激しい動きの直後の短区間に限って、演出へ
// 渡す時刻を一定刻みへ丸めることで、表示が数コマ飛んでカクつく見えを作る。純粋関数（依存規則§5）。

/**
 * 時刻（ミリ秒）を一定刻み stepMs へ丸める。stepMs が0以下のときは丸めず元の時刻を返す（0除算を避ける）。
 * 丸めは最も近い格子へ（Math.round）行う。刻みを大きくするほど飛ぶコマ数が増えてカクつきが強まる。
 */
export function quantizeTimeMs(timeMs: number, stepMs: number): number {
  if (!(stepMs > 0)) return timeMs;
  return Math.round(timeMs / stepMs) * stepMs;
}
