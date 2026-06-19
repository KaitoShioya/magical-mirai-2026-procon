// 描画領域の寸法計算（純粋関数）。three.js にも文書要素にも依存しないため決定的に単体検証できる。
// WebGL を生成する renderRoot.ts から呼び出して使う。

/**
 * 画素密度の倍率を上限で抑える。
 * 採用理由を先に述べる。描画画素数は表示画素数×画素密度倍率で決まり、上限を設けないと高密度の端末で
 * 描画画素が過大になり毎秒60フレームを割る（docs/decisions/architecture.md §3.8）。
 * 非有限値・0以下の入力は描画不能を避けるため1（等倍）に丸める。
 */
export function clampPixelRatio(devicePixelRatio: number, cap: number): number {
  if (!Number.isFinite(devicePixelRatio) || devicePixelRatio <= 0) {
    return 1;
  }
  return Math.min(devicePixelRatio, cap);
}

/**
 * 縦横比（幅÷高さ）を求める。
 * 採用理由を先に述べる。透視投影カメラの縦横比は描画領域の幅÷高さであり、これが表示画素の縦横比と
 * 一致しないと像が伸縮する。幅または高さが0以下・非有限のときは、縦横比が0・負・非数になり投影行列が
 * 壊れるのを避けるため1（正方形）を返す。
 */
export function computeAspect(width: number, height: number): number {
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    return 1;
  }
  return width / height;
}
