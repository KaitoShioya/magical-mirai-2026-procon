// ひまわりの造形ジェネレータ（Issue #60）。three.js の BufferGeometry を組むが、描画器（WebGLRenderer）には
// 触れないため node で構築でき、配列を読み戻して検証できる。出典 docs/research/02-non-text-expression.md §5
// （ひまわり＝種と花弁を黄金角フェルマー螺旋と放射状で配置してコードで描く）。
//
// 形は3部位を1つのインデックス付き BufferGeometry に統合する。
//   花盤の土台: 中心1点と外周の三角形扇で、隙間なく塗る円。暗い橙のトーン。
//   花盤の種: 黄金角フェルマー螺旋上に並べた微小な四角形。中間のトーン。
//   花弁: 放射状に並べた舌状花のテーパー形。明るい橙のトーン。
// 図形内の色階調は頂点色属性 color に焼き、個体ごとの輝度はインスタンスの色（呼び手が乗算）で与える。
//
// 座標系: 湖面に水平に浮く向き。平面は XZ（水平面）で、法線は上方向（+Y）。実寸はインスタンスの等方スケールで
// 与えるため、ここでは花盤半径を基準とした正規化座標で作る。種マーカーと花弁は花盤の塗りより上に見せるため
// ごく小さく +Y へ持ち上げ、同一平面の前後競合（ちらつき）を避ける。法線は持たない（発光の MeshBasicMaterial は
// 陰影を使わない）。

import { BufferGeometry, Float32BufferAttribute } from "three";
import {
  GLOW_ORANGE_RGB,
  SUNFLOWER_DISC_RADIUS,
  SUNFLOWER_DISC_SEGMENTS,
  SUNFLOWER_GOLDEN_ANGLE,
  SUNFLOWER_PETAL_COUNT,
  SUNFLOWER_PETAL_CUP_DEPTH,
  SUNFLOWER_PETAL_CURL_HEIGHT,
  SUNFLOWER_PETAL_HALF_WIDTH,
  SUNFLOWER_PETAL_LENGTH,
  SUNFLOWER_PETAL_LIFT,
  SUNFLOWER_PETAL_SEGMENTS,
  SUNFLOWER_PETAL_TIP_RISE,
  SUNFLOWER_PETAL_TIP_SHARPNESS,
  SUNFLOWER_SEED_COUNT,
  SUNFLOWER_SEED_LIFT,
  SUNFLOWER_SEED_MARKER_FACTOR,
  SUNFLOWER_TONE_CORE,
  SUNFLOWER_TONE_PETAL,
  SUNFLOWER_TONE_SEED,
  SUNFLOWER_WOBBLE_FRACTION,
} from "../constants";

export interface SunflowerGeometryOptions {
  /** 花盤の半径（正規化座標、既定 SUNFLOWER_DISC_RADIUS）。正の有限値。 */
  discRadius?: number;
  /** 花盤の外周分割数（既定 SUNFLOWER_DISC_SEGMENTS）。3以上の整数。 */
  discSegments?: number;
  /** 種数（既定 SUNFLOWER_SEED_COUNT）。2以上の整数。 */
  seedCount?: number;
  /** 花弁数（既定 SUNFLOWER_PETAL_COUNT）。3以上の整数。 */
  petalCount?: number;
  /** 花弁の長手方向の段数（既定 SUNFLOWER_PETAL_SEGMENTS）。2以上の整数。 */
  petalSegments?: number;
  /** 花弁の長さ（正規化座標、既定 SUNFLOWER_PETAL_LENGTH）。正の有限値。 */
  petalLength?: number;
  /** 花弁の最大半幅（正規化座標、既定 SUNFLOWER_PETAL_HALF_WIDTH）。正の有限値。 */
  petalHalfWidth?: number;
  /** 花弁の先端の尖り指数（既定 SUNFLOWER_PETAL_TIP_SHARPNESS）。正の有限値。 */
  petalTipSharpness?: number;
  /** 種マーカーの半径の係数（既定 SUNFLOWER_SEED_MARKER_FACTOR）。正の有限値。 */
  seedMarkerFactor?: number;
  /** 花弁の角度ゆらぎの割合（角度間隔に対する、既定 SUNFLOWER_WOBBLE_FRACTION）。0以上の有限値。 */
  wobbleFraction?: number;
  /** ゆらぎを決定的に変える種（既定0）。同じ値なら同じ造形を生む。有限値。 */
  seed?: number;
  /** 花盤の芯・種・花弁のトーン係数（既定は SUNFLOWER_TONE_*）。各0以上1以下。 */
  toneCore?: number;
  toneSeed?: number;
  tonePetal?: number;
}

/** ひまわりのジオメトリと、検査・配置で参照する幾何メトリクス。 */
export interface SunflowerGeometry {
  /** 生成したジオメトリ（位置と頂点色、インデックス付き）。 */
  geometry: BufferGeometry;
  /** 花盤の半径（正規化座標）。 */
  discRadius: number;
  /** 全頂点の中心からの水平距離の最大値（実測の全体半径、正規化座標）。 */
  overallRadius: number;
  /** 中心花弁比率 = 花盤半径 / 全体半径。 */
  centerPetalRatio: number;
  /** 実際に配置した種数。 */
  seedCount: number;
  /** 実際に配置した花弁数。 */
  petalCount: number;
}

const TAU = Math.PI * 2;

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} は有限値でなければなりません（受領: ${value}）`);
  }
}

function assertPositiveFinite(value: number, label: string): void {
  assertFinite(value, label);
  if (value <= 0) {
    throw new Error(`${label} は正でなければなりません（受領: ${value}）`);
  }
}

function assertIntegerAtLeast(value: number, minimum: number, label: string): void {
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${label} は${minimum}以上の整数でなければなりません（受領: ${value}）`);
  }
}

/**
 * ひまわりのジオメトリを生成する。位置に加え頂点色属性 color（基準色 GLOW_ORANGE_RGB にトーン係数を掛けた
 * 線形sRGB）を持つ。返り値に幾何メトリクス（全体半径・中心花弁比率など）を併せて返し、単体テストと診断ページが
 * 同じ値を参照できるようにする（二重計算と値のずれを避ける）。
 */
export function createSunflowerGeometry(options?: SunflowerGeometryOptions): SunflowerGeometry {
  const discRadius = options?.discRadius ?? SUNFLOWER_DISC_RADIUS;
  const discSegments = options?.discSegments ?? SUNFLOWER_DISC_SEGMENTS;
  const seedCount = options?.seedCount ?? SUNFLOWER_SEED_COUNT;
  const petalCount = options?.petalCount ?? SUNFLOWER_PETAL_COUNT;
  const petalSegments = options?.petalSegments ?? SUNFLOWER_PETAL_SEGMENTS;
  const petalLength = options?.petalLength ?? SUNFLOWER_PETAL_LENGTH;
  const petalHalfWidth = options?.petalHalfWidth ?? SUNFLOWER_PETAL_HALF_WIDTH;
  const petalTipSharpness = options?.petalTipSharpness ?? SUNFLOWER_PETAL_TIP_SHARPNESS;
  const seedMarkerFactor = options?.seedMarkerFactor ?? SUNFLOWER_SEED_MARKER_FACTOR;
  const wobbleFraction = options?.wobbleFraction ?? SUNFLOWER_WOBBLE_FRACTION;
  const seed = options?.seed ?? 0;
  const toneCore = options?.toneCore ?? SUNFLOWER_TONE_CORE;
  const toneSeed = options?.toneSeed ?? SUNFLOWER_TONE_SEED;
  const tonePetal = options?.tonePetal ?? SUNFLOWER_TONE_PETAL;

  assertPositiveFinite(discRadius, "花盤半径");
  assertIntegerAtLeast(discSegments, 3, "花盤の外周分割数");
  // 種の半径式 √(n/(種数−1)) が0除算にならないよう、種数は2以上を要求する。
  assertIntegerAtLeast(seedCount, 2, "種数");
  assertIntegerAtLeast(petalCount, 3, "花弁数");
  assertIntegerAtLeast(petalSegments, 2, "花弁の段数");
  assertPositiveFinite(petalLength, "花弁の長さ");
  assertPositiveFinite(petalHalfWidth, "花弁の最大半幅");
  assertPositiveFinite(petalTipSharpness, "花弁の先端の尖り指数");
  assertPositiveFinite(seedMarkerFactor, "種マーカーの半径の係数");
  assertFinite(wobbleFraction, "ゆらぎの割合");
  if (wobbleFraction < 0) {
    throw new Error(`ゆらぎの割合は0以上でなければなりません（受領: ${wobbleFraction}）`);
  }
  assertFinite(seed, "種");
  for (const [label, value] of [
    ["芯のトーン係数", toneCore],
    ["種のトーン係数", toneSeed],
    ["花弁のトーン係数", tonePetal],
  ] as const) {
    assertFinite(value, label);
    if (value < 0 || value > 1) {
      throw new Error(`${label} は0以上1以下でなければなりません（受領: ${value}）`);
    }
  }

  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  // 頂点を1つ追加し、その索引を返す。色は基準色にトーン係数を掛けた純粋なトーン（個体輝度を含まない）。
  function pushVertex(x: number, y: number, z: number, tone: number): number {
    const index = positions.length / 3;
    positions.push(x, y, z);
    colors.push(GLOW_ORANGE_RGB[0] * tone, GLOW_ORANGE_RGB[1] * tone, GLOW_ORANGE_RGB[2] * tone);
    return index;
  }

  // ---- 花盤の土台（三角形扇、隙間なしの塗り、暗い橙トーン、平面 y=0） ----
  const discCenter = pushVertex(0, 0, 0, toneCore);
  const discRim: number[] = [];
  for (let i = 0; i < discSegments; i += 1) {
    const angle = (i / discSegments) * TAU;
    discRim.push(pushVertex(Math.cos(angle) * discRadius, 0, Math.sin(angle) * discRadius, toneCore));
  }
  for (let i = 0; i < discSegments; i += 1) {
    const a = discRim[i] as number;
    const b = discRim[(i + 1) % discSegments] as number;
    indices.push(discCenter, a, b);
  }

  // ---- 花盤の種（黄金角フェルマー螺旋、微小な四角形、中間トーン、わずかに +Y） ----
  // 種マーカーの半径は隣接間隔（花盤全体でほぼ一定、およそ 花盤半径÷√種数 に比例）に比例させる。
  const seedMarkerRadius = (seedMarkerFactor * discRadius) / Math.sqrt(seedCount);
  // 最外周の種の中心半径。種マーカーは軸に沿った正方形のため対角の頂点が中心から マーカー半径×√2 離れる。
  // その対角まで花盤の塗りの内側に収めるため、花盤半径から マーカー半径×√2 を引く。
  const seedMaxRadius = discRadius - seedMarkerRadius * Math.SQRT2;
  for (let n = 0; n < seedCount; n += 1) {
    const radius = seedMaxRadius * Math.sqrt(n / (seedCount - 1));
    const angle = n * SUNFLOWER_GOLDEN_ANGLE;
    const cx = Math.cos(angle) * radius;
    const cz = Math.sin(angle) * radius;
    // 軸に沿った微小な正方形（種は小さく、放射方向に厳密でなくても点に見える）。
    const v0 = pushVertex(cx - seedMarkerRadius, SUNFLOWER_SEED_LIFT, cz - seedMarkerRadius, toneSeed);
    const v1 = pushVertex(cx + seedMarkerRadius, SUNFLOWER_SEED_LIFT, cz - seedMarkerRadius, toneSeed);
    const v2 = pushVertex(cx + seedMarkerRadius, SUNFLOWER_SEED_LIFT, cz + seedMarkerRadius, toneSeed);
    const v3 = pushVertex(cx - seedMarkerRadius, SUNFLOWER_SEED_LIFT, cz + seedMarkerRadius, toneSeed);
    indices.push(v0, v1, v2, v0, v2, v3);
  }

  // ---- 花弁（放射状の舌状花、テーパー形、明るいトーン、わずかに +Y） ----
  const angularSpacing = TAU / petalCount;
  const wobbleAmplitude = wobbleFraction * angularSpacing;
  for (let p = 0; p < petalCount; p += 1) {
    const baseAngle = p * angularSpacing;
    // 決定的な微小ゆらぎ。黄金角を掛けた正弦で偏らせ、振幅は角度間隔のゆらぎ割合以下に収める（Math.random 不使用）。
    const wobble = wobbleAmplitude * Math.sin((p + seed) * SUNFLOWER_GOLDEN_ANGLE);
    const theta = baseAngle + wobble;
    const dirX = Math.cos(theta);
    const dirZ = Math.sin(theta);
    const perpX = -Math.sin(theta);
    const perpZ = Math.cos(theta);

    // 段ごとの頂点索引。先端と根元は半幅0で1点に畳み込み、中間は左縁・中央線・右縁の3点にする。
    // 中央線と縁を分けるのは、幅方向に縁を中央線より持ち上げて凹の溝（カップ）を作り、鞍型の曲面にするためである。
    const ringIndices: number[][] = [];
    for (let s = 0; s <= petalSegments; s += 1) {
      const t = s / petalSegments;
      const radius = discRadius + t * petalLength;
      // 根元（s=0）と先端（s=段数）は1点へ畳む。理由を先に述べる。半幅は sin(π×長手位置)^指数 で両端0になるが、
      // 先端の sin(π) は浮動小数では厳密な0でなく微小な正の値になり、ごく近接した2点が縮退三角形を生むため、
      // 両端は段番号で明示的に半幅0として1点に畳む。
      const halfWidth =
        s === 0 || s === petalSegments
          ? 0
          : petalHalfWidth * Math.pow(Math.sin(Math.PI * t), petalTipSharpness);
      const centerX = dirX * radius;
      const centerZ = dirZ * radius;
      // 中央線の高さ＝花弁の基準の持ち上げ（SUNFLOWER_PETAL_LIFT）に、反り（長手方向のアーチ＝sin(π×長手位置)で
      // 中ほどを最も高く、と先端の持ち上げ＝長手位置に比例）を足した値。根元（t=0）はアーチと先端の両項がともに0に
      // なるため、反りは花弁の基準の高さから始まり、根元が花盤の縁の高さから跳ね上がらずに連続する。基準の持ち上げ
      // SUNFLOWER_PETAL_LIFT を残す理由を先に述べる。これは花弁を花盤の塗り（高さ0）よりごくわずかに上へ置いて同一平面の
      // 前後競合（ちらつき）を避けるための微小値で、反りを足す前の平らな花弁と同じ持ち上げである。
      const yCenter =
        SUNFLOWER_PETAL_LIFT +
        SUNFLOWER_PETAL_CURL_HEIGHT * Math.sin(Math.PI * t) +
        SUNFLOWER_PETAL_TIP_RISE * t;
      if (halfWidth <= 0) {
        ringIndices.push([pushVertex(centerX, yCenter, centerZ, tonePetal)]);
      } else {
        // 幅方向のチャンネル。縁を中央線より持ち上げ、半幅が大きい段ほど深い溝にして凹の鞍型にする。
        const halfWidthFraction = halfWidth / petalHalfWidth;
        const yEdge = yCenter + SUNFLOWER_PETAL_CUP_DEPTH * halfWidthFraction * halfWidthFraction;
        const left = pushVertex(
          centerX + perpX * halfWidth,
          yEdge,
          centerZ + perpZ * halfWidth,
          tonePetal
        );
        const center = pushVertex(centerX, yCenter, centerZ, tonePetal);
        const right = pushVertex(
          centerX - perpX * halfWidth,
          yEdge,
          centerZ - perpZ * halfWidth,
          tonePetal
        );
        ringIndices.push([left, center, right]);
      }
    }
    // 隣り合う段をつなぐ。端は1点のため扇、中間は左右2枚の四角形（各2三角形）。縮退三角形は出さない。
    for (let s = 0; s < petalSegments; s += 1) {
      const lower = ringIndices[s] as number[];
      const upper = ringIndices[s + 1] as number[];
      if (lower.length === 1 && upper.length === 3) {
        const p0 = lower[0] as number;
        indices.push(p0, upper[0] as number, upper[1] as number);
        indices.push(p0, upper[1] as number, upper[2] as number);
      } else if (lower.length === 3 && upper.length === 1) {
        const p0 = upper[0] as number;
        indices.push(lower[0] as number, lower[1] as number, p0);
        indices.push(lower[1] as number, lower[2] as number, p0);
      } else if (lower.length === 3 && upper.length === 3) {
        const l0 = lower[0] as number;
        const l1 = lower[1] as number;
        const l2 = lower[2] as number;
        const u0 = upper[0] as number;
        const u1 = upper[1] as number;
        const u2 = upper[2] as number;
        // 左の溝（左縁→中央線）と右の溝（中央線→右縁）。
        indices.push(l0, l1, u1, l0, u1, u0);
        indices.push(l1, l2, u2, l1, u2, u1);
      }
      // 両端がともに1点になる組み合わせは段数2以上では生じない（中間段は必ず3点になる）。
    }
  }

  // ---- 全体半径（全頂点の中心からの水平距離の最大値）と中心花弁比率 ----
  let overallRadius = 0;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i] as number;
    const z = positions[i + 2] as number;
    const horizontal = Math.sqrt(x * x + z * z);
    if (horizontal > overallRadius) {
      overallRadius = horizontal;
    }
  }
  const centerPetalRatio = overallRadius > 0 ? discRadius / overallRadius : 0;

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);

  return { geometry, discRadius, overallRadius, centerPetalRatio, seedCount, petalCount };
}
