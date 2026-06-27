// 画面全体の水面の波紋（Issue #202）。ノーツが判定線で弾けた瞬間に、その着水点から薄い波紋が画面全体へ同心円状に
// 広がる。複数の波紋は重ね合わせ（足し合わせ）で互いに干渉し、輪が交わる所で強め合う。背景の3D演出・歌詞を阻害しない
// よう、加算合成で淡く描く（波の輪の所だけがわずかに明るく、ほとんどの画素は素通し）。
// さらに、落下中の他のノーツはこの波面の影響を受ける（波面が通過する位置で小さく揺れ、明るさが脈動する）。その結合の
// ため、波の高さを断片シェーダー（画面表示）と同じ式で CPU でも評価する純粋関数を持ち、ノーツへの影響として公開する。
// 状態を読んで描くビューであり、判定・得点・時刻の論理を持たない（依存規則 docs/decisions/architecture.md §5）。

import {
  AdditiveBlending,
  type BufferAttribute,
  type Object3D,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
} from "three";

/** 同時に存在できる波紋の上限。採用理由を先に述べる。波紋は全画面の断片シェーダーで描くため、同時数が多いほど画素あたりの
 *  計算が増える。淡い背景演出では密集時に何枚も重ねても見分けられず負荷だけ増えるため、控えめに6枚で頭打ちにし、超過時は
 *  最も古い波紋を置き換える。さらにシェーダーは活動中の枚数だけを走査して早期に打ち切るため、波紋が無い通常のフレームでは
 *  画素あたりの計算がほぼ無くなる。 */
export const MAX_RIPPLES = 6;

/** 1つの波紋の寿命（ミリ秒）。採用理由を先に述べる。波面が画面の端まで渡り切る時間として2.4秒を採る。これより短いと画面全体へ
 *  広がる前に消え、長いと薄い輪が画面に残り続けて雑然とする。 */
export const RIPPLE_LIFETIME_MS = 2400;

// 波の形を決める定数（断片シェーダーと CPU 評価で同じ値を使うため、ここで一元的に持つ）。各値は2次元層の座標（縦は ±1、
// 横は ±縦横比）を基準にした量。具体値は実機目視で確定する★暫定。
/** 波面（輪）が広がる速さ（2次元層の長さ毎秒）。寿命2.4秒で約3.8の距離を進み、画面（縦2・横は縦横比の2倍）を渡り切る。 */
const WAVE_SPEED = 1.6;
/** 波面まわりの細かい輪の空間周波数。大きいほど輪が細かい。波長 ≒ 2π ÷ 14 ≒ 0.45。 */
const WAVE_NUMBER = 14.0;
/** 波面のまわりに輪が見える幅（波束の広がり）。大きいほど波面の後ろに何重もの輪が見える。 */
const RING_WIDTH = 0.5;
/** 距離による振幅の減衰。遠いほど弱く（波のエネルギーが広い円周へ分散する様子の近似）。 */
const DIST_FALLOFF = 0.9;
/** 画面表示の明るさ係数。淡く保ち背景を阻害しない。 */
const VISUAL_GAIN = 0.16;
/** 波紋の色（淡い水色）。深夜の暗い背景・3D演出の上に水面らしく薄く乗る。 */
const WATER_COLOR: readonly [number, number, number] = [0.45, 0.78, 1.0];

/** 寿命を秒で表した値（波の式で経過秒を寿命で正規化するのに使う）。 */
const LIFE_SEC = RIPPLE_LIFETIME_MS / 1000;

// --- 他ノーツとの結合（波面がノーツを揺らし明滅させる強さ）---
/** 波の高さの勾配を求める差分の刻み（2次元層の長さ）。 */
const COUPLE_EPS = 0.012;
/** 勾配を位置のずれへ写す係数。波面が急なほど押す。 */
const COUPLE_OFFSET_SCALE = 0.0016;
/** 1つのノーツが波で押される最大のずれ（2次元層の長さ）。レーン幅のごく一部に収め、ノーツの追跡を妨げない。 */
const COUPLE_MAX_OFFSET = 0.022;
/** 波の高さの絶対値を明るさの増分へ写す係数。波面の通過でノーツが脈動する。 */
const COUPLE_BRIGHTNESS = 0.9;
/** 明るさ増分の上限。 */
const COUPLE_MAX_BRIGHTNESS = 1.0;

/** GLSL の float リテラルへ整える（整数値にも小数点を付ける）。 */
function glslFloat(value: number): string {
  return Number.isInteger(value) ? value.toFixed(1) : String(value);
}

// 断片ごとに、活動中の全波紋の高さを足し合わせる（重ね合わせ＝干渉）。各波紋は着水点 o からの距離 d と経過秒 t で決まる。
// 活動中の波紋は配列の先頭から詰めて置き、uCount 枚だけを走査して早期に打ち切る。波紋が無いフレームでは画素あたりの計算が
// ほぼ無くなり、全画面シェーダーの負荷を活動中の枚数に比例させる。
const RIPPLE_HEIGHT_GLSL = /* glsl */ `
  uniform vec2 uOrigins[${MAX_RIPPLES}];
  uniform float uAges[${MAX_RIPPLES}];
  uniform int uCount;
  float rippleHeight(vec2 p) {
    float h = 0.0;
    for (int i = 0; i < ${MAX_RIPPLES}; i++) {
      if (i >= uCount) break; // 活動中の枚数だけ走査する。
      float t = uAges[i];
      vec2 o = uOrigins[i];
      float d = length(p - o);
      float frontRadius = ${glslFloat(WAVE_SPEED)} * t; // 波面の現在の半径。
      float front = d - frontRadius;                    // 波面からの隔たり（0が波面、負が内側）。
      float w = front / ${glslFloat(RING_WIDTH)};
      float packet = exp(-w * w);                       // 波面のまわりに局在する輪。
      float osc = sin(front * ${glslFloat(WAVE_NUMBER)});
      float lifeU = t / ${glslFloat(LIFE_SEC)};
      float fade = 1.0 - lifeU; fade = fade * fade;     // 寿命の進みで薄れる（末尾を緩める）。
      float falloff = 1.0 / (1.0 + d * ${glslFloat(DIST_FALLOFF)});
      h += osc * packet * fade * falloff;
    }
    return h;
  }
`;

const RIPPLE_VERTEX = /* glsl */ `
  varying vec2 vWorld;
  void main() {
    // 全画面の四角形は2次元層の座標へ拡大して載せるため、世界座標がそのまま2次元層の座標になる。
    vWorld = (modelMatrix * vec4(position, 1.0)).xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const RIPPLE_FRAGMENT = /* glsl */ `
  varying vec2 vWorld;
  ${RIPPLE_HEIGHT_GLSL}
  void main() {
    float h = rippleHeight(vWorld);
    // 輪の所（高さの絶対値が大きい所）だけ淡く明るくする。大半の画素は h≒0 で素通し。
    float intensity = abs(h) * ${glslFloat(VISUAL_GAIN)};
    vec3 color = vec3(${glslFloat(WATER_COLOR[0])}, ${glslFloat(WATER_COLOR[1])}, ${glslFloat(WATER_COLOR[2])}) * intensity;
    gl_FragColor = vec4(color, 1.0); // 加算合成（色がほぼ0の所は背景を変えない）。
  }
`;

/** 波が落下ノーツへ及ぼす影響。位置のずれ（2次元層の長さ）と明るさの増分。 */
export interface RippleNoteInfluence {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly brightnessPulse: number;
}

/** 画面全体の波紋の外部契約。 */
export interface RippleField {
  /** 2次元層へ載せる全画面の表示物。 */
  readonly object: Object3D;
  /** 着水点に波紋を1つ立てる。空きが無いときは最も古い波紋を置き換える。 */
  spawn(x: number, y: number): void;
  /** 経過時間で波紋を進め、寿命を過ぎた波紋を消す。 */
  update(deltaSeconds: number): void;
  /** 全画面の四角形を視錐台（縦横比）へ合わせる。毎フレーム、縦横比が変わりうるため呼ぶ。 */
  layout(aspect: number): void;
  /** 指定位置での波の高さ（断片シェーダーと同じ式）。落下ノーツの結合や検証に使う。 */
  sampleHeight(x: number, y: number): number;
  /** 指定位置の落下ノーツが受ける影響（位置のずれと明るさの増分）。 */
  sampleNoteInfluence(x: number, y: number): RippleNoteInfluence;
  /** 活動中の波紋の数。 */
  activeCount(): number;
  /** 後始末。形状・材質を解放する。冪等。 */
  dispose(): void;
}

/**
 * 画面全体の波紋を生成する。全画面の四角形1枚に波の重ね合わせを断片ごとに計算する材質を載せ、加算合成で淡く描く。
 * 波紋の着水点と経過秒は材質のuniform配列で渡し、同じ値を CPU 側でも保持して波の高さの評価（ノーツ結合・検証）に使う。
 */
export function createRippleField(options: { renderOrder: number }): RippleField {
  // 活動中の波紋を配列の先頭から詰めて持つ。count が活動中の枚数（uCount として早期打ち切りに使う）。
  const origins: Vector2[] = Array.from({ length: MAX_RIPPLES }, () => new Vector2(0, 0));
  const ages = new Float32Array(MAX_RIPPLES);
  let count = 0;

  const geometry = new PlaneGeometry(2, 2); // 中心原点・±1。layout で横を縦横比へ拡大して全画面を覆う。
  const material = new ShaderMaterial({
    uniforms: {
      uOrigins: { value: origins },
      uAges: { value: ages },
      uCount: { value: 0 },
    },
    vertexShader: RIPPLE_VERTEX,
    fragmentShader: RIPPLE_FRAGMENT,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.renderOrder = options.renderOrder;
  mesh.frustumCulled = false; // 全画面を覆う固定の板のため視錐台選別を切る。
  // 波紋が無いあいだは全画面の板を描画対象から外す。採用理由を先に述べる。波紋0でも断片シェーダーは早期に打ち切るが、
  // 全画面のラスタライズと加算合成のパス自体は残るため、活動中の波紋が無いフレームではそのパスごと省く。
  mesh.visible = false;

  let disposed = false;

  function heightAt(px: number, py: number): number {
    let h = 0;
    for (let i = 0; i < count; i += 1) {
      const t = ages[i];
      const dx = px - origins[i].x;
      const dy = py - origins[i].y;
      const d = Math.hypot(dx, dy);
      const front = d - WAVE_SPEED * t;
      const w = front / RING_WIDTH;
      const packet = Math.exp(-w * w);
      const osc = Math.sin(front * WAVE_NUMBER);
      let fade = 1 - t / LIFE_SEC;
      fade = fade * fade;
      const falloff = 1 / (1 + d * DIST_FALLOFF);
      h += osc * packet * fade * falloff;
    }
    return h;
  }

  function clampOffset(value: number): number {
    if (value > COUPLE_MAX_OFFSET) {
      return COUPLE_MAX_OFFSET;
    }
    if (value < -COUPLE_MAX_OFFSET) {
      return -COUPLE_MAX_OFFSET;
    }
    return value;
  }

  return {
    object: mesh,
    spawn(x: number, y: number): void {
      // 空きがあれば末尾へ追加。無ければ最も古い（経過秒が最大の）波紋を置き換える。
      let target: number;
      if (count < MAX_RIPPLES) {
        target = count;
        count += 1;
      } else {
        target = 0;
        for (let i = 1; i < count; i += 1) {
          if (ages[i] > ages[target]) {
            target = i;
          }
        }
      }
      origins[target].set(x, y);
      ages[target] = 0;
      material.uniforms.uCount.value = count;
      mesh.visible = true; // 波紋が1つ以上あるので描画対象に戻す。
    },
    update(deltaSeconds: number): void {
      const delta = Math.max(0, deltaSeconds);
      const lifeSec = RIPPLE_LIFETIME_MS / 1000;
      // 加齢し、寿命を過ぎた波紋を取り除いて先頭から詰め直す（活動中を先頭に保つ）。
      let kept = 0;
      for (let i = 0; i < count; i += 1) {
        const aged = ages[i] + delta;
        if (aged < lifeSec) {
          if (kept !== i) {
            origins[kept].copy(origins[i]);
          }
          ages[kept] = aged;
          kept += 1;
        }
      }
      count = kept;
      material.uniforms.uCount.value = count;
      // 活動中の波紋が無くなったら全画面の板を描画対象から外す。
      mesh.visible = count > 0;
    },
    layout(aspect: number): void {
      const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
      // 四角形の横を縦横比へ拡大して2次元層の横全体（±縦横比）を覆う。縦は ±1 のまま。
      mesh.scale.set(safeAspect, 1, 1);
      const position = geometry.getAttribute("position") as BufferAttribute;
      position.needsUpdate = true;
    },
    sampleHeight(x: number, y: number): number {
      return heightAt(x, y);
    },
    sampleNoteInfluence(x: number, y: number): RippleNoteInfluence {
      const h = heightAt(x, y);
      // 波の高さの勾配（中心差分）の向きへ、波面の急さに応じて押す。
      const gradX = (heightAt(x + COUPLE_EPS, y) - heightAt(x - COUPLE_EPS, y)) / (2 * COUPLE_EPS);
      const gradY = (heightAt(x, y + COUPLE_EPS) - heightAt(x, y - COUPLE_EPS)) / (2 * COUPLE_EPS);
      const brightnessPulse = Math.min(COUPLE_MAX_BRIGHTNESS, Math.abs(h) * COUPLE_BRIGHTNESS);
      return {
        offsetX: clampOffset(gradX * COUPLE_OFFSET_SCALE),
        offsetY: clampOffset(gradY * COUPLE_OFFSET_SCALE),
        brightnessPulse,
      };
    },
    activeCount(): number {
      return count;
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      geometry.dispose();
      material.dispose();
    },
  };
}
