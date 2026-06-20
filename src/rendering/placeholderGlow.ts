// 暫定発光点（Issue #9）。発光点本実装（Issue #10）の InstancedMesh で置換するまでの暫定物である。
// 受け入れ基準「発光点が水面に映る」を満たすため、反射確認用の発光点をシーンへ置く。
// 配置は乱数を使わない決定的・左右非対称・高さ違いの固定配置とする。採用理由を先に述べる。鏡像反転を
// 撮影画像で再現可能に判定するため、起動ごとに配置が変わらないようにし、実体と反射像の上下関係を見分け
// やすいように左右と高さで非対称にする。本Issueの目的は反射の確認であり、発光点本実装（#10）の配置
// ロジックを先取りせず、検証に必要な最小限にとどめる。
//
// 取り込みは名前付き取り込みのみとする（理由は water.ts と同じ）。

import { Color, InstancedMesh, MeshBasicMaterial, Object3D, SphereGeometry } from "three";

/** 1個の暫定発光点。kind は色の種別（ひまわりはオレンジ色、蝶は青色）。 */
interface PlaceholderGlowPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly kind: "sunflower" | "butterfly";
}

// 決定的・左右非対称・高さ違いの固定配置。ひまわりは水面付近（高さ0.25）、蝶は空中（高さ1以上）。
// 水面（高さ0・平面400四方）の上に収まり、暫定カメラ視点（renderRoot）から湖面とともに見える範囲に置く。
const PLACEHOLDER_GLOW_POSITIONS: readonly PlaceholderGlowPoint[] = [
  { x: -8, y: 4.0, z: -6, kind: "butterfly" },
  { x: 6, y: 2.5, z: -10, kind: "butterfly" },
  { x: -3, y: 5.5, z: 4, kind: "butterfly" },
  { x: 10, y: 3.0, z: 2, kind: "butterfly" },
  { x: -12, y: 0.25, z: 8, kind: "sunflower" },
  { x: 4, y: 0.25, z: -4, kind: "sunflower" },
  { x: -6, y: 0.25, z: -12, kind: "sunflower" },
  { x: 12, y: 0.25, z: 10, kind: "sunflower" },
];

/** 暫定発光点の外部契約。 */
export interface PlaceholderGlow {
  /** シーンへ追加する描画対象。 */
  readonly object3d: Object3D;
  /** 後始末。ジオメトリとマテリアルを解放する。 */
  dispose(): void;
}

/**
 * 暫定発光点を生成する。同じ球形を1回の描画命令でまとめて描く InstancedMesh で、固定配置の各点に
 * ひまわりのオレンジ色か蝶の青色を割り当てる。色の値は試作（src/tools/perf/main.ts）と同じである。
 */
export function createPlaceholderGlow(): PlaceholderGlow {
  const geometry = new SphereGeometry(0.18, 8, 8);
  const material = new MeshBasicMaterial();
  const mesh = new InstancedMesh(geometry, material, PLACEHOLDER_GLOW_POSITIONS.length);

  const sunflower = new Color(1.0, 0.5, 0.12);
  const butterfly = new Color(0.12, 0.7, 1.0);
  const dummy = new Object3D();

  PLACEHOLDER_GLOW_POSITIONS.forEach((point, index) => {
    dummy.position.set(point.x, point.y, point.z);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    mesh.setColorAt(index, point.kind === "butterfly" ? butterfly : sunflower);
  });
  // setMatrixAt と setColorAt で書き込んだ配列をGPUへ転送するため、更新が必要であることを通知する。
  // three.js の InstancedMesh は、行列の書き込み後に instanceMatrix.needsUpdate を立てるよう定めている。
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) {
    mesh.instanceColor.needsUpdate = true;
  }

  return {
    object3d: mesh,
    dispose(): void {
      geometry.dispose();
      material.dispose();
    },
  };
}
