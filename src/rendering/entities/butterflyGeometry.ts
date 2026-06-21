// 蝶の造形ジェネレータ（Issue #61）。three.js の BufferGeometry を組むが、描画器（WebGLRenderer）には
// 触れないため node で構築でき配列を読み戻して検証できる。蝶曲線（Temple Fay の超越的蝶曲線）で形を作る。
// 出典 docs/research/02-non-text-expression.md §5（蝶＝パラメトリック曲線で描く）。曲線は
//   x(t) = sin(t) (e^cos t − 2 cos 4t − sin^5(t/12))
//   y(t) = cos(t) (e^cos t − 2 cos 4t − sin^5(t/12))   （0 ≤ t < 12π）
// で、上翅が大きく下翅が小さい胴の縦長い蝶の輪郭になる。これを等間隔にサンプリングし、胴中心（原点）からの
// 三角形扇で塗り潰す。採用理由を先に述べる。曲線は方向(sin t, cos t)に半径Rを掛けた極座標的な形のため、原点
// からの扇が曲線の内側を素直に充填して蝶のシルエットを面で表せる。材質は不透明で同色のため、6重ループで
// 三角形が重なっても色は加算されず単色の面になる（破綻しない）。発光してブルームでにじむ灯しは、線より面で
// 光るほうが効くため、線ではなく面で表す。
//
// 座標系: 胴軸は y 軸（縦）。翅は胴の左右へ x 方向に広がる。二面角は胴軸（y 軸）まわりの回転で与え、翅に
// z 方向の奥行きを出す（真横・真上のカメラで線に潰れないため）。羽ばたきはシェーダが胴軸まわりの追加回転で
// 与える（butterflyShader.ts）。本ファイルは静止形状のみを作る。

import { BufferGeometry, Float32BufferAttribute } from "three";
import { BUTTERFLY_CURVE_SAMPLES, BUTTERFLY_DIHEDRAL_RADIANS } from "../constants";

export interface ButterflyGeometryOptions {
  /** 蝶曲線の等間隔サンプル数（既定 BUTTERFLY_CURVE_SAMPLES）。三角形数に等しい。 */
  curveSamples?: number;
  /** 左右の翅の二面角ラジアン（既定 BUTTERFLY_DIHEDRAL_RADIANS、0で平面）。 */
  dihedralRadians?: number;
}

// 蝶曲線を一周する媒介変数の上限。曲線の定義域 0 ≤ t < 12π に従う。
const CURVE_PERIOD = 12 * Math.PI;
// 正規化後の最大半径。スケールはインスタンス側で与えるため、形の最大の広がりを1に正規化して扱いやすくする。
const TARGET_HALF_EXTENT = 1;

// 蝶曲線の1点（正規化前）。半径 R に方向 (sin t, cos t) を掛ける。
function curvePoint(t: number): { x: number; y: number } {
  const radius = Math.exp(Math.cos(t)) - 2 * Math.cos(4 * t) - Math.sin(t / 12) ** 5;
  return { x: Math.sin(t) * radius, y: Math.cos(t) * radius };
}

/**
 * 蝶のジオメトリを生成する。位置に加え、羽ばたき用の頂点属性 aBflyWingSign（右翅+1・左翅-1・胴軸0）と
 * aBflyWingSpan（胴軸からの正規化距離0〜1）を持つ。法線は持たない（発光の MeshBasicMaterial は陰影を使わない）。
 */
export function createButterflyGeometry(options?: ButterflyGeometryOptions): BufferGeometry {
  const curveSamples = options?.curveSamples ?? BUTTERFLY_CURVE_SAMPLES;
  const dihedralRadians = options?.dihedralRadians ?? BUTTERFLY_DIHEDRAL_RADIANS;

  // 三角形扇には少なくとも3サンプル要る。整数で正の3以上を要求する。
  if (!Number.isInteger(curveSamples) || curveSamples < 3) {
    throw new Error(`曲線サンプル数は3以上の整数でなければなりません（受領: ${curveSamples}）`);
  }
  if (!Number.isFinite(dihedralRadians)) {
    throw new Error(`二面角は有限値でなければなりません（受領: ${dihedralRadians}）`);
  }

  // 1周ぶんをサンプリングし、最大の広がりで正規化する。
  const sampled: { x: number; y: number }[] = [];
  let maxAbs = 0;
  let maxAbsX = 0;
  for (let i = 0; i < curveSamples; i += 1) {
    const t = (i / curveSamples) * CURVE_PERIOD;
    const point = curvePoint(t);
    sampled.push(point);
    maxAbs = Math.max(maxAbs, Math.abs(point.x), Math.abs(point.y));
    maxAbsX = Math.max(maxAbsX, Math.abs(point.x));
  }
  const norm = maxAbs > 0 ? TARGET_HALF_EXTENT / maxAbs : 1;
  const normMaxAbsX = maxAbsX * norm;

  const positions: number[] = [];
  const wingSign: number[] = [];
  const wingSpan: number[] = [];
  const indices: number[] = [];

  const cosD = Math.cos(dihedralRadians);
  const sinD = Math.sin(dihedralRadians);

  // 胴中心（扇の中心）の頂点。原点・胴軸上のため羽ばたかない（符号0・span0）。
  positions.push(0, 0, 0);
  wingSign.push(0);
  wingSpan.push(0);

  // 曲線の各点。左右の翅を胴軸まわりに対称な谷（V字）へ折る。採用理由を先に述べる。符号付き(-x0)で折ると
  // 全体が片側へ傾く偏揺れになり対称な谷にならないため、絶対値を使い両翅とも同じ向き（+z）へ |x| に比例して
  // 持ち上げる。これにより左右対称の谷ができ、エンティティが蝶を水平へ寝かせるとこの谷が翅の上反りになる。
  for (let i = 0; i < curveSamples; i += 1) {
    const x0 = sampled[i].x * norm;
    const y0 = sampled[i].y * norm;
    const x1 = x0 * cosD;
    const z1 = Math.abs(x0) * sinD;
    positions.push(x1, y0, z1);
    // 右翅(x>0)は+1、左翅(x<0)は-1、胴軸上(x=0)は0。羽ばたきの回転方向の符号に使う。
    wingSign.push(Math.sign(x0));
    // 胴軸からの正規化距離。翅端ほど大きく羽ばたく重みに使う。
    wingSpan.push(normMaxAbsX > 0 ? Math.abs(x0) / normMaxAbsX : 0);
  }

  // 胴中心から隣り合う曲線点へ三角形扇を張る。最後の点は最初の点へ閉じる。両面材質のため巻き順は問わない。
  for (let i = 0; i < curveSamples; i += 1) {
    const a = 1 + i;
    const b = 1 + ((i + 1) % curveSamples);
    indices.push(0, a, b);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aBflyWingSign", new Float32BufferAttribute(wingSign, 1));
  geometry.setAttribute("aBflyWingSpan", new Float32BufferAttribute(wingSpan, 1));
  geometry.setIndex(indices);
  return geometry;
}
