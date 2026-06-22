// 本編左端のY軸音程ガイド（Issue #58）。2次元層へ載せる純粋な表示物で、音程スロットの境界マークと
// 番号1〜slotCount を画面左端の余白に薄く表示する。状態を読んで描くビューであり、判定・得点・時刻の論理を持たない
// （依存規則 docs/decisions/architecture.md §5）。番号と境界の縦位置は src/utils/pitchSlotAxis.ts の正典に従い、
// 入力（src/input/coordinateMapping.ts）のスロット規約と一致する。
//
// 表示の薄さ・余白・マーク長・文字高割合・番号画像の画素数の下限と上限は、本モジュールの単一所有の定数とする。
// 番号画像の画素数を表示の実画素から決める根拠と、下限・上限を設ける根拠は各定数のコメントに先に記す。

import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Texture,
  type BufferAttribute,
  type Object3D,
} from "three";
import { overlayPointFromNormalized, type OverlayFrustum } from "./viewport";
import { OVERLAY_RENDER_ORDER } from "./overlay";
import {
  slotBoundaryNormalizedY,
  slotCenterNormalizedY,
  slotDisplayNumber,
} from "../utils/pitchSlotAxis";

/** 2次元層は高さを基準軸に上下が +1〜-1 で正規化されるため、画面の全高は 2 の長さに当たる。 */
const OVERLAY_FULL_HEIGHT = 2;

/** 左端の余白（2次元層の高さ基準の長さ）。視錐台左端から内側へこの量だけ寄せる。
 * 端末の表示端の切れ落ちで番号や境界が見えなくなるのを避けるため、左端ぴったりではなく内側へ置く。 */
const LEFT_MARGIN = 0.06;

/** 境界線の起点から番号の左端までの距離（高さ基準の長さ）。境界線が番号の手前に短い助走を持つようにする。 */
const NUMBER_LEFT_INSET = 0.05;

/** 1つの帯の高さに対する番号文字の高さの割合。文字は帯の高さ全体ではなく一部を占めるため、割合で持つ。 */
const LABEL_HEIGHT_FRACTION = 0.5;

/** 番号の枠の横幅÷縦幅。1個の数字の字形は縦長で、枠をこの比に絞ると数字が枠の幅をほぼ満たし、
 * 枠の右端（=境界線の右端）が数字の右端に近づく。境界線を番号の右端と揃えるための比である。 */
const DIGIT_BOX_ASPECT = 0.62;

/** 番号画像の縦画素数の下限。これより小さいと数字の線がつぶれて読めなくなるため、読める最小画素数で下支えする。 */
const LABEL_MIN_TEXEL = 24;

/** 番号画像の縦画素数の上限。画面占有寸法を超える画素数は無駄な記憶領域・生成負荷になるため、占有寸法に見合う値で抑える。 */
const LABEL_MAX_TEXEL = 256;

/** 番号画像の正方形の中で数字の高さが占める割合。余白を確保して縁での切れを避けるため1未満にする。 */
const DIGIT_FONT_FRACTION = 0.8;

/** ガイドの不透明度。低いほど3D世界・歌詞を阻害しないが低すぎると視認できないため、薄く読める折衷値とする。 */
const GUIDE_OPACITY = 0.22;

/** 境界マークと番号文字の色（白）。深夜の暗い背景の上で薄く読めるようにする。 */
const GUIDE_COLOR = 0xffffff;
const DIGIT_FILL_STYLE = "#ffffff";

/** Y軸音程ガイドの外部契約。 */
export interface PitchAxisGuide {
  /** 2次元層へ載せるまとめ物体。 */
  readonly object3d: Object3D;
  /**
   * 視錐台と現在の表示縦画素数から、境界マークと番号の位置を再計算する。
   * 番号画像の目標縦画素数が前回と異なるときだけ画像を作り直す（寸法・画素密度の変更時のみ）。
   */
  layout(frustum: OverlayFrustum, devicePixelHeight: number): void;
  /** まとめ物体の全ジオメトリ・マテリアル・画像を解放する。 */
  dispose(): void;
}

/** 番号画像の生成関数。既定は文書要素のキャンバスから作る。文書要素の無い環境（単体テスト）では差し替える。 */
export type LabelTextureFactory = (displayNumber: number, texelSize: number) => Texture;

interface LabelEntry {
  mesh: Mesh;
  material: MeshBasicMaterial;
  texture: Texture | null;
}

/** 文書要素のキャンバスへ数字を描いて画像化する既定の生成関数。 */
function createCanvasLabelTexture(displayNumber: number, texelSize: number): Texture {
  const canvas = document.createElement("canvas");
  // 縦の画素数を基準にし、横は数字の字形比へ絞る。番号の枠（四角形）と同じ比にして字形が枠の幅をほぼ満たすようにする。
  const widthPixels = Math.max(1, Math.round(texelSize * DIGIT_BOX_ASPECT));
  canvas.width = widthPixels;
  canvas.height = texelSize;
  const context = canvas.getContext("2d");
  if (context !== null) {
    context.clearRect(0, 0, widthPixels, texelSize);
    context.fillStyle = DIGIT_FILL_STYLE;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `${Math.round(texelSize * DIGIT_FONT_FRACTION)}px sans-serif`;
    context.fillText(String(displayNumber), widthPixels / 2, texelSize / 2);
  }
  const texture = new Texture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/** 値を下限と上限で挟む。 */
function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

/**
 * Y軸音程ガイドを生成する。slotCount 個の帯の境界マーク（slotCount+1 本）と番号（slotCount 枚）を組み立てる。
 * 位置と番号画像は layout で確定する（生成時点では視錐台と表示画素が未確定のため）。
 */
export function createPitchAxisGuide(options: {
  slotCount: number;
  createLabelTexture?: LabelTextureFactory;
}): PitchAxisGuide {
  const slotCount = options.slotCount;
  const makeLabelTexture = options.createLabelTexture ?? createCanvasLabelTexture;
  const group = new Group();

  // 境界マークは1つの線分集合にまとめる。境界は slotCount+1 本（最上部から最下部まで）。
  const boundaryCount = slotCount + 1;
  const boundaryPositions = new Float32Array(boundaryCount * 2 * 3);
  const boundaryGeometry = new BufferGeometry();
  boundaryGeometry.setAttribute("position", new Float32BufferAttribute(boundaryPositions, 3));
  const boundaryMaterial = new LineBasicMaterial({
    color: GUIDE_COLOR,
    transparent: true,
    opacity: GUIDE_OPACITY,
    depthTest: false,
    depthWrite: false,
  });
  const boundaryLines = new LineSegments(boundaryGeometry, boundaryMaterial);
  boundaryLines.renderOrder = OVERLAY_RENDER_ORDER.backgroundReference;
  group.add(boundaryLines);

  // 番号の四角形。高さは帯の高さ × 文字高割合、横幅は数字の字形比に合わせる。いずれも視錐台に依らず一定。
  const labelPlaneHeight = (OVERLAY_FULL_HEIGHT / slotCount) * LABEL_HEIGHT_FRACTION;
  const labelPlaneWidth = labelPlaneHeight * DIGIT_BOX_ASPECT;
  const labels: LabelEntry[] = [];
  for (let slotIndex = 0; slotIndex < slotCount; slotIndex += 1) {
    const geometry = new PlaneGeometry(labelPlaneWidth, labelPlaneHeight);
    const material = new MeshBasicMaterial({
      transparent: true,
      opacity: GUIDE_OPACITY,
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new Mesh(geometry, material);
    mesh.renderOrder = OVERLAY_RENDER_ORDER.backgroundReference;
    group.add(mesh);
    labels.push({ mesh, material, texture: null });
  }

  // 前回作った番号画像の縦画素数。0は未生成を表す。
  let lastTexelSize = 0;

  function layout(frustum: OverlayFrustum, devicePixelHeight: number): void {
    // 縦横比は視錐台の左右幅の半分（右端 = 縦横比、左端 = -縦横比）。
    const aspect = (frustum.right - frustum.left) / 2;
    const leftAnchorX = frustum.left + LEFT_MARGIN;
    // 番号の中心と右端。境界線は左端アンカーからこの右端まで伸ばし、番号の右端と揃える。
    const labelCenterX = leftAnchorX + NUMBER_LEFT_INSET + labelPlaneWidth / 2;
    const numberRightEdgeX = labelCenterX + labelPlaneWidth / 2;

    // 境界線の位置を更新する。各境界線は左端アンカーから番号の右端まで水平に伸びる。縦位置は正規化Yを写した値。
    const positionAttribute = boundaryGeometry.getAttribute("position") as BufferAttribute;
    for (let boundaryIndex = 0; boundaryIndex <= slotCount; boundaryIndex += 1) {
      const y = overlayPointFromNormalized(
        0,
        slotBoundaryNormalizedY(boundaryIndex, slotCount),
        aspect
      ).y;
      const base = boundaryIndex * 2 * 3;
      positionAttribute.array[base] = leftAnchorX;
      positionAttribute.array[base + 1] = y;
      positionAttribute.array[base + 2] = 0;
      positionAttribute.array[base + 3] = numberRightEdgeX;
      positionAttribute.array[base + 4] = y;
      positionAttribute.array[base + 5] = 0;
    }
    positionAttribute.needsUpdate = true;

    // 番号画像の目標縦画素数。表示縦画素数（画素密度倍率を含む）に帯の高さ割合と文字高割合を掛け、下限上限で挟む。
    const targetTexelSize = clamp(
      Math.round(devicePixelHeight * (1 / slotCount) * LABEL_HEIGHT_FRACTION),
      LABEL_MIN_TEXEL,
      LABEL_MAX_TEXEL
    );
    const regenerate = targetTexelSize !== lastTexelSize;
    if (regenerate) {
      lastTexelSize = targetTexelSize;
    }

    for (let slotIndex = 0; slotIndex < slotCount; slotIndex += 1) {
      const entry = labels[slotIndex];
      const centerY = overlayPointFromNormalized(
        0,
        slotCenterNormalizedY(slotIndex, slotCount),
        aspect
      ).y;
      entry.mesh.position.set(labelCenterX, centerY, 0);
      if (regenerate) {
        if (entry.texture !== null) {
          entry.texture.dispose();
        }
        const texture = makeLabelTexture(slotDisplayNumber(slotIndex), targetTexelSize);
        entry.texture = texture;
        entry.material.map = texture;
        entry.material.needsUpdate = true;
      }
    }
  }

  function dispose(): void {
    boundaryGeometry.dispose();
    boundaryMaterial.dispose();
    for (const entry of labels) {
      entry.mesh.geometry.dispose();
      if (entry.texture !== null) {
        entry.texture.dispose();
      }
      entry.material.dispose();
    }
  }

  return { object3d: group, layout, dispose };
}
