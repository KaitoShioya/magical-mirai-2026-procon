// 落下ノーツの消滅エフェクト（波紋の輪としぶきの粒）。ノーツが自分の線分に到達した瞬間に1つ発火し、寿命を持つ
// 一過性の表示物として動く。2次元層・加算合成で、暗い背景の上に発光する。波紋の輪は芯の半径から最大半径へ広がりながら
// 薄れ、しぶきの粒は放射状に外へ飛んで薄れる。色はノーツと同じネオンシアン。
// 寿命管理は経過時間と末尾入れ替えによる除去で行う（反応の蝶 butterflyFigures.ts と同じ考え方）。
// 状態を読んで描くビューであり、判定・得点・時刻の論理を持たない（依存規則 docs/decisions/architecture.md §5）。
// 1つのバーストは波紋の輪（四角形1枚）としぶきの粒（複数の小四角形を1つにまとめた形状1枚）の2回の描画にまとめる。

import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Mesh,
  type Object3D,
  PlaneGeometry,
  ShaderMaterial,
} from "three";

/** 消滅エフェクトの寿命（ミリ秒）。採用理由を先に述べる。手応え演出は0.1秒から0.3秒で末尾を緩めるのが定石で、
 *  その範囲内の180ミリ秒なら普通の密度のノーツで消滅エフェクトが積み重なって見えない。 */
export const NOTE_BURST_LIFETIME_MS = 180;

/** しぶきの粒の数。 */
const SPARK_COUNT = 5;

/** ネオンシアン（落下ノーツと同じ 0x7ec8e3 の各チャンネル 0..1）。 */
const BURST_COLOR_RGB: readonly [number, number, number] = [0x7e / 255, 0xc8 / 255, 0xe3 / 255];

// イーズアウト（末尾を緩める）。1 − (1 − t)^2。手応え演出の減衰の定石に合わせる。
function easeOut(t: number): number {
  const c = 1 - t;
  return 1 - c * c;
}

// --- 波紋の輪のシェーダー ---
// 四角形の中心からの距離 d（0..1、1が四角形の縁）で、縁近くの細い輪を描く。輪の明るさは寿命の進みで薄れる。
const RING_VERTEX = /* glsl */ `
  varying vec2 vCoord;
  void main() {
    vCoord = (uv - 0.5) * 2.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const RING_FRAGMENT = /* glsl */ `
  varying vec2 vCoord;
  uniform vec3 uColor;
  uniform float uLifeU;
  void main() {
    float d = length(vCoord);
    // 縁近く（d≒0.82）の細い輪。
    float ring = smoothstep(0.66, 0.82, d) * smoothstep(0.98, 0.82, d);
    // 寿命が進むほど薄れる（末尾を緩める）。
    float fade = 1.0 - uLifeU;
    fade = fade * fade;
    vec3 composed = uColor * ring * fade * 1.4;
    gl_FragColor = vec4(composed, 1.0);
  }
`;

// --- しぶきの粒のシェーダー ---
// 各粒は小四角形。頂点ごとに粒の番号（aSparkIndex）と粒の中の隅（aCorner）を持つ。粒は中心から外向きへ、寿命の進みで
// 距離を伸ばす。粒の向きは等間隔角度に基準角度（uPhase）を足した決定的な値。
const SPARK_VERTEX = /* glsl */ `
  attribute float aSparkIndex;
  attribute vec2 aCorner;
  uniform float uLifeU;
  uniform float uPhase;
  uniform float uMaxDistance;
  uniform float uSparkSize;
  varying vec2 vCorner;
  void main() {
    vCorner = aCorner;
    float angle = uPhase + (aSparkIndex / ${SPARK_COUNT}.0) * 6.2831853;
    vec2 dir = vec2(cos(angle), sin(angle));
    // 末尾を緩めて外へ。
    float travel = (1.0 - (1.0 - uLifeU) * (1.0 - uLifeU)) * uMaxDistance;
    vec2 pos = dir * travel + aCorner * uSparkSize;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 0.0, 1.0);
  }
`;
const SPARK_FRAGMENT = /* glsl */ `
  varying vec2 vCorner;
  uniform vec3 uColor;
  uniform float uLifeU;
  void main() {
    float d = length(vCorner);
    float dot = smoothstep(1.0, 0.0, d);
    float fade = 1.0 - uLifeU;
    fade = fade * fade;
    vec3 composed = uColor * dot * fade * 1.2;
    gl_FragColor = vec4(composed, 1.0);
  }
`;

/** しぶきの粒の集合（小四角形を SPARK_COUNT 個まとめた形状）を作る。共有して全バーストで使う。 */
function createSparkGeometry(): BufferGeometry {
  const positions: number[] = [];
  const sparkIndices: number[] = [];
  const corners: number[] = [];
  const indices: number[] = [];
  const cornerOffsets: ReadonlyArray<readonly [number, number]> = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  for (let s = 0; s < SPARK_COUNT; s += 1) {
    const base = s * 4;
    for (const [cx, cy] of cornerOffsets) {
      positions.push(0, 0, 0); // 実位置は頂点シェーダーで決めるため原点を置く。
      sparkIndices.push(s);
      corners.push(cx, cy);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aSparkIndex", new Float32BufferAttribute(sparkIndices, 1));
  geometry.setAttribute("aCorner", new Float32BufferAttribute(corners, 2));
  geometry.setIndex(indices);
  return geometry;
}

interface BurstSlot {
  group: Group;
  ringMaterial: ShaderMaterial;
  sparkMaterial: ShaderMaterial;
  active: boolean;
  elapsedMs: number;
  x: number;
  y: number;
  coreRadius: number;
  maxRadius: number;
}

/** 直近の活動中バーストの1つぶんの標本（受け入れ診断・スモークが読む）。 */
export interface NoteBurstSample {
  readonly x: number;
  readonly y: number;
  /** 現在の波紋の輪の半径。 */
  readonly radius: number;
  /** 強度（寿命の残り、1で発火直後・0で消滅）。 */
  readonly intensity: number;
}

/** 消滅エフェクトのプールの外部契約。 */
export interface NoteBurst {
  /** 2次元層へ載せる本体。 */
  readonly object: Object3D;
  /**
   * 発火。指定位置に消滅エフェクトを1つ生成する。空きが無いとき（同時上限超過）は生成せず偽を返す。
   * phase は方向の基準角度（ノーツごとに決定的）、maxRadius は波紋の最大半径、coreRadius はノーツの芯の半径。
   */
  spawn(input: { x: number; y: number; phase: number; coreRadius: number; maxRadius: number }): boolean;
  /** 経過時間で更新する。寿命を過ぎたバーストを消す。 */
  update(deltaSeconds: number): void;
  /** 活動中のバーストの数。 */
  activeCount(): number;
  /** 同時上限超過で生成を抑制した累計回数。silent な切り捨てを避けるため公開する。 */
  suppressedCount(): number;
  /** 直近の活動中バーストの1つぶんの標本（無ければ null）。 */
  sample(): NoteBurstSample | null;
  /** 後始末。生成した形状・材質を解放する。冪等。 */
  dispose(): void;
}

/**
 * 消滅エフェクトのプールを生成する。capacity は同時に存在できる上限。波紋の輪としぶきの粒の形状は全バーストで共有し、
 * 材質はバーストごとに持つ（寿命の進み・色・基準角度をバーストごとに与えるため）。
 */
export function createNoteBurst(options: { capacity: number; renderOrder: number }): NoteBurst {
  const capacity = Math.max(1, Math.floor(options.capacity));
  const group = new Group();

  const ringGeometry = new PlaneGeometry(1, 1);
  const sparkGeometry = createSparkGeometry();

  const slots: BurstSlot[] = [];
  for (let i = 0; i < capacity; i += 1) {
    const ringMaterial = new ShaderMaterial({
      uniforms: {
        uColor: { value: new Color(...BURST_COLOR_RGB) },
        uLifeU: { value: 0 },
      },
      vertexShader: RING_VERTEX,
      fragmentShader: RING_FRAGMENT,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
    });
    const sparkMaterial = new ShaderMaterial({
      uniforms: {
        uColor: { value: new Color(...BURST_COLOR_RGB) },
        uLifeU: { value: 0 },
        uPhase: { value: 0 },
        uMaxDistance: { value: 0 },
        uSparkSize: { value: 0 },
      },
      vertexShader: SPARK_VERTEX,
      fragmentShader: SPARK_FRAGMENT,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
    });

    const slotGroup = new Group();
    const ringMesh = new Mesh(ringGeometry, ringMaterial);
    ringMesh.renderOrder = options.renderOrder;
    const sparkMesh = new Mesh(sparkGeometry, sparkMaterial);
    sparkMesh.renderOrder = options.renderOrder + 1;
    slotGroup.add(ringMesh);
    slotGroup.add(sparkMesh);
    slotGroup.visible = false;
    group.add(slotGroup);

    slots.push({
      group: slotGroup,
      ringMaterial,
      sparkMaterial,
      active: false,
      elapsedMs: 0,
      x: 0,
      y: 0,
      coreRadius: 0,
      maxRadius: 0,
    });
  }

  let activeCountValue = 0;
  let suppressed = 0;
  let disposed = false;

  function applySlot(slot: BurstSlot): void {
    const lifeU = Math.min(1, slot.elapsedMs / NOTE_BURST_LIFETIME_MS);
    const ringRadius = slot.coreRadius + easeOut(lifeU) * (slot.maxRadius - slot.coreRadius);
    slot.group.position.set(slot.x, slot.y, 0);
    // 波紋の輪は四角形の半幅を半径に合わせて拡大する。
    const ringChild = slot.group.children[0] as Mesh;
    ringChild.scale.set(ringRadius, ringRadius, 1);
    slot.ringMaterial.uniforms.uLifeU.value = lifeU;
    slot.sparkMaterial.uniforms.uLifeU.value = lifeU;
  }

  return {
    object: group,
    spawn(input): boolean {
      // 空きスロットを探す。
      let slot: BurstSlot | null = null;
      for (const candidate of slots) {
        if (!candidate.active) {
          slot = candidate;
          break;
        }
      }
      if (slot === null) {
        suppressed += 1;
        return false;
      }
      slot.active = true;
      slot.elapsedMs = 0;
      slot.x = input.x;
      slot.y = input.y;
      slot.coreRadius = input.coreRadius;
      slot.maxRadius = input.maxRadius;
      slot.group.visible = true;
      slot.sparkMaterial.uniforms.uPhase.value = input.phase;
      // しぶきの最大飛距離は波紋の最大半径の0.9倍、粒の大きさは芯の半径の0.6倍。
      slot.sparkMaterial.uniforms.uMaxDistance.value = input.maxRadius * 0.9;
      slot.sparkMaterial.uniforms.uSparkSize.value = input.coreRadius * 0.6;
      applySlot(slot);
      activeCountValue += 1;
      return true;
    },
    update(deltaSeconds): void {
      const deltaMs = Math.max(0, deltaSeconds * 1000);
      let count = 0;
      for (const slot of slots) {
        if (!slot.active) {
          continue;
        }
        slot.elapsedMs += deltaMs;
        if (slot.elapsedMs >= NOTE_BURST_LIFETIME_MS) {
          slot.active = false;
          slot.group.visible = false;
          continue;
        }
        applySlot(slot);
        count += 1;
      }
      activeCountValue = count;
    },
    activeCount(): number {
      return activeCountValue;
    },
    suppressedCount(): number {
      return suppressed;
    },
    sample(): NoteBurstSample | null {
      for (const slot of slots) {
        if (slot.active) {
          const lifeU = Math.min(1, slot.elapsedMs / NOTE_BURST_LIFETIME_MS);
          const radius = slot.coreRadius + easeOut(lifeU) * (slot.maxRadius - slot.coreRadius);
          return { x: slot.x, y: slot.y, radius, intensity: 1 - lifeU };
        }
      }
      return null;
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      ringGeometry.dispose();
      sparkGeometry.dispose();
      for (const slot of slots) {
        slot.ringMaterial.dispose();
        slot.sparkMaterial.dispose();
      }
    },
  };
}
