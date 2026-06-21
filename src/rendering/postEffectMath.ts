// 拍同期ポストエフェクト（Issue #17）の数式の検証用複製。three.js を import しない純粋関数で、node 環境の
// 単体テストから数式の正しさを確かめる。
//
// 二重定義にする理由を先に述べる。実際の減光・色収差はフラグメントシェーダ（postEffectShader.ts）で実行する
// が、シェーダのGLSLは node 環境で実行できず単体テストで検証できない。そこで同じ式をここに純粋関数として写し、
// 数式そのものの正しさ（中心と四隅の値・単調性・距離比例）を単体テストで担保する。GLSL 側はこの式を写したもの
// であり、両者が一致する責務をここに限定する（postEffectShader.ts のコメントで対応を明示する）。

/**
 * 画面の正規化座標 (uvX, uvY)（いずれも0から1、中心は0.5）における、中心0・四隅1の正規化距離を返す。
 * aspect は画面の縦横比（横の画素数 ÷ 縦の画素数）。
 * 縦横比で補正したうえで四隅までの長さで割る理由を先に述べる。補正しないと縦長・横長で効果の立ち上がりが
 * 画面比に依存し、四隅で1に正規化すると画面比に依らず一様に減光・色収差が立ち上がる。
 */
export function normalizedVignetteDistance(uvX: number, uvY: number, aspect: number): number {
  const dx = (uvX - 0.5) * aspect;
  const dy = uvY - 0.5;
  // 四隅までの長さ。0除算を避けるため下限を設ける（縦横比が0以下の異常入力への防御）。
  const maxLen = Math.max(Math.hypot(0.5 * aspect, 0.5), 1e-4);
  return Math.hypot(dx, dy) / maxLen;
}

/**
 * GLSL の smoothstep と同じ補間。edge0 以下で0、edge1 以上で1、間は滑らかな3次補間 t*t*(3-2t) を返す。
 * edge0 と edge1 が等しいときは0除算を避け、x が edge0 以上なら1、そうでなければ0を返す（GLSL の挙動に倣う）。
 */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) {
    return x < edge0 ? 0 : 1;
  }
  let t = (x - edge0) / (edge1 - edge0);
  t = Math.min(1, Math.max(0, t));
  return t * t * (3 - 2 * t);
}

/**
 * 周縁減光の係数（中心1・四隅 1-strength）を返す。dist は normalizedVignetteDistance の値、inner/outer は
 * 減光を始めない半径と最大に達する半径、strength は周縁の最大減光率。
 */
export function vignetteFactor(
  dist: number,
  inner: number,
  outer: number,
  strength: number
): number {
  return 1 - strength * smoothstep(inner, outer, dist);
}

/**
 * 色収差のずらし量（放射方向の長さ、画面正規化座標の単位）を返す。dist は normalizedVignetteDistance の値、
 * maxOffset は四隅での最大ずれ、burstIntensity はバースト強度（0から1）。中心はずれ0、四隅で最大になる。
 */
export function chromaShiftMagnitude(
  dist: number,
  maxOffset: number,
  burstIntensity: number
): number {
  return maxOffset * burstIntensity * dist;
}
