import { describe, expect, it } from "vitest";
import type { Vec3 } from "../schema/profileSchema";
import {
  computeLanternMeasurementSpec,
  DEFAULT_RELAX_OPTIONS,
  findNearestLanternIndex,
  isCentroidWithinLakeAllowance,
  type LakeRegion,
  type LanternSeed,
  measureLanternDistribution,
  METRIC_TOLERANCE,
  relaxLanternPlacement,
  representativeLakeRadius,
} from "./lanternPlacement";

// 原点中心・一辺200の湖面領域を既定の検査領域とする。
const REGION: LakeRegion = { centerX: 0, centerZ: 0, width: 200, depth: 200 };

/** 識別子付きの灯し素案を作る補助。識別子は添字から決定論的に作る。 */
function seedsFrom(positions: ReadonlyArray<[number, number, number]>): LanternSeed[] {
  return positions.map(([x, y, z], i) => ({ id: `n${i}`, position: { x, y, z } }));
}

/** x,z の正方格子（spacing 刻み、count×count 個）を中心0付近に作る。高さは添字で変える。 */
function squareGrid(count: number, spacing: number): LanternSeed[] {
  const positions: Array<[number, number, number]> = [];
  const offset = ((count - 1) * spacing) / 2;
  for (let iz = 0; iz < count; iz += 1) {
    for (let ix = 0; ix < count; ix += 1) {
      positions.push([ix * spacing - offset, 1 + (iz * count + ix) * 0.01, iz * spacing - offset]);
    }
  }
  return seedsFrom(positions);
}

function distance2(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

describe("relaxLanternPlacement の退化入力（Issue #62）", () => {
  it("0個の入力は空配列を返す", () => {
    expect(relaxLanternPlacement([], REGION)).toEqual([]);
  });

  it("1個の入力は素案のまま返す（均す相手が無い）", () => {
    const seeds = seedsFrom([[3, 7, -4]]);
    expect(relaxLanternPlacement(seeds, REGION)).toEqual([
      { id: "n0", position: { x: 3, y: 7, z: -4 } },
    ]);
  });

  it("同一水平位置の組が1組でもあれば例外（格子割当では完全同一点を分離できないため）", () => {
    // 高さ(y)が違っても水平位置(x,z)が同一なら最近傍距離0になり拒否する。
    const seeds = seedsFrom([
      [0, 1, 0],
      [0, 5, 0],
      [10, 1, 10],
    ]);
    expect(() => relaxLanternPlacement(seeds, REGION)).toThrow(/同一水平位置/);
  });
});

describe("relaxLanternPlacement の不変量（Issue #62）", () => {
  it("高さ(y)を素案のまま保ち、入力順と識別子を保つ", () => {
    const seeds = squareGrid(5, 4);
    const out = relaxLanternPlacement(seeds, REGION);
    expect(out.map((p) => p.id)).toEqual(seeds.map((s) => s.id));
    for (let i = 0; i < seeds.length; i += 1) {
      expect(out[i].position.y).toBe(seeds[i].position.y);
    }
  });

  it("同一入力で2回実行すると結果が一致する（決定論）", () => {
    const seeds = squareGrid(5, 4);
    const a = relaxLanternPlacement(seeds, REGION);
    const b = relaxLanternPlacement(seeds, REGION);
    expect(a).toEqual(b);
  });

  it("どの点も素案位置から総移動量上限を超えて動かない", () => {
    const seeds = squareGrid(5, 4);
    // 既定の総移動量上限は最近傍距離の中央値。均等格子では中央値=4。
    const out = relaxLanternPlacement(seeds, REGION);
    for (let i = 0; i < seeds.length; i += 1) {
      expect(distance2(out[i].position, seeds[i].position)).toBeLessThanOrEqual(4 + 1e-6);
    }
  });

  it("総移動量上限を引数で指定すると、その上限を超えて動かない", () => {
    const seeds = squareGrid(5, 4);
    const cap = 0.5;
    const out = relaxLanternPlacement(seeds, REGION, { maxTotalMoveFromSeed: cap });
    for (let i = 0; i < seeds.length; i += 1) {
      expect(distance2(out[i].position, seeds[i].position)).toBeLessThanOrEqual(cap + 1e-6);
    }
  });

  it("全出力が湖面領域の矩形内に収まる", () => {
    const seeds = squareGrid(5, 4);
    const out = relaxLanternPlacement(seeds, REGION);
    for (const p of out) {
      expect(p.position.x).toBeGreaterThanOrEqual(-100 - 1e-9);
      expect(p.position.x).toBeLessThanOrEqual(100 + 1e-9);
      expect(p.position.z).toBeGreaterThanOrEqual(-100 - 1e-9);
      expect(p.position.z).toBeLessThanOrEqual(100 + 1e-9);
    }
  });

  it("緩和が重心を保存する（緩和後の重心が緩和前の重心から基準量以内）", () => {
    const seeds = squareGrid(6, 3);
    const out = relaxLanternPlacement(seeds, REGION);
    const before = centroidXZ(seeds.map((s) => s.position));
    const after = centroidXZ(out.map((p) => p.position));
    const basis = 3; // 均等格子3刻みの最近傍距離の中央値。
    expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThanOrEqual(basis + 1e-9);
  });
});

function centroidXZ(points: ReadonlyArray<Vec3>): { x: number; z: number } {
  let sx = 0;
  let sz = 0;
  for (const p of points) {
    sx += p.x;
    sz += p.z;
  }
  return { x: sx / points.length, z: sz / points.length };
}

describe("relaxLanternPlacement の受入条件1（空白も塊も無い、Issue #62）", () => {
  it("既に均等な格子では、緩和後に変動係数と被覆距離の95パーセンタイルが増えない（悪化しない）", () => {
    const seeds = squareGrid(6, 4);
    const spec = computeLanternMeasurementSpec(seeds, REGION);
    const before = measureLanternDistribution(seeds.map((s) => s.position), spec);
    const out = relaxLanternPlacement(seeds, REGION);
    const after = measureLanternDistribution(out.map((p) => p.position), spec);
    expect(after.nearestNeighborVariationCoefficient).toBeLessThanOrEqual(
      before.nearestNeighborVariationCoefficient + METRIC_TOLERANCE,
    );
    expect(after.coverageDistance95thPercentile).toBeLessThanOrEqual(
      before.coverageDistance95thPercentile + METRIC_TOLERANCE,
    );
  });

  it("塊（過度に近い点の対）があると、緩和後に最近傍距離の変動係数が下がる", () => {
    // 均等格子のうち1点を隣の点へ寄せて塊を作る。
    const seeds = squareGrid(6, 4);
    seeds[7] = { id: seeds[7].id, position: { x: seeds[6].position.x + 0.2, y: seeds[7].position.y, z: seeds[6].position.z } };
    const spec = computeLanternMeasurementSpec(seeds, REGION);
    const before = measureLanternDistribution(seeds.map((s) => s.position), spec);
    const out = relaxLanternPlacement(seeds, REGION);
    const after = measureLanternDistribution(out.map((p) => p.position), spec);
    expect(after.nearestNeighborVariationCoefficient).toBeLessThan(
      before.nearestNeighborVariationCoefficient,
    );
  });

  it("局所の空き（格子の中央に穴）があると、緩和後に被覆距離の95パーセンタイルが下がる", () => {
    // 7×7の均等格子（刻み2）から中央の3×3を抜いて、フィールド内部に局所の穴を作る。
    // 穴の周囲の点が穴側へ寄り、穴が縮むことで被覆距離の95パーセンタイルが下がる。
    const all = squareGrid(7, 2);
    const seeds = all.filter((s) => !(Math.abs(s.position.x) <= 2 + 1e-9 && Math.abs(s.position.z) <= 2 + 1e-9));
    const spec = computeLanternMeasurementSpec(seeds, REGION);
    const before = measureLanternDistribution(seeds.map((s) => s.position), spec);
    const out = relaxLanternPlacement(seeds, REGION);
    const after = measureLanternDistribution(out.map((p) => p.position), spec);
    expect(after.coverageDistance95thPercentile).toBeLessThan(before.coverageDistance95thPercentile);
  });
});

describe("最近傍探索の正しさ（Issue #62）", () => {
  it("多数のクエリで、空間分割の最近傍が総当たりの最近傍（同距離は添字小）と一致する", () => {
    // 不規則だが決定論的な点群。区画の内外で近い点・遠い点が混在する配置。
    const points: Vec3[] = [];
    for (let i = 0; i < 60; i += 1) {
      const x = ((i * 37) % 100) - 50 + (i % 5) * 0.3;
      const z = ((i * 53) % 100) - 50 + (i % 7) * 0.2;
      points.push({ x, y: 0, z });
    }
    const bruteForce = (qx: number, qz: number): number => {
      let best = -1;
      let bestDist = Number.POSITIVE_INFINITY;
      for (let j = 0; j < points.length; j += 1) {
        const d = Math.hypot(points[j].x - qx, points[j].z - qz);
        if (d < bestDist || (d === bestDist && (best === -1 || j < best))) {
          bestDist = d;
          best = j;
        }
      }
      return best;
    };
    for (let qx = -55; qx <= 55; qx += 3.5) {
      for (let qz = -55; qz <= 55; qz += 3.5) {
        expect(findNearestLanternIndex(points, { x: qx, y: 0, z: qz })).toBe(bruteForce(qx, qz));
      }
    }
  });

  it("同距離の2点は添字の小さい方を返す", () => {
    // クエリ(0,0)から等距離の2点。決定規則どおり添字0を返す。
    const points: Vec3[] = [
      { x: 1, y: 0, z: 0 },
      { x: -1, y: 0, z: 0 },
    ];
    expect(findNearestLanternIndex(points, { x: 0, y: 0, z: 0 })).toBe(0);
    // 添字の順序を入れ替えても、より近い側でなく同距離なら小さい添字を返す。
    const swapped: Vec3[] = [
      { x: -1, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
    ];
    expect(findNearestLanternIndex(swapped, { x: 0, y: 0, z: 0 })).toBe(0);
  });

  it("近接する複数の候補から、真に最も近い点を返す（外側区画の網羅は総当たり一致テストが担う）", () => {
    // クエリ(0,0)の近くにやや遠い点と、より近い点を置く。最も近い点（添字1）を返す。
    // 外側の区画に真の最近傍がある場合の打ち切りの正しさは、上の総当たり一致テストが多数のクエリで網羅する。
    const points: Vec3[] = [
      { x: 0.9, y: 0, z: 0.9 }, // クエリ(0,0)から約1.27
      { x: 0.2, y: 0, z: -1.0 }, // クエリ(0,0)から約1.02（こちらが最近傍）
      { x: 5, y: 0, z: 5 },
      { x: -5, y: 0, z: -5 },
    ];
    expect(findNearestLanternIndex(points, { x: 0, y: 0, z: 0 })).toBe(1);
  });
});

describe("検査関数の異常系（Issue #62）", () => {
  it("computeLanternMeasurementSpec は非有限座標の入力点で例外", () => {
    const seeds = seedsFrom([
      [Number.NaN, 0, 0],
      [5, 0, 5],
    ]);
    expect(() => computeLanternMeasurementSpec(seeds, REGION)).toThrow(/有限数/);
  });

  it("computeLanternMeasurementSpec は4点中1組だけ同一水平位置でも例外（中央値だけでは見逃す異常）", () => {
    const seeds = seedsFrom([
      [10, 1, 10],
      [10, 5, 10], // 上の点と同一水平位置（高さだけ違う）。
      [-20, 0, -20],
      [30, 0, 30],
    ]);
    expect(() => computeLanternMeasurementSpec(seeds, REGION)).toThrow(/同一水平位置/);
  });

  it("computeLanternMeasurementSpec は湖面矩形外の入力点で例外", () => {
    const seeds = seedsFrom([
      [0, 0, 0],
      [300, 0, 0],
    ]);
    expect(() => computeLanternMeasurementSpec(seeds, REGION)).toThrow(/矩形/);
  });

  it("measureLanternDistribution は非有限座標の測定対象点で例外", () => {
    const seeds = squareGrid(4, 4);
    const spec = computeLanternMeasurementSpec(seeds, REGION);
    const points: Vec3[] = [
      { x: Number.POSITIVE_INFINITY, y: 0, z: 0 },
      { x: 1, y: 0, z: 1 },
    ];
    expect(() => measureLanternDistribution(points, spec)).toThrow(/有限数/);
  });

  it("measureLanternDistribution は活性格子点が空の測定設定で例外", () => {
    const seeds = squareGrid(4, 4);
    const spec = computeLanternMeasurementSpec(seeds, REGION);
    const emptySpec = { ...spec, activeGridPoints: [] };
    expect(() => measureLanternDistribution(seeds.map((s) => s.position), emptySpec)).toThrow(/活性格子点/);
  });
});

describe("relaxLanternPlacement の入力検証（Issue #62）", () => {
  it("空の識別子で例外", () => {
    const seeds: LanternSeed[] = [{ id: "", position: { x: 0, y: 0, z: 0 } }, { id: "b", position: { x: 5, y: 0, z: 0 } }];
    expect(() => relaxLanternPlacement(seeds, REGION)).toThrow(/id/);
  });

  it("識別子の重複で例外", () => {
    const seeds: LanternSeed[] = [
      { id: "x", position: { x: 0, y: 0, z: 0 } },
      { id: "x", position: { x: 5, y: 0, z: 0 } },
    ];
    expect(() => relaxLanternPlacement(seeds, REGION)).toThrow(/重複/);
  });

  it("非有限座標で例外", () => {
    const seeds: LanternSeed[] = [
      { id: "a", position: { x: Number.NaN, y: 0, z: 0 } },
      { id: "b", position: { x: 5, y: 0, z: 0 } },
    ];
    expect(() => relaxLanternPlacement(seeds, REGION)).toThrow(/有限数/);
  });

  it("非正の領域寸法で例外", () => {
    const seeds = seedsFrom([[0, 0, 0], [5, 0, 5]]);
    expect(() => relaxLanternPlacement(seeds, { centerX: 0, centerZ: 0, width: 0, depth: 100 })).toThrow(/width/);
  });

  it("緩和回数が正典の範囲（2以上4以下）の外なら例外（0・1・5・非整数）", () => {
    const seeds = seedsFrom([[0, 0, 0], [5, 0, 5]]);
    expect(() => relaxLanternPlacement(seeds, REGION, { iterations: 0 })).toThrow(/iterations/);
    expect(() => relaxLanternPlacement(seeds, REGION, { iterations: 1 })).toThrow(/iterations/);
    expect(() => relaxLanternPlacement(seeds, REGION, { iterations: 5 })).toThrow(/iterations/);
    expect(() => relaxLanternPlacement(seeds, REGION, { iterations: 2.5 })).toThrow(/iterations/);
  });

  it("緩和回数が範囲内（2・3・4）なら成功する", () => {
    const seeds = squareGrid(5, 4);
    for (const iterations of [2, 3, 4]) {
      expect(() => relaxLanternPlacement(seeds, REGION, { iterations })).not.toThrow();
    }
  });

  it("seed が湖面領域の矩形外にあると例外", () => {
    const seeds = seedsFrom([[0, 0, 0], [300, 0, 0]]); // 300 は一辺200の矩形（±100）の外。
    expect(() => relaxLanternPlacement(seeds, REGION)).toThrow(/矩形/);
  });
});

describe("検査関数（Issue #62）", () => {
  it("representativeLakeRadius は短辺の半分を返す", () => {
    expect(representativeLakeRadius({ centerX: 0, centerZ: 0, width: 120, depth: 80 })).toBe(40);
  });

  it("isCentroidWithinLakeAllowance は領域の中心を基準に判定し、原点に固定しない", () => {
    // 中心を原点から離した領域。重心が領域中心の近傍にあれば真。
    const region: LakeRegion = { centerX: 50, centerZ: 50, width: 100, depth: 100 };
    // 代表半径50、20%=10。中心(50,50)近傍の点群。
    const near: Vec3[] = [
      { x: 48, y: 0, z: 52 },
      { x: 52, y: 0, z: 48 },
    ];
    expect(isCentroidWithinLakeAllowance(near, region)).toBe(true);
    // 原点近傍は領域中心(50,50)から遠いので偽。
    const far: Vec3[] = [
      { x: 0, y: 0, z: 0 },
      { x: 2, y: 0, z: 2 },
    ];
    expect(isCentroidWithinLakeAllowance(far, region)).toBe(false);
  });

  it("measureLanternDistribution は同一の測定設定で前後を比較できる統計を返す", () => {
    const seeds = squareGrid(5, 4);
    const spec = computeLanternMeasurementSpec(seeds, REGION);
    const m = measureLanternDistribution(seeds.map((s) => s.position), spec);
    expect(m.nearestNeighborMedian).toBeGreaterThan(0);
    expect(m.coverageDistance95thPercentile).toBeGreaterThan(0);
    expect(m.coverageDistanceMax).toBeGreaterThanOrEqual(m.coverageDistance95thPercentile);
  });

  it("computeLanternMeasurementSpec は外接矩形より余白ぶん広く、湖面矩形を超えない", () => {
    const seeds = squareGrid(4, 4); // x,z は -6..6。
    const spec = computeLanternMeasurementSpec(seeds, REGION);
    const halfX = spec.coverageRegion.width / 2;
    // 余白（基準量4）ぶん外接矩形(±6)より広い。
    expect(spec.coverageRegion.centerX - halfX).toBeLessThan(-6);
    // 湖面矩形(±100)を超えない。
    expect(spec.coverageRegion.centerX - halfX).toBeGreaterThanOrEqual(-100);
    expect(spec.gridSpacing).toBeGreaterThan(0);
  });

  it("検査関数の入力検証（点0個・非正の割合・非正の格子刻み・非正の領域）", () => {
    expect(() => isCentroidWithinLakeAllowance([], REGION)).toThrow(/1点以上/);
    expect(() => isCentroidWithinLakeAllowance([{ x: 0, y: 0, z: 0 }], REGION, 0)).toThrow(/fraction/);
    const seeds = squareGrid(4, 4);
    const spec = computeLanternMeasurementSpec(seeds, REGION);
    expect(() =>
      measureLanternDistribution(seeds.map((s) => s.position), { ...spec, gridSpacing: 0 }),
    ).toThrow(/gridSpacing/);
    expect(() => representativeLakeRadius({ centerX: 0, centerZ: 0, width: -1, depth: 10 })).toThrow(/width/);
  });
});

describe("既定オプション（Issue #62）", () => {
  it("既定の緩和回数は3、格子点上限は15万", () => {
    expect(DEFAULT_RELAX_OPTIONS.iterations).toBe(3);
    expect(DEFAULT_RELAX_OPTIONS.maxGridPointCount).toBe(150_000);
  });
});
