// 蝶エンティティ（Issue #61）。多数の蝶を単一の InstancedMesh で描き、羽ばたきシェーダと寿命プールを持つ。
// 状態を読んで描くビューであり、判定・得点・時刻の論理を持たない（依存規則 docs/decisions/architecture.md §5）。
// profiles・tools は import しない。本体シーンへの組み込みと演出（#63）・配置（#62）は下流が担う。
//
// 用途は「演奏中に舞って消えるノーツ効果」の spawn 方式の寿命プール1用途に限定する。索引指定の持続配置は
// 持たせない（用途を混在させると満了個体の詰め替えで索引がずれるため）。楽曲終了後の灯しの持続配置が必要に
// なった時点で、同じジオメトリと派生マテリアルを使う別ファクトリを設ける。

import {
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Object3D,
} from "three";
import {
  BUTTERFLY_BASE_PITCH_RADIANS,
  BUTTERFLY_RISE_SPEED,
  BUTTERFLY_SWAY_AMPLITUDE,
  GLOW_NEON_RGB,
} from "../constants";
import { createButterflyGeometry } from "./butterflyGeometry";
import { createButterflyMaterial } from "./butterflyShader";
import { fadeFactor, lifeProgress, riseOffset, swayOffset } from "./butterflyLifecycle";

/** 1個の蝶を発生させる入力。大きさ・輝度は反応強度の写像（butterflyReactionMapping）の結果を渡す。 */
export interface ButterflySpawnInput {
  /** 発生位置（湖を基準とする3次元座標）。 */
  position: { x: number; y: number; z: number };
  /** 大きさ（タイミング精度→大きさ）。0以上。 */
  scale: number;
  /** 輝度（音程精度→輝度）。0以上。基準色 GLOW_NEON_RGB へ乗算する。 */
  brightness: number;
  /** 寿命秒（出現から消滅まで）。正。 */
  lifeSeconds: number;
  /** 羽ばたき位相。省略時は発生連番から決定的に導出する。 */
  flapPhase?: number;
  /** 上昇速度。省略時は定数 BUTTERFLY_RISE_SPEED。 */
  riseSpeed?: number;
  /** 横揺れ位相。省略時は発生連番から決定的に導出する。 */
  swayPhase?: number;
  /** 横揺れ振幅。省略時は定数 BUTTERFLY_SWAY_AMPLITUDE。 */
  swayAmplitude?: number;
}

/** 蝶エンティティ。 */
export interface ButterflyFigures {
  /** シーンへ追加する本体。下流（#63）が追加する。 */
  readonly object: InstancedMesh;
  /** 同時に保持できる蝶の上限。 */
  readonly capacity: number;
  /** 1個の蝶を発生させる。容量に空きがあれば確保して true、満杯なら false。不正値は例外。 */
  spawn(input: ButterflySpawnInput): boolean;
  /** 現在の活動個体数。 */
  activeCount(): number;
  /** 羽ばたき時間の進行と、寿命の進行・満了個体の回収。 */
  update(deltaSeconds: number): void;
  /** 後始末。生成した形状・材質を解放する。冪等。 */
  dispose(): void;
}

const TAU = Math.PI * 2;
// 黄金角（ラジアン）。採用理由を先に述べる。連番にこの角を掛けて剰余を取ると、少数でも値が偏らず散らばるため、
// 個体ごとの位相を決定的かつ均等に散らせる（Math.random を使うと node 環境のテストが非決定になる）。
const GOLDEN_ANGLE = 2.399963229728653;

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} は有限値でなければなりません（受領: ${value}）`);
  }
}

// 連番から0以上TAU未満の位相を決定的に導出する。
function derivePhase(seed: number): number {
  const v = (seed * GOLDEN_ANGLE) % TAU;
  return v < 0 ? v + TAU : v;
}

// 活動中の1個体の全状態。唯一の真実とし、描画用の3配列（行列・色・位相）はここから writeSlot で作り直す。
interface ActiveRecord {
  x: number;
  y: number;
  z: number;
  scale: number;
  brightness: number;
  lifeSeconds: number;
  elapsed: number;
  flapPhase: number;
  riseSpeed: number;
  swayPhase: number;
  swayAmplitude: number;
}

/**
 * 蝶エンティティを生成する。生成直後の活動個体数は0で何も描かない。spawn で1個ずつ発生させ、update で進める。
 */
export function createButterflyFigures(options: { capacity: number }): ButterflyFigures {
  const { capacity } = options;
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new Error(`容量は正の整数でなければなりません（受領: ${capacity}）`);
  }

  const geometry = createButterflyGeometry();
  const materialHandle = createButterflyMaterial();
  const object = new InstancedMesh(geometry, materialHandle.material, capacity);
  // 任意配置で境界球更新漏れにより画面内の蝶が消えるのを避けるため、視錐台カリングを無効化する。
  object.frustumCulled = false;
  object.instanceMatrix.setUsage(DynamicDrawUsage);

  // 全スロットの色を黒で初期化して instanceColor を確保し、未設定スロットの白残りを防ぐ（glowPoints と同根拠）。
  const black = new Color(0, 0, 0);
  for (let i = 0; i < capacity; i += 1) {
    object.setColorAt(i, black);
  }
  object.instanceColor!.setUsage(DynamicDrawUsage);
  object.instanceColor!.needsUpdate = true;

  // 個体ごとの羽ばたき位相（インスタンス属性）。InstancedMesh 専用APIの instanceMatrix・instanceColor と違い
  // 通常のジオメトリ属性として供給されるため、書き換え時は自分で needsUpdate を立てる必要がある。
  const phaseAttr = new InstancedBufferAttribute(new Float32Array(capacity), 1);
  phaseAttr.setUsage(DynamicDrawUsage);
  geometry.setAttribute("aBflyPhase", phaseAttr);

  object.count = 0;

  // 唯一の真実。配列の索引がそのままインスタンスのスロット索引に対応する。
  const active: ActiveRecord[] = [];
  let spawnCounter = 0;
  let flapElapsedSec = 0;
  let disposed = false;

  const dummy = new Object3D();
  const workColor = new Color();

  // レコードから該当スロットの行列・色・位相を一括生成する唯一の書き込み経路。
  // 3配列を別々に書く箇所を作らないことで、満了個体の詰め替え時の更新漏れを構造的に防ぐ。
  function writeSlot(index: number, record: ActiveRecord): void {
    const u = lifeProgress(record.elapsed, record.lifeSeconds);
    const fade = fadeFactor(u);
    const rise = riseOffset(record.elapsed, record.riseSpeed);
    const sway = swayOffset(record.elapsed, record.swayPhase, record.swayAmplitude);
    dummy.position.set(record.x + sway.x, record.y + rise, record.z + sway.z);
    // 蝶を地面に垂直ではなく自然な姿勢へ寝かせる。生成時の翅面（xy平面）を横軸まわりに倒して水平近くにし、
    // 背面を上へ向ける（蝶の飛翔・背面日光浴の姿勢）。羽ばたきはシェーダが姿勢を倒す前のローカル空間で胴軸
    // まわりに加えるため、この姿勢回転と独立に正しく働く。
    dummy.rotation.set(BUTTERFLY_BASE_PITCH_RADIANS, 0, 0);
    dummy.scale.setScalar(record.scale * fade);
    dummy.updateMatrix();
    object.setMatrixAt(index, dummy.matrix);

    // 色は固定のネオンブルーへ輝度とフェードを乗じる。発光のため1を超え得る（ブルームで光る）。
    workColor.r = GLOW_NEON_RGB[0] * record.brightness * fade;
    workColor.g = GLOW_NEON_RGB[1] * record.brightness * fade;
    workColor.b = GLOW_NEON_RGB[2] * record.brightness * fade;
    object.setColorAt(index, workColor);

    phaseAttr.array[index] = record.flapPhase;
  }

  function markNeedsUpdate(): void {
    object.instanceMatrix.needsUpdate = true;
    if (object.instanceColor) {
      object.instanceColor.needsUpdate = true;
    }
    phaseAttr.needsUpdate = true;
  }

  function spawn(input: ButterflySpawnInput): boolean {
    assertFinite(input.position.x, "発生位置x");
    assertFinite(input.position.y, "発生位置y");
    assertFinite(input.position.z, "発生位置z");
    assertFinite(input.scale, "大きさ");
    assertFinite(input.brightness, "輝度");
    assertFinite(input.lifeSeconds, "寿命秒");
    if (input.scale < 0) {
      throw new Error(`大きさは0以上でなければなりません（受領: ${input.scale}）`);
    }
    if (input.brightness < 0) {
      throw new Error(`輝度は0以上でなければなりません（受領: ${input.brightness}）`);
    }
    if (input.lifeSeconds <= 0) {
      throw new Error(`寿命秒は正でなければなりません（受領: ${input.lifeSeconds}）`);
    }
    if (input.flapPhase !== undefined) assertFinite(input.flapPhase, "羽ばたき位相");
    if (input.riseSpeed !== undefined) assertFinite(input.riseSpeed, "上昇速度");
    if (input.swayPhase !== undefined) assertFinite(input.swayPhase, "横揺れ位相");
    if (input.swayAmplitude !== undefined) assertFinite(input.swayAmplitude, "横揺れ振幅");

    if (active.length >= capacity) {
      return false;
    }
    const index = active.length;
    const record: ActiveRecord = {
      x: input.position.x,
      y: input.position.y,
      z: input.position.z,
      scale: input.scale,
      brightness: input.brightness,
      lifeSeconds: input.lifeSeconds,
      elapsed: 0,
      flapPhase: input.flapPhase ?? derivePhase(spawnCounter),
      riseSpeed: input.riseSpeed ?? BUTTERFLY_RISE_SPEED,
      swayPhase: input.swayPhase ?? derivePhase(spawnCounter + 0.5),
      swayAmplitude: input.swayAmplitude ?? BUTTERFLY_SWAY_AMPLITUDE,
    };
    spawnCounter += 1;
    active.push(record);
    object.count = active.length;
    writeSlot(index, record);
    markNeedsUpdate();
    return true;
  }

  function update(deltaSeconds: number): void {
    if (disposed) {
      return;
    }
    assertFinite(deltaSeconds, "経過秒");
    const dt = deltaSeconds > 0 ? deltaSeconds : 0;

    // 羽ばたきは全個体共通の累積秒で進める。ユニフォーム値の更新は次の描画で反映されるため needsUpdate は不要。
    flapElapsedSec += dt;
    materialHandle.setTimeSec(flapElapsedSec);

    // 各活動個体の寿命を進め、満了個体は末尾と入れ替えて回収する（swap-remove）。
    let i = 0;
    while (i < active.length) {
      const record = active[i];
      record.elapsed += dt;
      if (record.elapsed >= record.lifeSeconds) {
        // 満了。末尾の活動個体を索引 i へ移し、末尾を取り除く。object.count を詰めるため穴が残らない。
        const last = active.length - 1;
        active[i] = active[last];
        active.pop();
        object.count = active.length;
        // 移ってきた個体はこのフレームでまだ寿命を進めていないため、索引を進めず次の周回で処理する。
      } else {
        writeSlot(i, record);
        i += 1;
      }
    }
    markNeedsUpdate();
  }

  function dispose(): void {
    if (disposed) {
      return;
    }
    disposed = true;
    object.dispose();
    geometry.dispose();
    materialHandle.dispose();
  }

  return {
    object,
    capacity,
    spawn,
    activeCount: () => active.length,
    update,
    dispose,
  };
}
