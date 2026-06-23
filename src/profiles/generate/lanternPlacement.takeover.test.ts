// TAKEOVER 実データでの受入検証（Issue #62）。コミット済み takeover.profile.json の各ノーツの
// trajectoryPosition（434件）を素案位置として緩和し、受入条件1（空白も塊も無い）と受入条件2
// （重心が湖の中心から許容半径以内・重心保存）を実データで表明する。src/tools/ も描画層も import しない。
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  computeLanternMeasurementSpec,
  isCentroidWithinLakeAllowance,
  type LakeRegion,
  type LanternSeed,
  measureLanternDistribution,
  METRIC_TOLERANCE,
  relaxLanternPlacement,
} from "./lanternPlacement";

// コミット済みの曲プロファイルを素のデータファイルとして読む。
const committedPath = fileURLToPath(new URL("../takeover/takeover.profile.json", import.meta.url));
const committed = JSON.parse(readFileSync(committedPath, "utf8")) as {
  notes: Array<{ id: string; trajectoryPosition: { x: number; y: number; z: number } }>;
};

const seeds: LanternSeed[] = committed.notes.map((n) => ({ id: n.id, position: n.trajectoryPosition }));

// 代理の湖面領域。一辺400・中心原点。理由: 実物の水面境界箱は実行時にしか確定しないため、コミット済みで
// 文書化された水面平面寸法（src/rendering/constants.ts の WATER_PLANE_SIZE、値400）を代理に用いる。値は
// ここに直接書き、生成層のテストから描画層へ依存させないため import しない。実行時の本物の領域は #101 が用いる。
const REGION: LakeRegion = { centerX: 0, centerZ: 0, width: 400, depth: 400 };

function centroidXZ(points: ReadonlyArray<{ x: number; z: number }>): { x: number; z: number } {
  let sx = 0;
  let sz = 0;
  for (const p of points) {
    sx += p.x;
    sz += p.z;
  }
  return { x: sx / points.length, z: sz / points.length };
}

describe("lanternPlacement TAKEOVER 受入（Issue #62）", () => {
  const spec = computeLanternMeasurementSpec(seeds, REGION);
  const before = measureLanternDistribution(seeds.map((s) => s.position), spec);
  const relaxed = relaxLanternPlacement(seeds, REGION);
  const after = measureLanternDistribution(relaxed.map((p) => p.position), spec);

  it("入力は434件で、出力の識別子が入力ノーツと一対一・件数と順序が一致する（呼び出し契約）", () => {
    expect(seeds.length).toBe(434);
    expect(relaxed.map((p) => p.id)).toEqual(seeds.map((s) => s.id));
  });

  it("受入条件1: 緩和後の変動係数と被覆距離95パーセンタイルが緩和前以下（許容誤差1e-9）", () => {
    expect(after.nearestNeighborVariationCoefficient).toBeLessThanOrEqual(
      before.nearestNeighborVariationCoefficient + METRIC_TOLERANCE,
    );
    expect(after.coverageDistance95thPercentile).toBeLessThanOrEqual(
      before.coverageDistance95thPercentile + METRIC_TOLERANCE,
    );
  });

  it("受入条件2: 重心保存（緩和後の重心が緩和前の重心から基準量以内）", () => {
    const beforeCentroid = centroidXZ(seeds.map((s) => s.position));
    const afterCentroid = centroidXZ(relaxed.map((p) => p.position));
    const drift = Math.hypot(afterCentroid.x - beforeCentroid.x, afterCentroid.z - beforeCentroid.z);
    expect(drift).toBeLessThanOrEqual(before.nearestNeighborMedian + 1e-9);
  });

  it("受入条件2: 緩和後の重心が湖の中心から許容半径（代表半径200の20パーセント＝40）以内", () => {
    expect(isCentroidWithinLakeAllowance(relaxed.map((p) => p.position), REGION)).toBe(true);
  });

  it("決定論: 同一入力で2回実行して一致する", () => {
    const again = relaxLanternPlacement(seeds, REGION);
    expect(again).toEqual(relaxed);
  });

  it("実データで緩和が塊と空きを実質的に改善する（変動係数と被覆距離95パーセンタイルが低下）", () => {
    // 受入の合否（緩和前以下）は上のテストで判定する。ここは実データで実質的な改善（厳密な低下）を表明する。
    // 被覆距離の最大値は外縁の1点に支配される診断値であり、緩和で微増しうるため合否には用いない。
    expect(after.nearestNeighborVariationCoefficient).toBeLessThan(before.nearestNeighborVariationCoefficient);
    expect(after.coverageDistance95thPercentile).toBeLessThan(before.coverageDistance95thPercentile);
  });
});
