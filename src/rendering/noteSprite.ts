// 落下ノーツの造形（発光する水滴・オーブ）。2次元層の四角形1枚に、中心からの距離で色を決める断片ごとの色計算を載せ、
// 加算合成で暗い背景の上に発光させる。芯（中心の明るい光）・縁の光（輪郭の細い輪）・にじみ（外側の柔らかい発光）・
// 艶（中心からやや上の小さな光沢）を重ねる。2次元層は3次元シーンの発光後処理（ブルーム）の対象外のため、にじみは
// この計算自身で作る。接近の脈動は uApproach（遠いとき0、線分に近いとき1）で控えめに明るさを増す（可読性優先で振幅は小）。
// 状態を読んで描くビューであり、判定・得点・時刻の論理を持たない（依存規則 docs/decisions/architecture.md §5）。
// 色（ネオンシアン）は落下レーンの識別色 0x7ec8e3 に揃える。

import {
  AdditiveBlending,
  Color,
  type Object3D,
  PlaneGeometry,
  ShaderMaterial,
  Mesh,
} from "three";

// 四角形の中で芯が占める半径（中心 d=0 から d=1 が四角形の縁）。四角形の半幅は芯の半径の1.6倍にするため、
// 芯の縁は d = 1 / 1.6 ≒ 0.625 にあたる。芯はそれより内側、にじみは外側へ広がる。
const VERTEX_SHADER = /* glsl */ `
  varying vec2 vCoord;
  void main() {
    // PlaneGeometry(1,1) の uv 0..1 を中心原点・±1 の座標へ写す。
    vCoord = (uv - 0.5) * 2.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  varying vec2 vCoord;
  uniform vec3 uCoreColor;
  uniform vec3 uRimColor;
  uniform vec3 uHighlightColor;
  uniform float uBrightness;
  uniform float uApproach;

  void main() {
    float d = length(vCoord);

    // 芯: 中心で最も明るく、半径0.55へ向けてなめらかに減衰。
    float core = smoothstep(0.55, 0.0, d);
    // 縁の光: 半径0.55付近の細い輪。輪郭を立てる。
    float rim = smoothstep(0.42, 0.55, d) * smoothstep(0.70, 0.55, d);
    // にじみ: 芯の外側へ広がる弱い発光（四角形の縁 d=1 まで）。
    float halo = smoothstep(1.0, 0.55, d) * 0.45;
    // 艶: 中心からやや上に小さく明るい点。立体的な水滴の光沢。
    vec2 highlightCenter = vCoord - vec2(0.0, 0.28);
    float highlight = smoothstep(0.20, 0.0, length(highlightCenter)) * 0.7;

    // 接近の脈動。近いほど控えめに明るさを増す（振幅0.35）。
    float intensity = uBrightness * (1.0 + 0.35 * clamp(uApproach, 0.0, 1.0));

    vec3 composed =
      uCoreColor * (core + halo) * intensity +
      uRimColor * rim * 0.9 * intensity +
      uHighlightColor * highlight * intensity;

    // 加算合成（SRC_ALPHA, ONE）。alpha を1にし、形の外側は composed がほぼ0のため背景を変えない。
    gl_FragColor = vec4(composed, 1.0);
  }
`;

/** ネオンシアン（落下レーンの識別色 0x7ec8e3 の各チャンネル 0..1）。芯とにじみの色。 */
const CORE_COLOR_RGB: readonly [number, number, number] = [0x7e / 255, 0xc8 / 255, 0xe3 / 255];
/** 縁の光と艶の色（白寄り）。輪郭と光沢を明るく見せる。 */
const RIM_COLOR_RGB: readonly [number, number, number] = [0.85, 0.95, 1.0];
const HIGHLIGHT_COLOR_RGB: readonly [number, number, number] = [1.0, 1.0, 1.0];

/** 1つの落下ノーツの造形。四角形のメッシュと、毎フレーム設定する操作を持つ。 */
export interface NoteSprite {
  /** 2次元層へ載せる本体。 */
  readonly mesh: Mesh;
  /** 表示・非表示を切り替える。 */
  setVisible(visible: boolean): void;
  /** 2次元層上の位置（列の中心の横位置・縦位置）を設定する。 */
  setPosition(x: number, y: number): void;
  /** 芯の半径を設定する。四角形の半幅は芯の半径の1.6倍に取り、にじみを四角形に収める。 */
  setCoreRadius(radius: number): void;
  /** 接近の近さ（遠いとき0、線分に近いとき1）を設定する。 */
  setApproach(approach: number): void;
  /** 明るさの倍率を設定する（既定1）。画面全体の波紋が通過する位置で脈動させるために用いる。 */
  setBrightness(value: number): void;
  /** 芯とにじみの色（レーンの固有色、各チャンネル0..1）を設定する。縁の光と艶は白寄りのまま保つ。 */
  setColor(r: number, g: number, b: number): void;
  /** 後始末。材質を解放する（共有ジオメトリは生成側がまとめて解放する）。 */
  dispose(): void;
}

/** 四角形の半幅が芯の半径の何倍か。にじみを四角形に収めるための余白。 */
export const NOTE_SPRITE_HALF_WIDTH_OVER_CORE_RADIUS = 1.6;

/**
 * 落下ノーツの造形を生成する。共有の単位四角形ジオメトリを受け取り、ノーツごとの材質を作る。
 * 材質をノーツごとに持つ理由を先に述べる。プールの数は少なく（最も密集する窓の最大同時数に余裕を足した値）、
 * 接近の脈動と明るさをノーツごとに与えるため、共有のuniformでは個別設定できないので材質を個別に持つ。
 */
export function createNoteSprite(sharedGeometry: PlaneGeometry, renderOrder: number): NoteSprite {
  const material = new ShaderMaterial({
    uniforms: {
      uCoreColor: { value: new Color(...CORE_COLOR_RGB) },
      uRimColor: { value: new Color(...RIM_COLOR_RGB) },
      uHighlightColor: { value: new Color(...HIGHLIGHT_COLOR_RGB) },
      uBrightness: { value: 1 },
      uApproach: { value: 0 },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
  });
  const mesh = new Mesh(sharedGeometry, material);
  mesh.renderOrder = renderOrder;
  mesh.visible = false;

  return {
    mesh,
    setVisible(visible: boolean): void {
      mesh.visible = visible;
    },
    setPosition(x: number, y: number): void {
      mesh.position.set(x, y, 0);
    },
    setCoreRadius(radius: number): void {
      const halfWidth = radius * NOTE_SPRITE_HALF_WIDTH_OVER_CORE_RADIUS;
      mesh.scale.set(halfWidth, halfWidth, 1);
    },
    setApproach(approach: number): void {
      material.uniforms.uApproach.value = approach;
    },
    setBrightness(value: number): void {
      material.uniforms.uBrightness.value = value;
    },
    setColor(r: number, g: number, b: number): void {
      (material.uniforms.uCoreColor.value as Color).setRGB(r, g, b);
    },
    dispose(): void {
      material.dispose();
    },
  };
}

/** 共有の単位四角形ジオメトリを作る（中心原点、幅・高さ1）。生成側が全ノーツで共有し、まとめて解放する。 */
export function createNoteSpriteGeometry(): PlaneGeometry {
  return new PlaneGeometry(1, 1);
}

/** 2次元層へ載せる本体の型（落下レーンが束ねるためのもの）。 */
export type NoteSpriteObject = Object3D;
