// プレイ画面左側の縦7レーンのガイド（Issue #58・Issue #202）。2次元層へ載せる純粋な表示物で、レーンの境界を示す
// 縦の仕切り線（slotCount+1 本）と、ノーツが消える単一の判定線（横1本）を薄く表示する。音程はX軸のどのレーンかで
// 表すため、Y軸の番号や音程帯は描かない。状態を読んで描くビューであり、判定・得点・時刻の論理を持たない
// （依存規則 docs/decisions/architecture.md §5）。レーンの横位置は src/utils/pitchHudLayout.ts、判定線と上端の縦位置は
// src/rendering/fallingLaneLayout.ts の定数を共有し、落下ノーツと配置が一致する。
//
// 仕切り線と判定線を別々の線分集合（別マテリアル）で描く理由を先に述べる。判定線はタップの基準点であり、レーンの
// 仕切り線と一目で区別できる必要がある。一方どちらも深夜の3D世界・歌詞の上に重なるため、背景演出を阻害しない薄さに
// 保つ。両者を1つのマテリアルで描くと色も濃さも同一になり区別できないため、仕切り線は控えめな寒色の白、判定線は
// やや明るい暖色の白として、濃さと色味の両方で差を付ける。

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

/** 仕切り線の不透明度。レーンの境目を示すだけの補助線なので、判定線より薄くして背景を阻害しない。 */
const DIVIDER_OPACITY = 0.16;

/** 仕切り線の色（寒色寄りの白）。深夜の暗い背景の上で控えめに読める。 */
const DIVIDER_COLOR = 0xaebfd6;

/** 判定線の不透明度。タップの基準点として仕切り線よりはっきり見せるが、背景演出を阻害しない範囲に留める。 */
const JUDGMENT_OPACITY = 0.55;

/** 判定線の色（暖色寄りの白）。仕切り線の寒色の白と色味で差を付け、タップ基準だと一目で分かるようにする。 */
const JUDGMENT_COLOR = 0xfff1d6;

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
 * （帯の左端から右端まで）を、別々の線分集合として組み立てる。位置は layout で確定する（生成時点では視錐台が
 * 未確定のため）。
 */
export function createPitchAxisGuide(options: { slotCount: number }): PitchAxisGuide {
  const slotCount = options.slotCount;
  const group = new Group();

  // 縦の仕切り線（slotCount+1 本）。控えめな寒色の白。
  const dividerGeometry = new BufferGeometry();
  dividerGeometry.setAttribute(
    "position",
    new Float32BufferAttribute(new Float32Array((slotCount + 1) * 2 * 3), 3)
  );
  const dividerMaterial = new LineBasicMaterial({
    color: DIVIDER_COLOR,
    transparent: true,
    opacity: DIVIDER_OPACITY,
    depthTest: false,
    depthWrite: false,
  });
  const dividerLines = new LineSegments(dividerGeometry, dividerMaterial);
  dividerLines.renderOrder = OVERLAY_RENDER_ORDER.backgroundReference;
  group.add(dividerLines);

  // 横の判定線（1 本）。やや明るい暖色の白で、タップの基準点を示す。
  const judgmentGeometry = new BufferGeometry();
  judgmentGeometry.setAttribute("position", new Float32BufferAttribute(new Float32Array(2 * 3), 3));
  const judgmentMaterial = new LineBasicMaterial({
    color: JUDGMENT_COLOR,
    transparent: true,
    opacity: JUDGMENT_OPACITY,
    depthTest: false,
    depthWrite: false,
  });
  const judgmentLine = new LineSegments(judgmentGeometry, judgmentMaterial);
  // 仕切り線の上に重ねて、交点で判定線が勝つようにする。
  judgmentLine.renderOrder = OVERLAY_RENDER_ORDER.backgroundReference + 1;
  group.add(judgmentLine);

  function layout(frustum: OverlayFrustum, _devicePixelHeight: number): void {
    // 縦横比は視錐台の左右幅の半分（右端 = 縦横比、左端 = −縦横比）。
    const aspect = (frustum.right - frustum.left) / 2;

    // 縦の仕切り線。各境界 i の縦線は上端（NOTE_TOP_OVERLAY_Y）から判定線（JUDGMENT_LINE_OVERLAY_Y）まで。
    const dividerPosition = dividerGeometry.getAttribute("position") as BufferAttribute;
    for (let i = 0; i <= slotCount; i += 1) {
      const x = laneBoundaryX(i, slotCount, aspect);
      const base = i * 2 * 3;
      dividerPosition.array[base] = x;
      dividerPosition.array[base + 1] = NOTE_TOP_OVERLAY_Y;
      dividerPosition.array[base + 2] = 0;
      dividerPosition.array[base + 3] = x;
      dividerPosition.array[base + 4] = JUDGMENT_LINE_OVERLAY_Y;
      dividerPosition.array[base + 5] = 0;
    }
    dividerPosition.needsUpdate = true;

    // 横の判定線。帯の左端から右端まで、判定線の高さで1本。
    const judgmentPosition = judgmentGeometry.getAttribute("position") as BufferAttribute;
    const leftX = laneBoundaryX(0, slotCount, aspect);
    const rightX = laneBoundaryX(slotCount, slotCount, aspect);
    judgmentPosition.array[0] = leftX;
    judgmentPosition.array[1] = JUDGMENT_LINE_OVERLAY_Y;
    judgmentPosition.array[2] = 0;
    judgmentPosition.array[3] = rightX;
    judgmentPosition.array[4] = JUDGMENT_LINE_OVERLAY_Y;
    judgmentPosition.array[5] = 0;
    judgmentPosition.needsUpdate = true;
  }

  function dispose(): void {
    dividerGeometry.dispose();
    dividerMaterial.dispose();
    judgmentGeometry.dispose();
    judgmentMaterial.dispose();
  }

  return { object3d: group, layout, dispose };
}
