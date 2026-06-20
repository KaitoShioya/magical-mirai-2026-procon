// 反射水面（Issue #9）。深夜の暗い湖面を、平面反射方式（水面を鏡とみなし鏡像位置のカメラで世界を
// もう一度描く方式）で描く描画対象。描画基盤（renderRoot）が組み立て、シーンへ追加し、後始末する。
// 状態を読んで描く「ビュー」であり、判定・得点・時刻の論理を持たない（依存規則 docs/decisions/architecture.md §5）。
//
// 取り込みは名前付き取り込みのみとする（src/rendering/README.md の取り込み方針）。名前空間取り込みや
// デフォルト取り込みは容量を抑える方針に反するため使わない。試作（src/tools/perf/main.ts・
// docs/poc/src/prototype/main.js）は名前空間取り込みを用いるが、検証用ツールであり本番の取り込み方針の
// 対象外であるため、本編の本ファイルでは名前付き取り込みへ揃える。
//
// 水面のジオメトリは現状この内部で平面として生成する。将来の舞台土台モデル（Issue #105）の導入時は、
// この生成箇所をモデル内の約束した名前のメッシュ（名前を water とする）のジオメトリへ差し替える。
// Reflector は任意のジオメトリを受け取るため差し替えは局所で済む。

import { Mesh, MeshBasicMaterial, Object3D, PlaneGeometry } from "three";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { WATER_COLOR, WATER_PLANE_SIZE } from "./constants";

/**
 * 反射水面の外部契約。呼び出し側を three.js の具象型（Reflector）に依存させないための抽象。
 */
export interface Water {
  /** シーンへ追加する描画対象。 */
  readonly object3d: Object3D;
  /** 反射が有効（Reflector を使う）なら真、無効（不透明な面）なら偽。診断・検証用。 */
  readonly reflective: boolean;
  /** 反射が有効なときの一辺の画素数。無効時は0。診断・検証用。 */
  readonly reflectionResolution: number;
  /** 後始末。ジオメトリ・マテリアル・反射の描画ターゲットを解放する。 */
  dispose(): void;
}

/**
 * 反射水面を生成する。
 * reflectionResolution が0より大きいとき平面反射（Reflector）、0のとき不透明な面（Mesh）を作る。
 * いずれも水平面にし、高さ（y座標）は0に置く（位置を移動しない）。採用理由を先に述べる。試作が水面を
 * 高さ0に置いて狙いの見えを確認しており、反射面の基準面を高さ0に固定する。将来の舞台土台モデル（#105）の
 * 高さ規約はそちらへ引き継ぐ。
 * @param options.reflectionResolution 反射解像度（0は無効、256または512は有効解像度）
 */
export function createWater(options: { reflectionResolution: number }): Water {
  const { reflectionResolution } = options;
  const geometry = new PlaneGeometry(WATER_PLANE_SIZE, WATER_PLANE_SIZE);

  if (reflectionResolution > 0) {
    const reflector = new Reflector(geometry, {
      textureWidth: reflectionResolution,
      textureHeight: reflectionResolution,
      color: WATER_COLOR,
    });
    // 平面のローカル法線は+Z。x軸まわりに-90度回すと法線が上向き（+Y）になり、水平な水面になる。
    reflector.rotateX(-Math.PI / 2);
    return {
      object3d: reflector,
      reflective: true,
      reflectionResolution,
      dispose(): void {
        // Reflector.dispose は描画ターゲットとマテリアルのみ解放しジオメトリを解放しないため、
        // ジオメトリは別途解放する。
        reflector.dispose();
        geometry.dispose();
      },
    };
  }

  const material = new MeshBasicMaterial({ color: WATER_COLOR });
  const mesh = new Mesh(geometry, material);
  mesh.rotateX(-Math.PI / 2);
  return {
    object3d: mesh,
    reflective: false,
    reflectionResolution: 0,
    dispose(): void {
      geometry.dispose();
      material.dispose();
    },
  };
}
