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

/**
 * ブルームのぼかしに使う描画対象の入力解像度（幅・高さ）を求める。
 * 採用理由を先に述べる。ブルームのぼかしは重い後処理で、コストは描画対象の面積に比例する。表示寸法
 * （CSS画素）に倍率を掛けた値で寸法を抑えると、画素密度の高い端末ほどブルームが相対的に安くなり毎秒60
 * フレームの目標に資する。画素密度倍率を掛けないのは、計測済みの試作（src/tools/perf/main.ts）が表示寸法×
 * 倍率で解像度を決めており、本編も同じ基準にして計測値を引き継ぐためである。
 * floor を使う理由は描画対象の寸法が整数画素数だから。max(1, …) を使う理由は寸法0で描画対象の生成が
 * 壊れるのを避けるため。非有限・0以下の入力も同じ理由で1へ丸める。
 * 戻り値は UnrealBloomPass.setSize へ渡す入力解像度であり、内部の描画対象は three.js がこの値の round(÷2)
 * からさらに半減させて作る。よってこの戻り値は内部描画対象の寸法ではなく setSize への入力値を指す。
 */
export function computeBloomResolution(
  displayWidth: number,
  displayHeight: number,
  scale: number
): { x: number; y: number } {
  return {
    x: clampBloomDimension(displayWidth * scale),
    y: clampBloomDimension(displayHeight * scale),
  };
}

function clampBloomDimension(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.max(1, Math.floor(value));
}

/** 2次元層の正射影カメラの視錐台（左・右・上・下）。 */
export interface OverlayFrustum {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * 2次元層の正射影カメラの視錐台を求める（Issue #15）。
 * 採用理由を先に述べる。両軸を独立に正規化すると単位長が軸ごとに変わり等方性（X方向とY方向の単位長が同じ
 * 性質）が壊れるため、画面の高さを単一の基準軸として両軸を同一単位で正規化する。高さ方向の可視範囲を -1〜+1
 * （正規化デバイス座標と一致）とし、幅方向を -縦横比〜+縦横比（縦横比 = 幅÷高さ）とすることで、両軸の単位長が
 * 等しくなり、丸い形が真円に描ける。可視範囲は幅と高さの比だけで決まり画素数を含まないため、解像度にも端末の
 * 画素密度倍率にも依存しない。縦横比は既存の computeAspect（幅または高さが0以下・非有限なら正方形の1へ丸める）
 * を再利用する。
 */
export function computeOverlayFrustum(width: number, height: number): OverlayFrustum {
  const aspect = computeAspect(width, height);
  return { left: -aspect, right: aspect, top: 1, bottom: -1 };
}

/**
 * 入力層の正規化座標を2次元層の座標へ写す（Issue #15）。
 * 入力層（src/input/coordinateMapping.ts）の正規化座標は左上原点・下方向正・各軸0以上1以下である。
 * 2次元層は中央原点・上方向正・高さ基準で上下が +1〜-1 であるため、写像の式は次のとおり。
 *   x = (normalizedX - 0.5) × 2 × aspect
 *   y = (0.5 - normalizedY) × 2
 * これにより中央(0.5,0.5)が原点、上端(normalizedY=0)が y=+1、左端(normalizedX=0)が x=-aspect へ対応する。
 * 採用理由を先に述べる。いずれかの入力が非有限のときは原点(0,0)へ丸める。寸法未確定の瞬間に物体を画面端へ
 * 飛ばさないためであり、入力層 coordinateMapping が中央へ丸める方針と揃える。
 */
export function overlayPointFromNormalized(
  normalizedX: number,
  normalizedY: number,
  aspect: number
): { x: number; y: number } {
  if (
    !Number.isFinite(normalizedX) ||
    !Number.isFinite(normalizedY) ||
    !Number.isFinite(aspect)
  ) {
    return { x: 0, y: 0 };
  }
  return {
    x: (normalizedX - 0.5) * 2 * aspect,
    y: (0.5 - normalizedY) * 2,
  };
}
