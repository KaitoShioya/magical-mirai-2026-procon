// 灯し（ひまわり・蝶）の配置を、カメラ軌跡上のノーツ素案位置から決める曲非依存の純粋関数。Issue #62。
//
// 役割を先に述べる。docs/idea/concept-final.md §5 は、カメラ軌跡が各ノーツに与える素案位置に
// ボロノイ緩和（各点を自分の縄張りの重心へ寄せる操作）を少数回かけ、各点の移動量に上限を設けて
// 全体の形（楽曲ごとのカメラ軌跡が作る分布の形＝個性）を保ちつつ、近すぎる点の塊と空きすぎた局所を
// 均すと定める。本モジュールはこの緩和を行う関数と、緩和の良否を測る検査関数を提供する。
//
// 依存方針の理由を先に述べる。生成層（profiles/generate）は three.js も rendering も実行時に
// 取り込まない（noteTrajectory.ts の前例、architecture.md §5）。座標は ../schema/profileSchema の
// Vec3 型のみを取り込み、湖面領域は描画層の WaterRegion 型ではなく同型の平の数値（LakeRegion）で受ける。
//
// 緩和は水平面（x と z）だけで行い、高さ（y）は素案のまま保つ（§5・§6。ひまわりは真下湖面、蝶は
// 空間上で、水平位置を共有し高さだけを各灯しが持つ）。

import type { Vec3 } from "../schema/profileSchema";

/** 緩和の入力1件。noteTrajectory(#40)の出力 trajectoryPosition をそのまま position に渡す。 */
export interface LanternSeed {
  id: string;
  position: Vec3;
}

/** 湖面領域（矩形）。rendering の WaterRegion を import せず同型の平の数値で受ける（依存規則 §5）。 */
export interface LakeRegion {
  centerX: number;
  centerZ: number;
  /** X方向の一辺（ワールド単位）。 */
  width: number;
  /** Z方向の一辺（ワールド単位）。 */
  depth: number;
}

/** 緩和のオプション。すべて既定値を持ち、横展開時に上書きできる。 */
export interface RelaxOptions {
  /** 緩和回数。既定 DEFAULT_RELAX_OPTIONS.iterations。 */
  iterations?: number;
  /** 素案位置からの総移動量の上限（ワールド単位）。既定は最近傍距離の中央値。 */
  maxTotalMoveFromSeed?: number;
  /** 格子の刻み幅（ワールド単位）。既定は最近傍距離の中央値の3分の1。 */
  gridSpacing?: number;
  /** 格子点数の上限。これを超える場合は刻みを粗くして上限に収める。既定 DEFAULT_RELAX_OPTIONS.maxGridPointCount。 */
  maxGridPointCount?: number;
}

/** 緩和後の灯し1件。水平(x,z)は均し済み・高さ(y)は素案のまま。入力順を保つ。 */
export interface LanternPlacement {
  id: string;
  position: Vec3;
}

/** 灯し分布の統計（受入検査と #101 で用いる）。被覆距離の最大値と最近傍距離の最小・最大は診断値。 */
export interface LanternDistributionMetrics {
  /** 最近傍距離の最小値（診断値）。 */
  nearestNeighborMin: number;
  /** 最近傍距離の中央値。 */
  nearestNeighborMedian: number;
  /** 最近傍距離の最大値（診断値）。 */
  nearestNeighborMax: number;
  /** 最近傍距離の変動係数（標準偏差÷平均）。受入条件1の硬性判定に用いる。 */
  nearestNeighborVariationCoefficient: number;
  /** 被覆距離の95パーセンタイル。受入条件1の硬性判定に用いる。 */
  coverageDistance95thPercentile: number;
  /** 被覆距離の最大値（診断値）。 */
  coverageDistanceMax: number;
}

/** 被覆距離の測定設定。緩和前の入力点から1回求め、緩和の格子割当と緩和前後の被覆距離測定で共用する。
 *  gridSpacing は格子点上限による粗化を適用した後の実効値とする（粗化された場合に前後で同一刻みを使うため）。
 *  activeGridPoints は、各入力点の近傍（活性半径以内）にある格子点のみを集めた集合とする。これにより、
 *  曲線状に密集した灯しの大半が空である外接矩形の遠方は格子割当・被覆測定の対象から外れ、緩和は局所の
 *  塊と空きだけを均し（大域の構造的な空き＝個性を埋めない）、被覆距離も局所の空きだけを測る。 */
export interface LanternMeasurementSpec {
  coverageRegion: LakeRegion;
  /** 格子点上限を適用した後の実効刻み。 */
  gridSpacing: number;
  maxGridPointCount: number;
  /** 各入力点の活性半径以内にある格子点（各格子セルの中心）。緩和の割当と被覆測定で共用する。 */
  activeGridPoints: ReadonlyArray<{ x: number; z: number }>;
}

/** 緩和回数の許容範囲（両端を含む）。理由: concept-final §5 は、完全収束させると整然均一になり楽曲の個性が
 *  消えるため、少数回（2回から4回）で止めて全体の形を保つと定める。1回では局所を均しきれず、5回以上は収束へ
 *  近づいて個性を損なう。よって公開オプションでもこの範囲外の回数を拒否する（tapBudget の比率が範囲外を
 *  例外で拒否する前例に揃える）。 */
export const RELAX_ITERATIONS_MIN = 2;
export const RELAX_ITERATIONS_MAX = 4;

/** 緩和オプションの既定値。 */
export const DEFAULT_RELAX_OPTIONS = {
  // 緩和回数3。理由: concept §5 の範囲（2から4回）の中央で、完全収束させない（個性とゆらぎを残す）。
  iterations: 3,
  // 格子点数の上限15万。理由: 本処理は読み込み時の一度きりだが、端末（スマートフォン主軸）で
  // 読み込みが固まらない格子点数に抑える。
  maxGridPointCount: 150_000,
} as const;

/** 活性半径を基準量（最近傍距離の中央値）の何倍にするか。理由: 各灯しのボロノイ領域（局所の縄張り）と、
 *  局所の空き（最近傍距離の最大値の尺度）を捉えるには、基準量の数倍の半径が要る。基準量の3倍にすると、
 *  実データの最近傍距離の最大値（基準量の概ね3倍未満）までの局所の空きを活性領域が覆い、かつ大域の
 *  構造的な空き（個性）は活性領域の外として埋めない。 */
export const ACTIVE_RADIUS_FACTOR = 3;

/** 受入条件1の相対比較で許す許容誤差。理由: 既に均等な入力では緩和前後の値がほぼ同値になり、
 *  同一の測定設定・同一の手順で測っても浮動小数点の丸めで緩和後が極微小に上回りうる。誤差源は
 *  数値の丸めに限られるため、丸め差だけを吸収する 1e-9 を加える。塊や空きのある入力では緩和後が
 *  緩和前を実質的に下回るため、この許容誤差の影響を受けない。 */
export const METRIC_TOLERANCE = 1e-9;

/** 重心の許容半径の既定割合。理由: docs/research/04 §77 が湖の半径の20パーセントを初期値に定める。 */
export const DEFAULT_CENTROID_ALLOWANCE_FRACTION = 0.2;

interface Point2 {
  x: number;
  z: number;
}

interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} は有限数である必要があるが ${value} が渡された`);
  }
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} は正の有限数である必要があるが ${value} が渡された`);
  }
}

/** 湖面領域の width と depth が正の有限数であることを検査する。 */
function assertRegion(region: LakeRegion, label: string): void {
  assertFinite(region.centerX, `${label} の centerX`);
  assertFinite(region.centerZ, `${label} の centerZ`);
  assertPositiveFinite(region.width, `${label} の width`);
  assertPositiveFinite(region.depth, `${label} の depth`);
}

/** 湖面領域を軸平行の矩形（最小最大）へ変換する。 */
function regionToRect(region: LakeRegion): Rect {
  const halfX = region.width / 2;
  const halfZ = region.depth / 2;
  return {
    minX: region.centerX - halfX,
    maxX: region.centerX + halfX,
    minZ: region.centerZ - halfZ,
    maxZ: region.centerZ + halfZ,
  };
}

/** 矩形を湖面領域（中心と寸法）へ変換する。 */
function rectToRegion(rect: Rect): LakeRegion {
  return {
    centerX: (rect.minX + rect.maxX) / 2,
    centerZ: (rect.minZ + rect.maxZ) / 2,
    width: rect.maxX - rect.minX,
    depth: rect.maxZ - rect.minZ,
  };
}

function clamp(value: number, low: number, high: number): number {
  if (value < low) return low;
  if (value > high) return high;
  return value;
}

/** 点群の水平位置の昇順中央値を返すための小道具。配列を破壊しないため複製してから整列する。 */
function median(sortedAscending: number[]): number {
  const m = sortedAscending.length;
  if (m === 0) return 0;
  const mid = Math.floor(m / 2);
  if (m % 2 === 1) return sortedAscending[mid];
  return (sortedAscending[mid - 1] + sortedAscending[mid]) / 2;
}

/**
 * 一様空間分割による最近傍探索。点群を一辺 bucketSize の格子区画へ振り分け、クエリ点の区画から
 * 外側へ1層ずつ広げて探索する。打ち切りは、既に調べ終えた区画群が成す矩形の境界までの最小距離が
 * 現在の最短距離を厳密に超えた時点で行う（同距離は添字の小さい方を採る決定規則を守るため、等しい
 * 時点では打ち切らずもう1層調べる）。同距離は添字の小さい方を採る。
 */
class NearestPointIndex {
  private readonly buckets = new Map<string, number[]>();
  private readonly bucketSize: number;
  private readonly originX: number;
  private readonly originZ: number;
  private readonly points: readonly Point2[];
  // 全点の区画添字の最小最大。リング探索の上限を、毎回の全点走査ではなく構築時の一度の計算で求めるため保持する。
  private minBx = 0;
  private maxBx = 0;
  private minBz = 0;
  private maxBz = 0;

  constructor(points: readonly Point2[], bucketSize: number, originX: number, originZ: number) {
    this.points = points;
    this.bucketSize = bucketSize;
    this.originX = originX;
    this.originZ = originZ;
    for (let i = 0; i < points.length; i += 1) {
      const bx = this.bucketX(points[i].x);
      const bz = this.bucketZ(points[i].z);
      if (i === 0) {
        this.minBx = bx;
        this.maxBx = bx;
        this.minBz = bz;
        this.maxBz = bz;
      } else {
        if (bx < this.minBx) this.minBx = bx;
        if (bx > this.maxBx) this.maxBx = bx;
        if (bz < this.minBz) this.minBz = bz;
        if (bz > this.maxBz) this.maxBz = bz;
      }
      const key = this.bucketKey(bx, bz);
      const list = this.buckets.get(key);
      if (list === undefined) this.buckets.set(key, [i]);
      else list.push(i);
    }
  }

  private bucketX(x: number): number {
    return Math.floor((x - this.originX) / this.bucketSize);
  }

  private bucketZ(z: number): number {
    return Math.floor((z - this.originZ) / this.bucketSize);
  }

  private bucketKey(bx: number, bz: number): string {
    return `${bx},${bz}`;
  }

  /** クエリ点に最も近い点の添字を返す。同距離は添字の小さい方。点が空のときは -1 を返す。 */
  nearest(qx: number, qz: number): number {
    if (this.points.length === 0) return -1;
    const qbx = this.bucketX(qx);
    const qbz = this.bucketZ(qz);
    let bestIndex = -1;
    let bestDist = Number.POSITIVE_INFINITY;

    // 探索済みの最大リング番号。点群全体を必ず覆う上限で安全に止める。
    const maxRing = this.maxRingBound(qbx, qbz);
    for (let r = 0; r <= maxRing; r += 1) {
      this.scanRing(qbx, qbz, r, qx, qz, (dist, index) => {
        if (dist < bestDist || (dist === bestDist && index < bestIndex)) {
          bestDist = dist;
          bestIndex = index;
        }
      });
      // 既探索の区画群 [qbx-r, qbx+r] × [qbz-r, qbz+r] の世界座標の境界までの最小距離。
      // 未探索の区画はこの矩形の外側に始まるため、これが未探索区画にある点までの距離の下界になる。
      const blockMinX = (qbx - r) * this.bucketSize + this.originX;
      const blockMaxX = (qbx + r + 1) * this.bucketSize + this.originX;
      const blockMinZ = (qbz - r) * this.bucketSize + this.originZ;
      const blockMaxZ = (qbz + r + 1) * this.bucketSize + this.originZ;
      const lowerBound = Math.min(qx - blockMinX, blockMaxX - qx, qz - blockMinZ, blockMaxZ - qz);
      // 厳密超過で打ち切る。等しい時点で止めると、未探索区画にある同距離・添字の小さい点を見落とす。
      if (bestIndex !== -1 && lowerBound > bestDist) break;
    }
    return bestIndex;
  }

  /** 全点を必ず覆うリング番号の上限。構築時に求めた全点の区画範囲を、クエリ区画から測った最大の区画距離で
   *  与える（毎回の全点走査を避けるため一定時間で求める）。距離の下界による打ち切りが通常はこの上限より早く
   *  働くため、この上限は安全のための背止めである。 */
  private maxRingBound(qbx: number, qbz: number): number {
    const xSpan = Math.max(qbx - this.minBx, this.maxBx - qbx);
    const zSpan = Math.max(qbz - this.minBz, this.maxBz - qbz);
    return Math.max(xSpan, zSpan, 0);
  }

  /** チェビシェフ距離 r の区画リング（r=0 は中心区画のみ）の各点を走査する。 */
  private scanRing(
    qbx: number,
    qbz: number,
    r: number,
    qx: number,
    qz: number,
    visit: (dist: number, index: number) => void,
  ): void {
    const visitBucket = (bx: number, bz: number): void => {
      const list = this.buckets.get(this.bucketKey(bx, bz));
      if (list === undefined) return;
      for (const index of list) {
        const dx = this.points[index].x - qx;
        const dz = this.points[index].z - qz;
        visit(Math.sqrt(dx * dx + dz * dz), index);
      }
    };
    if (r === 0) {
      visitBucket(qbx, qbz);
      return;
    }
    for (let bx = qbx - r; bx <= qbx + r; bx += 1) {
      visitBucket(bx, qbz - r);
      visitBucket(bx, qbz + r);
    }
    for (let bz = qbz - r + 1; bz <= qbz + r - 1; bz += 1) {
      visitBucket(qbx - r, bz);
      visitBucket(qbx + r, bz);
    }
  }
}

/** 点群（水平面）の各点について最も近い別の点までの距離を返す。点が2個未満のときは空配列。
 *  点数は灯し規模（数百）のため総当たり（点数の2乗）で十分に速く、最も確実に最近傍を得る。 */
function nearestNeighborDistances(points: readonly Point2[]): number[] {
  const distances: number[] = [];
  for (let i = 0; i < points.length; i += 1) {
    let best = Number.POSITIVE_INFINITY;
    const px = points[i].x;
    const pz = points[i].z;
    for (let j = 0; j < points.length; j += 1) {
      if (j === i) continue;
      const dx = points[j].x - px;
      const dz = points[j].z - pz;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < best) best = dist;
    }
    distances.push(best);
  }
  return distances;
}

function toPoint2(seeds: readonly LanternSeed[]): Point2[] {
  return seeds.map((seed) => ({ x: seed.position.x, z: seed.position.z }));
}

function boundingRect(points: readonly Point2[]): Rect {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.z < minZ) minZ = point.z;
    if (point.z > maxZ) maxZ = point.z;
  }
  return { minX, maxX, minZ, maxZ };
}

function intersectRect(a: Rect, b: Rect): Rect {
  return {
    minX: Math.max(a.minX, b.minX),
    maxX: Math.min(a.maxX, b.maxX),
    minZ: Math.max(a.minZ, b.minZ),
    maxZ: Math.min(a.maxZ, b.maxZ),
  };
}

/** 点群の水平位置の最近傍距離の中央値。緩和の基準量（移動量上限・格子刻み・区画寸法の基準）。
 *  2点以上を前提とする（呼び出し側で点数を保証する）。 */
function medianNearestNeighbor(points: readonly Point2[]): number {
  const sorted = [...nearestNeighborDistances(points)].sort((p, q) => p - q);
  return median(sorted);
}

/** 点群の各点の水平座標が有限数であることを検査する。 */
function assertPointsFinite(points: readonly Point2[], label: string): void {
  for (let i = 0; i < points.length; i += 1) {
    assertFinite(points[i].x, `${label}[${i}] の x`);
    assertFinite(points[i].z, `${label}[${i}] の z`);
  }
}

/** 点群の各点が湖面矩形の内側にあることを検査する。 */
function assertPointsWithinRect(points: readonly Point2[], rect: Rect, label: string): void {
  for (let i = 0; i < points.length; i += 1) {
    const { x, z } = points[i];
    if (x < rect.minX || x > rect.maxX || z < rect.minZ || z > rect.maxZ) {
      throw new Error(
        `${label}[${i}] の水平位置 (x=${x}, z=${z}) が湖面領域の矩形 ` +
          `[${rect.minX}, ${rect.maxX}] × [${rect.minZ}, ${rect.maxZ}] の外にある`,
      );
    }
  }
}

/** 点群の最近傍距離の並び（昇順）を返す。同一水平位置の組（最近傍距離が0）があれば例外を投げる。
 *  理由: 格子割当では同距離を添字の小さい方へ寄せるため、完全に同一位置の点のうち添字の大きい方は
 *  割り当て格子が0個になって動かず塊が残る。これは受入条件1に反するため発生源で拒否する。 */
function sortedNearestNeighborOrThrow(points: readonly Point2[]): number[] {
  const distances = nearestNeighborDistances(points);
  let minNN = Number.POSITIVE_INFINITY;
  for (const d of distances) if (d < minNN) minNN = d;
  if (!(minNN > 0)) {
    throw new Error("同一水平位置の点が存在する（最近傍距離が0）。格子割当では完全に同一位置の点を分離できないため、緩和前に分離しておく必要がある");
  }
  return distances.sort((a, b) => a - b);
}

/**
 * 緩和の作業領域と被覆距離の測定設定を、緩和前の入力点から算出する。
 *
 * 入力は必ず緩和前の入力点とする。理由を先に述べる。余白と格子刻みを緩和前の基準量（最近傍距離の
 * 中央値）から決め、緩和前後で同一の被覆領域と実効格子刻みを用いて相対比較を成立させるためである。
 *
 * 作業領域は、点群の外接矩形を基準量の半分だけ各辺の外側へ広げ、湖面領域の矩形で切った範囲とする
 * （余白を基準量の半分にする理由は本文の padding の箇所に詳述する）。
 * 湖面矩形で切るのは作業領域が湖の外へはみ出さないようにするためである。
 *
 * 実効格子刻みは、既定（基準量の3分の1）または指定値で求めた格子点数が上限を超える場合に、
 * 上限ちょうどに収まる刻みへ粗くした値を返す。粗化後の刻みを返すことで、緩和と測定が同一の格子を使う。
 */
export function computeLanternMeasurementSpec(
  seeds: readonly LanternSeed[],
  region: LakeRegion,
  options?: { gridSpacing?: number; maxGridPointCount?: number },
): LanternMeasurementSpec {
  assertRegion(region, "湖面領域");
  if (seeds.length < 2) {
    throw new Error(`測定設定の算出には2点以上が必要だが ${seeds.length} 点が渡された`);
  }
  const maxGridPointCount = options?.maxGridPointCount ?? DEFAULT_RELAX_OPTIONS.maxGridPointCount;
  assertPositiveFinite(maxGridPointCount, "maxGridPointCount");

  const lakeRect = regionToRect(region);
  const points = toPoint2(seeds);
  // #101 が本関数を直接呼ぶため、relaxLanternPlacement と同じ基準で異常入力を拒否する。
  assertPointsFinite(points, "入力点");
  assertPointsWithinRect(points, lakeRect, "入力点");
  const basis = median(sortedNearestNeighborOrThrow(points));

  // 作業領域＝外接矩形＋余白（基準量の半分）∩ 湖面矩形。
  // 余白を基準量の半分にする理由を先に述べる。均等に並んだ点のボロノイ領域は一辺が典型間隔（基準量）の
  // 正方形になる。境界を外縁点から典型間隔の半分だけ外側に置くと、外縁点のボロノイ領域が対称な満杯の
  // セルになり、その重心が点自身と一致する。これにより均等な配置は緩和で動かない不動点になり、外縁点が
  // 外へ膨らんで輪郭（個性）が広がることも、余白を0にして外縁セルが切り詰められ輪郭が縮むことも避けられる。
  const padding = basis / 2;
  const bbox = boundingRect(points);
  const padded: Rect = {
    minX: bbox.minX - padding,
    maxX: bbox.maxX + padding,
    minZ: bbox.minZ - padding,
    maxZ: bbox.maxZ + padding,
  };
  const work = intersectRect(padded, lakeRect);

  // 格子刻み。既定は基準量の3分の1。理由: 点間隔に対し格子を3分の1の細かさにすると、どの位置が
  // どの点に最も近いかを点間隔より細かく判定でき、縄張りの重心を安定して近似できる。
  let gridSpacing = options?.gridSpacing ?? basis / 3;
  assertPositiveFinite(gridSpacing, "gridSpacing");

  const workWidth = work.maxX - work.minX;
  const workDepth = work.maxZ - work.minZ;
  // 格子点上限を超える場合、面積を上限で割った平方根まで刻みを粗くする（点数を上限に収める）。
  const projectedCount = Math.ceil(workWidth / gridSpacing) * Math.ceil(workDepth / gridSpacing);
  if (projectedCount > maxGridPointCount) {
    gridSpacing = Math.sqrt((workWidth * workDepth) / maxGridPointCount);
  }

  const coverageRegion = rectToRegion(work);
  const activeRadius = basis * ACTIVE_RADIUS_FACTOR;
  const activeGridPoints = buildActiveGridPoints(coverageRegion, gridSpacing, points, activeRadius);
  return { coverageRegion, gridSpacing, maxGridPointCount, activeGridPoints };
}

/**
 * 被覆領域を格子刻みで等分した格子のうち、いずれかの seed の活性半径以内にある格子点（セル中心）を返す。
 * 全格子を作らず各 seed の周囲の格子セルだけを刻印（スタンプ）して集めるため、外接矩形の遠方の空セルを
 * 作らず計算量を活性セル数に比例させる。重複は (ix, iz) の格子添字で取り除き、走査順（iz 昇順・ix 昇順）で
 * 決定論的に返す。
 */
function buildActiveGridPoints(
  region: LakeRegion,
  gridSpacing: number,
  seeds: readonly Point2[],
  activeRadius: number,
): Point2[] {
  const rect = regionToRect(region);
  const width = rect.maxX - rect.minX;
  const depth = rect.maxZ - rect.minZ;
  const nx = Math.max(1, Math.round(width / gridSpacing));
  const nz = Math.max(1, Math.round(depth / gridSpacing));
  const cellW = width / nx;
  const cellD = depth / nz;
  const activeRadiusSq = activeRadius * activeRadius;

  const cellX = (ix: number): number => rect.minX + (ix + 0.5) * cellW;
  const cellZ = (iz: number): number => rect.minZ + (iz + 0.5) * cellD;

  // 活性セルの格子添字を集める（重複排除）。
  const activeKeys = new Set<number>();
  for (const seed of seeds) {
    const ixLow = Math.max(0, Math.floor((seed.x - activeRadius - rect.minX) / cellW));
    const ixHigh = Math.min(nx - 1, Math.ceil((seed.x + activeRadius - rect.minX) / cellW));
    const izLow = Math.max(0, Math.floor((seed.z - activeRadius - rect.minZ) / cellD));
    const izHigh = Math.min(nz - 1, Math.ceil((seed.z + activeRadius - rect.minZ) / cellD));
    for (let iz = izLow; iz <= izHigh; iz += 1) {
      const z = cellZ(iz);
      const dz = z - seed.z;
      for (let ix = ixLow; ix <= ixHigh; ix += 1) {
        const x = cellX(ix);
        const dx = x - seed.x;
        if (dx * dx + dz * dz <= activeRadiusSq) {
          activeKeys.add(iz * nx + ix);
        }
      }
    }
  }

  // 走査順（iz 昇順・ix 昇順）で決定論的に座標へ変換する。
  const keys = [...activeKeys].sort((a, b) => a - b);
  return keys.map((key) => {
    const iz = Math.floor(key / nx);
    const ix = key - iz * nx;
    return { x: cellX(ix), z: cellZ(iz) };
  });
}

/** 昇順整列済み配列の p パーセンタイル（最近接順位法）。p は0以上100以下。 */
function percentile(sortedAscending: number[], p: number): number {
  const m = sortedAscending.length;
  if (m === 0) return 0;
  // 最近接順位法: 順位 = ceil(p/100 × m)。1以上 m 以下にclampし、0始まりの添字へ。
  const rank = Math.ceil((p / 100) * m);
  const index = clamp(rank, 1, m) - 1;
  return sortedAscending[index];
}

/**
 * 点群の最近傍距離統計と、測定設定での被覆距離統計を返す。測定設定は緩和前後で同一のものを渡す。
 * 被覆距離は、測定設定の格子点それぞれから最も近い点（灯し）までの水平距離である。
 */
export function measureLanternDistribution(
  points: readonly Vec3[],
  spec: LanternMeasurementSpec,
): LanternDistributionMetrics {
  if (points.length < 2) {
    throw new Error(`分布の測定には2点以上が必要だが ${points.length} 点が渡された`);
  }
  assertRegion(spec.coverageRegion, "測定設定の被覆領域");
  assertPositiveFinite(spec.gridSpacing, "測定設定の gridSpacing");
  // 活性格子点が空だと被覆距離が測れず、合格側へ倒れて品質ゲートが空振りする。発生源で拒否する。
  if (spec.activeGridPoints.length === 0) {
    throw new Error("測定設定の活性格子点が空である（被覆距離を測れない）");
  }

  const pts2: Point2[] = points.map((p) => ({ x: p.x, z: p.z }));
  // 点座標が非有限だと距離が NaN になり、合格側へ倒れて品質ゲートが空振りする。発生源で拒否する。
  assertPointsFinite(pts2, "測定対象の点");
  for (let i = 0; i < spec.activeGridPoints.length; i += 1) {
    assertFinite(spec.activeGridPoints[i].x, `測定設定の活性格子点[${i}] の x`);
    assertFinite(spec.activeGridPoints[i].z, `測定設定の活性格子点[${i}] の z`);
  }
  const coverRect = regionToRect(spec.coverageRegion);

  // 最近傍距離統計。
  const nn = nearestNeighborDistances(pts2).slice().sort((a, b) => a - b);
  const nnMin = nn[0];
  const nnMax = nn[nn.length - 1];
  const nnMedian = median(nn);
  const mean = nn.reduce((s, v) => s + v, 0) / nn.length;
  const variance = nn.reduce((s, v) => s + (v - mean) * (v - mean), 0) / nn.length;
  const sd = Math.sqrt(variance);
  const variationCoefficient = mean > 0 ? sd / mean : 0;

  // 被覆距離統計。活性格子点ごとに最近傍の灯しまでの距離。活性格子点は緩和前の入力点から決めた集合で、
  // 緩和前後で同一のものを用いる（相対比較を成立させるため）。区画の一辺は基準量に近い実効格子刻みを用いる。
  const lanternIndex = new NearestPointIndex(pts2, Math.max(spec.gridSpacing, 1e-6), coverRect.minX, coverRect.minZ);
  const coverage: number[] = [];
  for (const g of spec.activeGridPoints) {
    const nearest = lanternIndex.nearest(g.x, g.z);
    const dx = pts2[nearest].x - g.x;
    const dz = pts2[nearest].z - g.z;
    coverage.push(Math.sqrt(dx * dx + dz * dz));
  }
  coverage.sort((a, b) => a - b);

  return {
    nearestNeighborMin: nnMin,
    nearestNeighborMedian: nnMedian,
    nearestNeighborMax: nnMax,
    nearestNeighborVariationCoefficient: variationCoefficient,
    coverageDistance95thPercentile: percentile(coverage, 95),
    coverageDistanceMax: coverage[coverage.length - 1],
  };
}

/** 水平面で query に最も近い点の添字を返す（同距離は添字の小さい方）。空間分割の最近傍探索の
 *  正しさ（特に区画リングの打ち切りで外側の近い点を見落とさないこと）を単体検証するために公開する。 */
export function findNearestLanternIndex(points: readonly Vec3[], query: Vec3): number {
  if (points.length === 0) return -1;
  const pts2: Point2[] = points.map((p) => ({ x: p.x, z: p.z }));
  const rect = boundingRect(pts2);
  // 区画の一辺は典型的な点間隔（最近傍距離の中央値）。1点のみのときは矩形寸法から正の値を作る。
  const bucket = points.length >= 2 ? Math.max(medianNearestNeighbor(pts2), 1e-6) : Math.max(rect.maxX - rect.minX, rect.maxZ - rect.minZ, 1);
  const index = new NearestPointIndex(pts2, bucket, rect.minX, rect.minZ);
  return index.nearest(query.x, query.z);
}

/** 湖の代表半径（research/04 §77 の「湖の半径」初期定義）。水面矩形の内接円半径＝短辺の半分。
 *  理由: 重心は湖内に収まる円内に在るべきで、水面矩形に内接する最大の円の半径が最も保守的な「湖の半径」。 */
export function representativeLakeRadius(region: LakeRegion): number {
  assertRegion(region, "湖面領域");
  return Math.min(region.width, region.depth) / 2;
}

/** 灯しの重心が、湖の中心（領域の中心）から代表半径の指定割合以内にあるか。割合の既定は0.2。 */
export function isCentroidWithinLakeAllowance(
  points: readonly Vec3[],
  region: LakeRegion,
  fraction: number = DEFAULT_CENTROID_ALLOWANCE_FRACTION,
): boolean {
  assertRegion(region, "湖面領域");
  assertPositiveFinite(fraction, "fraction");
  if (points.length === 0) {
    throw new Error("重心判定には1点以上が必要だが 0 点が渡された");
  }
  let sumX = 0;
  let sumZ = 0;
  for (const p of points) {
    assertFinite(p.x, "点の x");
    assertFinite(p.z, "点の z");
    sumX += p.x;
    sumZ += p.z;
  }
  const centroidX = sumX / points.length;
  const centroidZ = sumZ / points.length;
  const dx = centroidX - region.centerX;
  const dz = centroidZ - region.centerZ;
  const distance = Math.sqrt(dx * dx + dz * dz);
  return distance <= representativeLakeRadius(region) * fraction;
}

/** ベクトル (vx, vz) の長さが maxLen を超える場合、長さ maxLen に縮めて返す。 */
function capVector(vx: number, vz: number, maxLen: number): Point2 {
  const len = Math.sqrt(vx * vx + vz * vz);
  if (len <= maxLen || len === 0) return { x: vx, z: vz };
  const scale = maxLen / len;
  return { x: vx * scale, z: vz * scale };
}

/**
 * 素案位置にボロノイ緩和（格子離散化による近似Lloyd）を少数回かけ、灯しの配置を均して返す。
 *
 * 手順の要点。第1に入力検証（識別子・座標・領域・回数・上限・刻み・seed が湖面矩形内）。第2に退化処理
 * （0個は空、1個は不変、同一水平位置の組が1組でもあれば例外）。第3に作業領域と格子刻みを
 * computeLanternMeasurementSpec で決める（緩和と測定で格子を一致させる）。第4に各回、格子点を最近傍の
 * 灯しへ割り当て各灯しを縄張りの重心へ移し、総移動量上限と湖面矩形内へ収める。第5に最終で重心を緩和前へ
 * 戻し、総移動量上限・湖面矩形内を再適用する（優先順位は 湖面矩形内＞総移動量上限＞重心保存）。
 */
export function relaxLanternPlacement(
  seeds: readonly LanternSeed[],
  region: LakeRegion,
  options?: RelaxOptions,
): LanternPlacement[] {
  assertRegion(region, "湖面領域");
  const iterations = options?.iterations ?? DEFAULT_RELAX_OPTIONS.iterations;
  if (!Number.isInteger(iterations) || iterations < RELAX_ITERATIONS_MIN || iterations > RELAX_ITERATIONS_MAX) {
    throw new Error(
      `iterations は ${RELAX_ITERATIONS_MIN} 以上 ${RELAX_ITERATIONS_MAX} 以下の整数である必要があるが ${iterations} が渡された`,
    );
  }

  // 識別子・座標の検査。
  const seen = new Set<string>();
  for (let i = 0; i < seeds.length; i += 1) {
    const seed = seeds[i];
    if (typeof seed.id !== "string" || seed.id.length === 0) {
      throw new Error(`灯し[${i}] の id は空でない文字列である必要があるが ${JSON.stringify(seed.id)} が渡された`);
    }
    if (seen.has(seed.id)) {
      throw new Error(`灯しの id が重複している: ${seed.id}`);
    }
    seen.add(seed.id);
    assertFinite(seed.position.x, `灯し id=${seed.id} の position.x`);
    assertFinite(seed.position.y, `灯し id=${seed.id} の position.y`);
    assertFinite(seed.position.z, `灯し id=${seed.id} の position.z`);
  }

  // 退化処理。0個と1個は緩和の対象が無い。
  if (seeds.length === 0) return [];
  if (seeds.length === 1) {
    const s = seeds[0];
    return [{ id: s.id, position: { x: s.position.x, y: s.position.y, z: s.position.z } }];
  }

  if (options?.maxTotalMoveFromSeed !== undefined) {
    assertPositiveFinite(options.maxTotalMoveFromSeed, "maxTotalMoveFromSeed");
  }
  if (options?.gridSpacing !== undefined) {
    assertPositiveFinite(options.gridSpacing, "gridSpacing");
  }

  const lakeRect = regionToRect(region);

  // seed が湖面矩形内であることの検査。理由: 湖面の外の素案は、最終に湖面矩形内へ収める拘束（最優先）と
  // 総移動量上限（次の優先）を両立できず緩和の意味が失われ、ひまわりが湖面に浮かぶ仕様（§6）にも反する。
  for (let i = 0; i < seeds.length; i += 1) {
    const { x, z } = seeds[i].position;
    if (x < lakeRect.minX || x > lakeRect.maxX || z < lakeRect.minZ || z > lakeRect.maxZ) {
      throw new Error(
        `灯し id=${seeds[i].id} の水平位置 (x=${x}, z=${z}) が湖面領域の矩形 ` +
          `[${lakeRect.minX}, ${lakeRect.maxX}] × [${lakeRect.minZ}, ${lakeRect.maxZ}] の外にある`,
      );
    }
  }

  const seedPts = toPoint2(seeds);

  // 基準量＝最近傍距離の中央値。同一水平位置の組が1組でもあれば（最近傍距離0が存在すれば）例外。
  const basis = median(sortedNearestNeighborOrThrow(seedPts));

  const maxTotalMove = options?.maxTotalMoveFromSeed ?? basis;
  const spec = computeLanternMeasurementSpec(seeds, region, {
    gridSpacing: options?.gridSpacing,
    maxGridPointCount: options?.maxGridPointCount,
  });
  const gridPoints = spec.activeGridPoints;
  const coverRect = regionToRect(spec.coverageRegion);

  // 緩和前の重心（最終の重心復元で戻す目標）。
  let originalSumX = 0;
  let originalSumZ = 0;
  for (const p of seedPts) {
    originalSumX += p.x;
    originalSumZ += p.z;
  }
  const originalCentroidX = originalSumX / seedPts.length;
  const originalCentroidZ = originalSumZ / seedPts.length;

  // 現在位置（緩和で更新する）。素案位置（移動量上限の基準）は seedPts を保持する。
  const current: Point2[] = seedPts.map((p) => ({ x: p.x, z: p.z }));

  const applyMoveCapAndRegion = (i: number, cx: number, cz: number): Point2 => {
    // 適用順: 総移動量上限 → 湖面矩形内（後に適用する拘束ほど優先される）。
    const capped = capVector(cx - seedPts[i].x, cz - seedPts[i].z, maxTotalMove);
    const movedX = seedPts[i].x + capped.x;
    const movedZ = seedPts[i].z + capped.z;
    return {
      x: clamp(movedX, lakeRect.minX, lakeRect.maxX),
      z: clamp(movedZ, lakeRect.minZ, lakeRect.maxZ),
    };
  };

  for (let iter = 0; iter < iterations; iter += 1) {
    // 現在位置の空間分割。区画の一辺を基準量にすると各区画の灯し数が概ね一定になる。
    const index = new NearestPointIndex(current, basis, coverRect.minX, coverRect.minZ);
    const sumX = new Float64Array(current.length);
    const sumZ = new Float64Array(current.length);
    const count = new Int32Array(current.length);
    for (const g of gridPoints) {
      const nearest = index.nearest(g.x, g.z);
      sumX[nearest] += g.x;
      sumZ[nearest] += g.z;
      count[nearest] += 1;
    }
    for (let i = 0; i < current.length; i += 1) {
      if (count[i] === 0) continue; // 縄張りが空の灯しは目標が未定義なので動かさない。
      const targetX = sumX[i] / count[i];
      const targetZ = sumZ[i] / count[i];
      const next = applyMoveCapAndRegion(i, targetX, targetZ);
      current[i] = next;
    }
  }

  // 最終の重心復元。緩和後の重心を緩和前へ戻す平行移動を行い、総移動量上限と湖面矩形内を再適用する。
  let curSumX = 0;
  let curSumZ = 0;
  for (const p of current) {
    curSumX += p.x;
    curSumZ += p.z;
  }
  const driftX = curSumX / current.length - originalCentroidX;
  const driftZ = curSumZ / current.length - originalCentroidZ;
  for (let i = 0; i < current.length; i += 1) {
    const shiftedX = current[i].x - driftX;
    const shiftedZ = current[i].z - driftZ;
    current[i] = applyMoveCapAndRegion(i, shiftedX, shiftedZ);
  }

  return seeds.map((seed, i) => ({
    id: seed.id,
    position: { x: current[i].x, y: seed.position.y, z: current[i].z },
  }));
}
