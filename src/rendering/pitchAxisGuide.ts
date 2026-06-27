// 本編左端のY軸音程ガイド（Issue #58・Issue #199）。2次元層へ載せる純粋な表示物で、音程スロットの番号1〜slotCount を
// 画面縦中央の圧縮帯（縦4分の3）に薄く表示し、各番号の縦中央の右側に短い線分を1本ずつ引く。
// 線分の左端は番号の右端、右端は通路の右端（落下ノーツが流れる通路の右端＝画面横4分の1）に合わせる。
// 状態を読んで描くビューであり、判定・得点・時刻の論理を持たない（依存規則 docs/decisions/architecture.md §5）。
// 番号と線分の縦位置は src/utils/pitchSlotAxis.ts の正典に従い、入力（src/input/coordinateMapping.ts）のスロット規約と一致する。
// 横方向の配置（番号の枠の寸法・番号の右端・通路の右端）は src/utils/pitchHudLayout.ts が単一に所有し、落下ノーツと共有する。
//
// 番号画像の画素数の下限と上限・文字高割合・薄さ・色は、本モジュールの単一所有の定数とする。
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
import { slotCenterNormalizedY, slotDisplayNumber } from "../utils/pitchSlotAxis";
import {
  numberBoxHeight,
  numberBoxWidth,
  pitchHudHorizontalLayout,
} from "../utils/pitchHudLayout";

/** 番号画像の縦画素数の下限。これより小さいと数字の線がつぶれて読めなくなるため、読める最小画素数で下支えする。 */
const LABEL_MIN_TEXEL = 24;

/** 番号画像の縦画素数の上限。画面占有寸法を超える画素数は無駄な記憶領域・生成負荷になるため、占有寸法に見合う値で抑える。 */
const LABEL_MAX_TEXEL = 256;

/** 番号画像の正方形の中で数字の高さが占める割合。余白を確保して縁での切れを避けるため1未満にする。 */
const DIGIT_FONT_FRACTION = 0.8;

/** ガイドの不透明度。低いほど3D世界・歌詞を阻害しないが低すぎると視認できないため、薄く読める折衷値とする。 */
const GUIDE_OPACITY = 0.22;

/** 線分と番号文字の色（白）。深夜の暗い背景の上で薄く読めるようにする。 */
const GUIDE_COLOR = 0xffffff;
const DIGIT_FILL_STYLE = "#ffffff";

/** 番号の枠の横幅÷縦幅。番号画像の横画素数を縦画素数から決める際に用いる（横方向の正典 pitchHudLayout と同じ比）。 */
const DIGIT_BOX_ASPECT = 0.62;

/** Y軸音程ガイドの外部契約。 */
export interface PitchAxisGuide {
  /** 2次元層へ載せるまとめ物体。 */
  readonly object3d: Object3D;
  /**
   * 視錐台と現在の表示縦画素数から、線分と番号の位置を再計算する。
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
 * Y軸音程ガイドを生成する。番号（slotCount 枚）と、各番号の縦中央の右側の線分（slotCount 本）を組み立てる。
 * 位置と番号画像は layout で確定する（生成時点では視錐台と表示画素が未確定のため）。
 */
export function createPitchAxisGuide(options: {
  slotCount: number;
  createLabelTexture?: LabelTextureFactory;
}): PitchAxisGuide {
  const slotCount = options.slotCount;
  const makeLabelTexture = options.createLabelTexture ?? createCanvasLabelTexture;
  const group = new Group();

  // 線分は1つの線分集合にまとめる。線分は slotCount 本（各番号の縦中央の右側に1本ずつ）。
  const segmentPositions = new Float32Array(slotCount * 2 * 3);
  const segmentGeometry = new BufferGeometry();
  segmentGeometry.setAttribute("position", new Float32BufferAttribute(segmentPositions, 3));
  const segmentMaterial = new LineBasicMaterial({
    color: GUIDE_COLOR,
    transparent: true,
    opacity: GUIDE_OPACITY,
    depthTest: false,
    depthWrite: false,
  });
  const segmentLines = new LineSegments(segmentGeometry, segmentMaterial);
  segmentLines.renderOrder = OVERLAY_RENDER_ORDER.backgroundReference;
  group.add(segmentLines);

  // 番号の四角形。高さ・幅は横方向の正典 pitchHudLayout が圧縮帯（縦4分の3）を反映して返す。いずれも視錐台に依らず一定。
  const labelPlaneHeight = numberBoxHeight(slotCount);
  const labelPlaneWidth = numberBoxWidth(slotCount);
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
    const horizontal = pitchHudHorizontalLayout(aspect, slotCount);

    // 線分の位置を更新する。各線分は番号の右端から通路の右端まで水平に伸びる。縦位置はスロット中央の正規化Yを写した値。
    const positionAttribute = segmentGeometry.getAttribute("position") as BufferAttribute;
    for (let slotIndex = 0; slotIndex < slotCount; slotIndex += 1) {
      const y = overlayPointFromNormalized(0, slotCenterNormalizedY(slotIndex, slotCount), aspect).y;
      const base = slotIndex * 2 * 3;
      positionAttribute.array[base] = horizontal.numberRightEdgeX;
      positionAttribute.array[base + 1] = y;
      positionAttribute.array[base + 2] = 0;
      positionAttribute.array[base + 3] = horizontal.channelRightX;
      positionAttribute.array[base + 4] = y;
      positionAttribute.array[base + 5] = 0;
    }
    positionAttribute.needsUpdate = true;

    // 番号画像の目標縦画素数。番号の枠の高さ（2次元層の長さ）を画面縦の割合（枠の高さ÷画面全高2）に直し、
    // 表示縦画素数（画素密度倍率を含む）へ掛け、下限上限で挟む。圧縮帯の割合は枠の高さに既に反映されている。
    const targetTexelSize = clamp(
      Math.round(devicePixelHeight * (labelPlaneHeight / 2)),
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
      entry.mesh.position.set(horizontal.numberCenterX, centerY, 0);
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
    segmentGeometry.dispose();
    segmentMaterial.dispose();
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
