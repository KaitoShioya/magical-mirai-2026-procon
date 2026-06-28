// 成果物画像のキャプチャに使う、描画を伴わない純粋な計算（成果物タスク #69）。出力解像度の算出と、読み戻し画素の行反転を
// 分離して単体テスト可能にする。three.js・DOM を取り込まない（描画と入出力は artifactCapture.ts が担う）。

/** 成果物画像の長辺の画素数。正方形の許容寸法1200と一致させ、最大面積を1200×1200に収める。 */
export const ARTIFACT_LONG_EDGE = 1200;
/**
 * 出力の縦横比の下限と上限。縦横比は幅÷高さで定義する。
 * 下限0.8は Issue #69 が許容する縦長寸法1080×1350の縦横比に一致させ、上限1.25はその左右対称の値とする。
 * この範囲に制限する理由を先に述べる。極端な縦横比は余白の発生とファイル容量の増大を招くため、縦持ちと横持ちを
 * 無理なく覆う範囲に抑える。
 */
export const ARTIFACT_MIN_ASPECT = 0.8;
export const ARTIFACT_MAX_ASPECT = 1.25;

/**
 * ビューポートの寸法から成果物画像の出力解像度を求める。画面で構図した通りを保存するため、画像の縦横比を
 * 撮影時のビューポートの縦横比へ合わせる。長辺を1200画素に固定し、短辺は長辺を制限後の縦横比で割って四捨五入する。
 * 画素密度倍率は掛けない（固定の画素数にする）。
 * 不正な寸法（0以下・非有限）のときは正方形（1200×1200）にする。理由を先に述べる。縦横比を求められない入力で
 * 計算が壊れるのを避け、安全側の正方形に倒す。
 */
export function computeArtifactDimensions(
  viewportWidth: number,
  viewportHeight: number
): { width: number; height: number } {
  if (
    !Number.isFinite(viewportWidth) ||
    !Number.isFinite(viewportHeight) ||
    viewportWidth <= 0 ||
    viewportHeight <= 0
  ) {
    return { width: ARTIFACT_LONG_EDGE, height: ARTIFACT_LONG_EDGE };
  }
  const rawAspect = viewportWidth / viewportHeight;
  const aspect = Math.min(ARTIFACT_MAX_ASPECT, Math.max(ARTIFACT_MIN_ASPECT, rawAspect));
  // 縦横比が1以上のときは長辺が幅、1未満のときは長辺が高さになる。
  if (aspect >= 1) {
    return { width: ARTIFACT_LONG_EDGE, height: Math.round(ARTIFACT_LONG_EDGE / aspect) };
  }
  return { width: Math.round(ARTIFACT_LONG_EDGE * aspect), height: ARTIFACT_LONG_EDGE };
}

/**
 * 描画結果の読み戻し画素は左下を原点とする並びのため、画像にする前に行を上下反転する。
 * 2次元キャンバスの ImageData は左上を原点とするため、上下を入れ替えて並びを合わせる。
 * 入力は8ビットの赤緑青と不透明度の並び、戻り値は2次元キャンバスへそのまま載せられる Uint8ClampedArray。
 */
export function flipRowsRgba(buffer: Uint8Array, width: number, height: number): Uint8ClampedArray {
  const rowBytes = width * 4;
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sourceRowStart = (height - 1 - y) * rowBytes;
    const destinationRowStart = y * rowBytes;
    out.set(buffer.subarray(sourceRowStart, sourceRowStart + rowBytes), destinationRowStart);
  }
  return out;
}
