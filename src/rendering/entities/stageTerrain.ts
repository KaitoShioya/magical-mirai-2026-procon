// 舞台土台の地形（Issue #105）。読み込んだ地形メッシュに深夜の地形マテリアルを与え、法線を計算する。
// 状態を読むだけのビューであり、判定・得点・時刻の論理を持たない（依存規則 docs/decisions/architecture.md §5）。
// profiles・tools は import しない。
//
// マテリアルを差し替える理由を先に述べる。生成した .glb はマテリアルを持たず、GLTFLoader は既定の標準
// マテリアルを割り当てる。深夜の固定色の色彩方針に合わせ、暗く無光沢で自発光のない標準マテリアルへ置き換える。
// 自発光がなく輝度がブルームの下限を下回るため、地形はブルームでにじまない。
// 法線を計算する理由を先に述べる。.glb は法線を持たないため、読み込み直後に一度だけ面から頂点法線を求め、
// リムライトと環境光で陰影が付くようにする。

import {
  Mesh,
  MeshStandardMaterial,
  type BufferGeometry,
  type Material,
  type Object3D,
} from "three";
import { LAND_COLOR, LAND_METALNESS, LAND_ROUGHNESS } from "../constants";
import type { LoadedStageTerrain } from "../loaders/stageTerrainLoader";

/** 舞台土台の地形の取っ手。 */
export interface StageTerrain {
  /** シーンへ追加する地形メッシュ。 */
  readonly object3d: Object3D;
  /** 毎フレーム呼ぶ（引数は秒）。地形は静止のため何もしない。中心オブジェクトと同じ呼び口を揃える。 */
  update(deltaSeconds: number): void;
  /** 後始末。生成したマテリアルを解放してから、読み込み資源（地形・水面マーカー）を解放する。冪等。 */
  dispose(): void;
}

/**
 * 読み込んだ地形に深夜の地形マテリアルを与えて舞台土台を組む。
 * 地形メッシュを走査し、法線を計算してからマテリアルを差し替える。差し替え前の既定マテリアルは解放する。
 */
export function createStageTerrain(loaded: LoadedStageTerrain): StageTerrain {
  const material = new MeshStandardMaterial({
    color: LAND_COLOR,
    roughness: LAND_ROUGHNESS,
    metalness: LAND_METALNESS,
  });

  loaded.object3d.traverse((object) => {
    const mesh = object as Mesh;
    const geometry = mesh.geometry as BufferGeometry | undefined;
    if (!geometry) {
      return;
    }
    geometry.computeVertexNormals();
    const previous = mesh.material as Material | Material[] | undefined;
    mesh.material = material;
    // 差し替えで参照されなくなる既定マテリアルを解放する（GPU資源の取りこぼしを防ぐ）。
    if (previous) {
      const items = Array.isArray(previous) ? previous : [previous];
      for (const item of items) {
        item.dispose();
      }
    }
  });

  let disposed = false;
  return {
    object3d: loaded.object3d,
    update(_deltaSeconds: number): void {
      // 地形は静止のため何もしない。
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      material.dispose();
      loaded.dispose();
    },
  };
}
