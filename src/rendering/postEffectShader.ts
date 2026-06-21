// 拍同期ポストエフェクト（Issue #17）のシェーダ定義。周縁減光（ビネット）と強拍時の色収差バーストを1枚の
// フラグメントシェーダで束ねる。ブルーム後処理の合成器（bloom.ts）で UnrealBloomPass と OutputPass の間に
// ShaderPass として挿入し、線形空間で作用させる（OutputPass を唯一の色管理段に保つ）。
//
// この数式は検証用の純粋関数 postEffectMath.ts と同じものであり、数式そのものの正しさ（中心と四隅の値・
// 単調性・距離比例）は同モジュールの単体テストで担保する。GLSL は node 環境で実行できないため、ここでは
// 表示用の式を持ち、検証は postEffectMath.ts の同式で行う。

import { Vector2 } from "three";
import { POST_VIGNETTE_INNER, POST_VIGNETTE_OUTER } from "./constants";

// 定数を GLSL のfloatリテラルへ整形する。理由を先に述べる。GLSL のfloatは小数点を要求するため、整数値でも
// 小数点付きの文字列にして構文エラーを防ぐ。値の単一定義（constants.ts）をシェーダ文字列へ埋め込み、二重定義を
// 避ける。
function glslFloat(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : `${value}`;
}

const VIGNETTE_INNER_GLSL = glslFloat(POST_VIGNETTE_INNER);
const VIGNETTE_OUTER_GLSL = glslFloat(POST_VIGNETTE_OUTER);

// ShaderPass に渡すシェーダ定義。ShaderPass は uniforms を複製し、tDiffuse へ前段の描画結果を注入する。
export const VIGNETTE_CHROMA_SHADER = {
  name: "VignetteChromaShader",
  uniforms: {
    // 前段（ブルーム）の描画結果。ShaderPass が読みバッファを注入する。
    tDiffuse: { value: null as null | unknown },
    // 周縁減光の基準強度（生成時に定数で一度だけ設定し、実行時には変えない）。
    vignetteStrength: { value: 0 },
    // 色収差の最大ずれ（バースト強度×最大ずれ量、毎フレーム駆動）。0で色収差なし。
    chromaOffset: { value: 0 },
    // 表示寸法（縦横比の算出に使う）。
    resolution: { value: new Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float vignetteStrength;
    uniform float chromaOffset;
    uniform vec2 resolution;

    // 周縁減光を始めない中心の半径と、最大に達する半径（中心0・四隅1の正規化距離。constants.ts と同値）。
    const float VIGNETTE_INNER = ${VIGNETTE_INNER_GLSL};
    const float VIGNETTE_OUTER = ${VIGNETTE_OUTER_GLSL};

    void main() {
      vec2 d = vUv - 0.5;
      // 縦横比で補正した距離（強さの基準）。四隅で1になるよう四隅までの長さで割る。
      float aspect = resolution.x / resolution.y;
      vec2 p = vec2(d.x * aspect, d.y);
      float maxLen = max(length(vec2(0.5 * aspect, 0.5)), 1e-4);
      float dist = length(p) / maxLen;

      // 色収差の向きは生の画面座標空間で取る（距離はアスペクト補正空間で測る。基準が異なるのは、横長画面で
      // 横方向のずれだけ過大になるのを避けるため）。中心での0除算を避けるため下限を設ける。
      vec2 dirUv = d / max(length(d), 1e-4);
      vec2 shift = dirUv * chromaOffset * dist;
      // 緑を基準に赤と青を逆方向へずらす（緑は輝度感度が最も強く、固定するとにじみを最小に保ったまま色ずれだけ
      // を知覚させられる）。
      float r = texture2D(tDiffuse, vUv + shift).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - shift).b;
      vec3 color = vec3(r, g, b);

      // 周縁減光は色収差を乗せた後の色に掛ける（周縁の色ずれも一緒に暗くなり一体感が出る）。
      float falloff = smoothstep(VIGNETTE_INNER, VIGNETTE_OUTER, dist);
      float vignette = 1.0 - vignetteStrength * falloff;
      color *= vignette;

      gl_FragColor = vec4(color, 1.0);
    }
  `,
};
