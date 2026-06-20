// 確定可読性指定を troika の Text へ反映する薄い部分と、troika の機能の有無を実行時に判定する部分、
// 可読性下地を描く部分。判定・得点・時刻の論理は持たず、profiles・tools は import しない
// （依存規則 docs/decisions/architecture.md §5）。
//
// 設計の要点（プラン「解決済みの描画モード」）:
// - 縁取りと影モード: 縁取りを stroke、影を outline のずれとぼかしで描く。
// - 縁取りのみモード: outline を縁取り（ずれなし）に使い、別建ての影を持たない。
// - 縁取りと下地モード: 上記に可読性下地を加える。
// 縁取りと影はいずれも暗い分離側で、塗りだけが明るい前景（発光抑制の対象）である。

import { Mesh, PlaneGeometry, MeshBasicMaterial, DoubleSide } from "three";
import type { Object3D } from "three";
import { Text } from "troika-three-text";
import type { ReadabilityCapability, ResolvedReadabilityStyle } from "./types";

/**
 * troika の Text 実体に対し、可読性に使うプロパティが反映できるかを判定する。
 * 採用理由を先に述べる。型宣言だけでは実体での反映を保証できないため、実体のプロパティの有無を調べて
 * 機能可否を確定し、確実に効く機構を主に据える。
 */
export function detectReadabilityCapability(text: object): ReadabilityCapability {
  const has = (key: string): boolean => key in text;
  return {
    stroke: has("strokeWidth") && has("strokeColor") && has("strokeOpacity"),
    outlineOffset: has("outlineOffsetX") && has("outlineOffsetY"),
    outlineBlur: has("outlineBlur"),
  };
}

/** 反映対象の Text が持つ可読性プロパティ（型宣言の Text の部分集合）。テストで擬似に差し替える。 */
export interface ReadableTextTarget {
  color: number | string;
  strokeWidth?: number | string;
  strokeColor?: number | string;
  strokeOpacity?: number;
  outlineWidth: number | string;
  outlineColor: number | string;
  outlineOpacity?: number;
  outlineOffsetX?: number | string;
  outlineOffsetY?: number | string;
  outlineBlur?: number | string;
}

/**
 * 確定可読性指定の最後段（塗り色・縁取り・影）を Text へ反映する。寸法は変えない。
 * まず縁取りと影の各プロパティを無効値へ戻してから、描画モードに応じて設定する。
 * 理由は、再利用で前の文字の縁取りや影が残るのを防ぐためである。
 */
export function applyReadableTextStyle(
  text: ReadableTextTarget,
  style: ResolvedReadabilityStyle
): void {
  text.color = style.fillColor;
  // 既定値へ戻す（再利用時の残留を防ぐ）。
  text.strokeWidth = 0;
  text.strokeOpacity = 1;
  text.outlineWidth = 0;
  text.outlineOpacity = 1;
  text.outlineOffsetX = 0;
  text.outlineOffsetY = 0;
  text.outlineBlur = 0;

  if (style.borderVia === "stroke") {
    text.strokeColor = style.borderColor;
    text.strokeWidth = style.borderWidth;
    text.strokeOpacity = style.borderOpacity;
    if (style.hasShadow) {
      text.outlineColor = style.shadowColor;
      text.outlineWidth = style.shadowWidth;
      text.outlineOpacity = style.shadowOpacity;
      text.outlineOffsetX = style.shadowOffsetX;
      text.outlineOffsetY = style.shadowOffsetY;
      text.outlineBlur = style.shadowBlur;
    }
  } else {
    // 縁取りを outline で描く（ずれなし）。別建ての影は持たない。
    text.outlineColor = style.borderColor;
    text.outlineWidth = style.borderWidth;
    text.outlineOpacity = style.borderOpacity;
  }
}

/** 可読性下地の操作取っ手。主文字の位置・寸法に合わせて配置し、後始末する。 */
export interface ReadabilityBackingObject {
  readonly object: Object3D;
  /** 主文字の位置と基準寸法に合わせて下地を配置する。z は主文字よりわずかに奥へ置く。 */
  setTransform(args: { x: number; y: number; z: number; fontSize: number }): void;
  /**
   * 主文字の拡大倍率に下地を合わせる。理由を先に述べる。単位背面の暗い面は基準寸法（fontSize）から自身の
   * 寸法を作るため、倍率を直接 object.scale へ書くと基準寸法由来の寸法を失う。基準寸法と倍率の両方を保持し、
   * その積で寸法を作り直すことで、倍率変更後も文字に追従した寸法を保つ。
   */
  setScale(scale: number): void;
  /**
   * 主文字の実効不透明度に下地を合わせる。理由を先に述べる。読ませる役のフェードで塗りだけを薄くすると
   * 暗い下地が残るため、下地も同じ実効不透明度で薄くする。単位背面の暗い面は元の不透明度との積にする。
   */
  setOpacity(opacity: number): void;
  /**
   * 配置の確定（sync）を行う。文字形の暗い複製は troika の確定が要り、完了で可視化する。単位背面の暗い面は
   * 確定を要しないため即座に完了とみなす。完了時に callback を呼ぶ（診断が確定を待つために使う）。
   */
  sync(callback?: () => void): void;
  /** GPU資源を解放する。 */
  dispose(): void;
}

/** 可読性下地の生成に使う依存。文字形の暗い複製は troika の Text を使う。 */
export interface BackingDeps {
  /** troika の Text を生成する（エンジンの注入口と同じものを渡す）。 */
  createText: () => Text;
}

// 下地を主文字より奥へ置くz方向のずれ（ワールド単位）。理由を先に述べる。下地を主文字と同じ深さに置くと
// 描画順で主文字と干渉するため、わずかに奥へずらして主文字の背面に確実に置く。
const BACKING_DEPTH_OFFSET = 0.01;
// 単位背面の暗い面の寸法を、基準寸法（fontSize）の何倍にするか（幅と高さそれぞれ）。理由を先に述べる。
// 1文字の字面は基準寸法以下に収まるため、基準寸法に少しの余白を加えた面で文字を覆える。横は字面が縦より
// 狭いことが多いため横0.9倍・縦1.1倍とし、余白を含めて文字を覆う初期値とする（診断で必要に応じ調整する）。
const UNIT_PLATE_WIDTH_FACTOR = 0.9;
const UNIT_PLATE_HEIGHT_FACTOR = 1.1;

/**
 * 確定可読性指定の下地の形に従い、可読性下地を生成する。下地が無いときは null を返す。
 * 文字形の暗い複製は、主文字と同じ文字を暗い塗りで描き、縁取りで字面を太らせて背面の暗い面とする。
 * 単位背面の暗い面は、暗い平面のメッシュとする。代替フォントへ回った文字では文字形の複製が字形を欠くため、
 * 呼び出し側（resolveReadabilityStyle）が単位背面の暗い面を選ぶ。
 */
export function createReadabilityBacking(
  style: ResolvedReadabilityStyle,
  char: string,
  fontUrl: string | null,
  deps: BackingDeps
): ReadabilityBackingObject | null {
  if (style.backing === "none") {
    return null;
  }
  const darkColor = style.shadowColor;
  // 主文字の拡大倍率（setScale で更新）。文字形の暗い複製・単位背面の暗い面ともにこの倍率を反映する。
  let userScale = 1;
  if (style.backing === "glyphCopy") {
    const copy = deps.createText();
    copy.text = char;
    copy.font = fontUrl;
    copy.color = darkColor;
    copy.fillOpacity = 1;
    // 縁取りで字面を太らせ、主文字の塗りを背面から覆う暗い面にする。
    copy.outlineWidth = style.borderWidth;
    copy.outlineColor = darkColor;
    copy.outlineOpacity = 1;
    copy.anchorX = "center";
    copy.anchorY = "middle";
    copy.visible = false;
    return {
      object: copy,
      setTransform: ({ x, y, z, fontSize }): void => {
        // 文字形の複製は寸法を fontSize で持ち、拡大倍率は scale で別に持つ（両者は独立）。
        copy.fontSize = fontSize;
        copy.position.set(x, y, z - BACKING_DEPTH_OFFSET);
      },
      setScale: (scale): void => {
        userScale = scale;
        copy.scale.setScalar(scale);
      },
      setOpacity: (opacity): void => {
        // 文字形の暗い複製は全体が暗い面のため、塗りと縁取りを同じ不透明度で薄くする。
        copy.fillOpacity = opacity;
        copy.outlineOpacity = opacity;
      },
      sync: (callback?: () => void): void => {
        copy.sync(() => {
          copy.visible = true;
          callback?.();
        });
      },
      dispose: (): void => {
        copy.dispose();
      },
    };
  }
  // 単位背面の暗い面。基準寸法（fontSize）と拡大倍率（userScale）の積で平面の寸法を作る。
  const geometry = new PlaneGeometry(1, 1);
  const material = new MeshBasicMaterial({
    color: darkColor,
    transparent: true,
    opacity: style.shadowOpacity,
    side: DoubleSide,
    depthWrite: false,
  });
  const plane = new Mesh(geometry, material);
  // 単位背面の暗い面の元の不透明度（実効不透明度との積に使う）。
  const baseOpacity = style.shadowOpacity;
  let currentFontSize = 0;
  const applyPlaneSize = (): void => {
    plane.scale.set(
      currentFontSize * UNIT_PLATE_WIDTH_FACTOR * userScale,
      currentFontSize * UNIT_PLATE_HEIGHT_FACTOR * userScale,
      1
    );
  };
  return {
    object: plane,
    setTransform: ({ x, y, z, fontSize }): void => {
      currentFontSize = fontSize;
      applyPlaneSize();
      plane.position.set(x, y, z - BACKING_DEPTH_OFFSET);
    },
    setScale: (scale): void => {
      userScale = scale;
      applyPlaneSize();
    },
    setOpacity: (opacity): void => {
      material.opacity = baseOpacity * opacity;
    },
    sync: (callback?: () => void): void => {
      // 平面は配置の確定（sync）を要しないため、即座に完了とみなす。
      callback?.();
    },
    dispose: (): void => {
      geometry.dispose();
      material.dispose();
    },
  };
}
