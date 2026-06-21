// 舞台土台モデル（Issue #105）のローダ。GLTFLoader で .glb を読み、node 名で地形メッシュと水面領域マーカーを
// 取り出す。水面領域マーカーは軸平行の矩形である前提であり、その世界座標の境界箱から水面領域（幅・奥行き・
// 中心・高さ）を求める。生の水面メッシュは描かず、反射水面は実行時に water.ts が実績経路（平面を作り回転で
// 水平化）で生成する。状態を読むだけのビューであり、判定・得点・時刻の論理を持たない
// （依存規則 docs/decisions/architecture.md §5）。profiles・tools は import しない。

import { Box3, type BufferGeometry, type Material, type Mesh, type Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type {
  OriginalWaterBoundsWorld,
  StageModelConfig,
  WaterRegion,
} from "../../types/stage";
import { WATER_HEIGHT_EPSILON, waterRegionFromBounds } from "./waterRegion";

/** 読み込み済みの舞台土台の取っ手。 */
export interface LoadedStageTerrain {
  /** シーンへ追加する地形メッシュ。 */
  readonly object3d: Object3D;
  /** 反射水面の平面を生成するための水面領域（幅・奥行き・中心・高さ）。 */
  readonly waterRegion: WaterRegion;
  /** 水面の元の範囲（extras 由来、後続の湖輪郭の切り出し用）。無ければ null。 */
  readonly waterBounds: OriginalWaterBoundsWorld | null;
  /** 後始末。地形と破棄した水面マーカーの GPU資源を解放する。冪等。 */
  dispose(): void;
}

/** オブジェクトを走査し、ジオメトリとマテリアルを解放する。地形はテクスチャを持たないため画像は扱わない。 */
function disposeObjectTree(root: Object3D): void {
  root.traverse((object) => {
    const mesh = object as Mesh;
    const geometry = mesh.geometry as BufferGeometry | undefined;
    if (geometry) {
      geometry.dispose();
    }
    const material = mesh.material as Material | Material[] | undefined;
    if (material) {
      const materials = Array.isArray(material) ? material : [material];
      for (const item of materials) {
        item.dispose();
      }
    }
  });
}

/** 水面マーカーの extras（GLTFLoader が userData へ写す）から元の範囲を読む。形が合わなければ null を返す。 */
function readWaterBounds(water: Object3D): OriginalWaterBoundsWorld | null {
  const value = (water.userData as { originalWaterBoundsWorld?: unknown }).originalWaterBoundsWorld;
  if (!value || typeof value !== "object") {
    return null;
  }
  const bounds = value as Record<string, unknown>;
  const keys: Array<keyof OriginalWaterBoundsWorld> = ["minX", "maxX", "minZ", "maxZ", "y"];
  for (const key of keys) {
    if (typeof bounds[key] !== "number") {
      return null;
    }
  }
  return {
    minX: bounds.minX as number,
    maxX: bounds.maxX as number,
    minZ: bounds.minZ as number,
    maxZ: bounds.maxZ as number,
    y: bounds.y as number,
  };
}

/**
 * 設定の .glb を読み込み、地形メッシュと水面領域を取り出す。地形・水面のいずれかが見つからない、または
 * 水面マーカーが水平でないときは Promise が reject する。
 */
export function loadStageTerrain(config: StageModelConfig): Promise<LoadedStageTerrain> {
  const loader = new GLTFLoader();

  return new Promise<LoadedStageTerrain>((resolve, reject) => {
    loader.load(
      config.url,
      (gltf) => {
        const terrain = gltf.scene.getObjectByName(config.terrainNodeName);
        const water = gltf.scene.getObjectByName(config.waterNodeName);
        if (!terrain) {
          reject(
            new Error(`約束した名前のメッシュ ${config.terrainNodeName}（地形）が見つかりません。`)
          );
          return;
        }
        if (!water) {
          reject(
            new Error(`約束した名前のメッシュ ${config.waterNodeName}（水面）が見つかりません。`)
          );
          return;
        }

        // 水面領域を水面マーカーの世界座標の境界箱から求める。setFromObject は内部で世界行列を更新する。
        // 高さの差が許容値を超える（水平でない）ときは waterRegionFromBounds が例外を投げるため、失敗にする。
        const box = new Box3().setFromObject(water);
        let waterRegion: WaterRegion;
        try {
          waterRegion = waterRegionFromBounds(
            {
              minX: box.min.x,
              maxX: box.max.x,
              minY: box.min.y,
              maxY: box.max.y,
              minZ: box.min.z,
              maxZ: box.max.z,
            },
            WATER_HEIGHT_EPSILON,
            config.waterNodeName
          );
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
          return;
        }
        const waterBounds = readWaterBounds(water);

        // 水面マーカーのメッシュは描かないため、親から外して保持し、後始末で解放する。
        water.parent?.remove(water);
        // 地形メッシュを親から外して単独で返す（node に変換は無く、頂点は世界座標に一致する）。
        terrain.parent?.remove(terrain);

        let disposed = false;
        resolve({
          object3d: terrain,
          waterRegion,
          waterBounds,
          dispose(): void {
            if (disposed) {
              return;
            }
            disposed = true;
            disposeObjectTree(terrain);
            disposeObjectTree(water);
          },
        });
      },
      undefined,
      (error) => {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    );
  });
}
