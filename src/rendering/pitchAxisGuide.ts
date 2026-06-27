// プレイ画面左側の縦7レーンのガイド（Issue #58・Issue #202）。2次元層へ載せる純粋な表示物で、レーンの境界を示す
// 縦の仕切り線（slotCount+1 本）と、ノーツが消える単一の判定線（横1本）を薄く表示する。音程はX軸のどのレーンかで
// 表すため、Y軸の番号や音程帯は描かない。状態を読んで描くビューであり、判定・得点・時刻の論理を持たない
// （依存規則 docs/decisions/architecture.md §5）。レーンの横位置は src/utils/pitchHudLayout.ts、判定線と上端の縦位置は
// src/rendering/fallingLaneLayout.ts の定数を共有し、落下ノーツと配置が一致する。

import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  type BufferAttribute,
  type Object3D,
} from "three";
import type { OverlayFrustum } from "./viewport";
import { OVERLAY_RENDER_ORDER } from "./overlay";
import { JUDGMENT_LINE_OVERLAY_Y, NOTE_TOP_OVERLAY_Y } from "./fallingLaneLayout";
import { laneBoundaryX } from "../utils/pitchHudLayout";

/** ガイドの不透明度。低いほど3D世界・歌詞を阻害しないが低すぎると視認できないため、薄く読める折衷値とする。 */
const GUIDE_OPACITY = 0.22;

/** 仕切り線と判定線の色（白）。深夜の暗い背景の上で薄く読めるようにする。 */
const GUIDE_COLOR = 0xffffff;

/** レーンガイドの外部契約。 */
export interface PitchAxisGuide {
  /** 2次元層へ載せるまとめ物体。 */
  readonly object3d: Object3D;
  /** 視錐台から、縦の仕切り線と横の判定線の位置を再計算する。第2引数は使わない（番号画像が無いため）。 */
  layout(frustum: OverlayFrustum, _devicePixelHeight: number): void;
  /** まとめ物体の全ジオメトリ・マテリアルを解放する。 */
  dispose(): void;
}

/**
 * レーンガイドを生成する。slotCount+1 本の縦の仕切り線（各レーンの境界、上端から判定線まで）と、横1本の判定線
 * （帯の左端から右端まで）を組み立てる。位置は layout で確定する（生成時点では視錐台が未確定のため）。
 */
export function createPitchAxisGuide(options: { slotCount: number }): PitchAxisGuide {
  const slotCount = options.slotCount;
  const group = new Group();

  // 線分の総数は、縦の仕切り線（slotCount+1 本）と横の判定線（1 本）。
  const segmentCount = slotCount + 1 + 1;
  const positions = new Float32Array(segmentCount * 2 * 3);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  const material = new LineBasicMaterial({
    color: GUIDE_COLOR,
    transparent: true,
    opacity: GUIDE_OPACITY,
    depthTest: false,
    depthWrite: false,
  });
  const lines = new LineSegments(geometry, material);
  lines.renderOrder = OVERLAY_RENDER_ORDER.backgroundReference;
  group.add(lines);

  function layout(frustum: OverlayFrustum, _devicePixelHeight: number): void {
    // 縦横比は視錐台の左右幅の半分（右端 = 縦横比、左端 = −縦横比）。
    const aspect = (frustum.right - frustum.left) / 2;
    const positionAttribute = geometry.getAttribute("position") as BufferAttribute;

    // 縦の仕切り線。各境界 i の縦線は上端（NOTE_TOP_OVERLAY_Y）から判定線（JUDGMENT_LINE_OVERLAY_Y）まで。
    for (let i = 0; i <= slotCount; i += 1) {
      const x = laneBoundaryX(i, slotCount, aspect);
      const base = i * 2 * 3;
      positionAttribute.array[base] = x;
      positionAttribute.array[base + 1] = NOTE_TOP_OVERLAY_Y;
      positionAttribute.array[base + 2] = 0;
      positionAttribute.array[base + 3] = x;
      positionAttribute.array[base + 4] = JUDGMENT_LINE_OVERLAY_Y;
      positionAttribute.array[base + 5] = 0;
    }
    // 横の判定線。帯の左端から右端まで、判定線の高さで1本。
    const judgmentBase = (slotCount + 1) * 2 * 3;
    const leftX = laneBoundaryX(0, slotCount, aspect);
    const rightX = laneBoundaryX(slotCount, slotCount, aspect);
    positionAttribute.array[judgmentBase] = leftX;
    positionAttribute.array[judgmentBase + 1] = JUDGMENT_LINE_OVERLAY_Y;
    positionAttribute.array[judgmentBase + 2] = 0;
    positionAttribute.array[judgmentBase + 3] = rightX;
    positionAttribute.array[judgmentBase + 4] = JUDGMENT_LINE_OVERLAY_Y;
    positionAttribute.array[judgmentBase + 5] = 0;

    positionAttribute.needsUpdate = true;
  }

  function dispose(): void {
    geometry.dispose();
    material.dispose();
  }

  return { object3d: group, layout, dispose };
}
