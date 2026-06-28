// 持続配置の蝶（灯し）エンティティ（本タスク）。得点が出たタップごとにカメラの通過点へ1個ずつ追加し、楽曲終了まで
// 消えずに残す。一過性の蝶（butterflyFigures、演奏中に舞って消える寿命プール）とは別系統である。
// 状態を読んで描くビューであり、判定・得点・時刻の論理を持たない（依存規則 docs/decisions/architecture.md §5）。
// profiles・scoring・tools は import しない。配置位置・大きさ強度・輝度強度・近距離フェード旗は素の数値で受け取る。
//
// 設計の要点を先に述べる。蝶曲線ジオメトリと羽ばたきシェーダ（butterflyShader）を流用するが、灯しは羽ばたかず静止する
// ため時間は進めず、羽ばたきシェーダの個体位相 aBflyPhase を「配置順に対し連続的に変化する翅の開き角」に用いる
// （時間を止めると開き角＝振幅×sin(位相)の静的値になり、位相を配置順で増やすと翅角が軌跡上で連続変化する）。
// 個体の姿勢（水平へ寝かせる）はインスタンス行列の回転で与える（羽ばたきは行列適用前のローカル空間で効くため、
// 姿勢回転と独立に正しく働く）。退化時に配置した個体は近距離フェードの対象とし、毎フレームの update(cameraPosition) で
// カメラ距離に応じて輝度を淡い表示から本来の輝度へ補間する。

import {
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Object3D,
  Quaternion,
  Vector3,
} from "three";
import {
  BUTTERFLY_BASE_PITCH_RADIANS,
  GLOW_NEON_RGB,
  LANTERN_BUTTERFLY_FULL_REVEAL_DISTANCE,
  LANTERN_BUTTERFLY_NEAR_FADE_DISTANCE,
  LANTERN_BUTTERFLY_SCALE_MAX,
  LANTERN_BUTTERFLY_SCALE_MIN,
  LANTERN_BUTTERFLY_WING_AMPLITUDE,
  LANTERN_BUTTERFLY_WING_PHASE_STEP,
  PERSISTENT_BUTTERFLY_BRIGHTNESS_MAX,
  PERSISTENT_BUTTERFLY_BRIGHTNESS_MIN,
} from "../constants";
import { createButterflyGeometry } from "./butterflyGeometry";
import { createButterflyMaterial } from "./butterflyShader";
import {
  finaleLocalProgress,
  finaleBrightnessMultiplier,
  type FinaleParams,
} from "../../utils/finaleReveal";

/** 持続配置の蝶を1個追加する入力。大きさ強度・輝度強度は反応強度の0以上1以下の素の数値で、得点層の型は受け取らない。 */
export interface LanternButterflyAddInput {
  /** 配置位置（湖を基準とする3次元座標。前方オフセット適用済みの座標を上流が渡す）。 */
  position: { x: number; y: number; z: number };
  /** 蝶の向き（軌道＝カメラ進行方向）の水平成分X。0,0のときは向き無し（既定姿勢のまま）。 */
  headingX: number;
  /** 蝶の向き（軌道＝カメラ進行方向）の水平成分Z。0,0のときは向き無し（既定姿勢のまま）。 */
  headingZ: number;
  /** 大きさ強度（タイミング精度由来、0以上1以下）。実寸スケールへ写像する。 */
  sizeStrength: number;
  /** 輝度強度（音程精度由来、0以上1以下）。上限付き写像で輝度へ写像する。 */
  brightnessStrength: number;
  /** 近距離フェードの対象か（退化時の配置で真）。真の個体は update でカメラ距離に応じて輝度が変わる。 */
  nearFade: boolean;
}

/** 持続配置の蝶エンティティ。 */
export interface LanternButterflyFigures {
  /** シーンへ追加する本体。下流が世界シーンへ追加する。 */
  readonly object: InstancedMesh;
  /** 収容できるインスタンスの上限。 */
  readonly capacity: number;
  /** 1個追加する。容量に空きがあれば確保して true、満杯なら何もせず false。 */
  add(input: LanternButterflyAddInput): boolean;
  /** 近距離フェード対象の個体の輝度を、カメラ位置との距離に応じて更新する（色のみ反映）。対象が無ければ何もしない。 */
  update(cameraPosition: { x: number; y: number; z: number }): void;
  /**
   * 楽曲終了後の灯し立ち上げ演出（Issue #63）を適用する。先頭から count 個の各個体へ、配置順に時間差を付けた
   * 点灯の盛り上がり（輝度の一過性の増加）を、保持した基準輝度に乗じて反映する（色のみ。位置・姿勢は変えない）。
   * 完了時（局所進行が1）は基準輝度へ戻る。立ち上げ中は近距離フェードより本演出を優先する。
   */
  applyFinale(elapsedSec: number, count: number, params: FinaleParams): void;
  /** 設定を GPU へ反映する（行列・色・位相の更新通知）。 */
  commit(): void;
  /** 現在の追加済み個体数（内部件数）。 */
  activeCount(): number;
  /** 内部状態と可視数を完全に初期化する（リトライ用）。 */
  reset(): void;
  /** 後始末。生成した形状・材質を解放する。冪等。 */
  dispose(): void;
}

const TAU = Math.PI * 2;

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} は有限値でなければなりません（受領: ${value}）`);
  }
}

// 有限値を0以上1以下へ丸める。上流の丸め誤差や境界外の値が来ても写像が破綻しないよう範囲内へ収める。
function clamp01(value: number): number {
  if (value <= 0) {
    return 0;
  }
  return value >= 1 ? 1 : value;
}

// 大きさ強度（0以上1以下）から実寸スケールへの線形写像（蝶の開張約9cm基準。constants の換算根拠を参照）。
function lanternScale(sizeStrength: number): number {
  assertFinite(sizeStrength, "大きさ強度");
  return LANTERN_BUTTERFLY_SCALE_MIN + (LANTERN_BUTTERFLY_SCALE_MAX - LANTERN_BUTTERFLY_SCALE_MIN) * clamp01(sizeStrength);
}

// 輝度強度（0以上1以下）から持続蝶の輝度への線形写像。最小 PERSISTENT_BUTTERFLY_BRIGHTNESS_MIN、最大
// PERSISTENT_BUTTERFLY_BRIGHTNESS_MAX。一過性蝶・ひまわりの写像とは別の上限付き写像。
function persistentBrightness(brightnessStrength: number): number {
  assertFinite(brightnessStrength, "輝度強度");
  return (
    PERSISTENT_BUTTERFLY_BRIGHTNESS_MIN +
    (PERSISTENT_BUTTERFLY_BRIGHTNESS_MAX - PERSISTENT_BUTTERFLY_BRIGHTNESS_MIN) * clamp01(brightnessStrength)
  );
}

/**
 * 持続配置の蝶エンティティを生成する。生成直後の追加済み個体数は0で何も描かない。add で1個ずつ追加する。
 */
export function createLanternButterflyFigures(options: { capacity: number }): LanternButterflyFigures {
  const { capacity } = options;
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new Error(`容量は正の整数でなければなりません（受領: ${capacity}）`);
  }

  const geometry = createButterflyGeometry();
  const materialHandle = createButterflyMaterial();
  // 灯しは羽ばたかず静止するため時間は進めない（uBflyTimeSec は既定0のまま）。翅の開き角の振幅は飛翔時より控えめにする。
  materialHandle.material.uniforms.uBflyFlapAmplitude.value = LANTERN_BUTTERFLY_WING_AMPLITUDE;

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

  // 個体ごとの翅の開き角の位相（インスタンス属性）。羽ばたきシェーダが aBflyPhase として読む。
  const phaseAttr = new InstancedBufferAttribute(new Float32Array(capacity), 1);
  phaseAttr.setUsage(DynamicDrawUsage);
  geometry.setAttribute("aBflyPhase", phaseAttr);

  object.count = 0;

  // 唯一の真実。索引がそのままインスタンスのスロット索引に対応する。
  const positions: { x: number; y: number; z: number }[] = [];
  const baseBrightness: number[] = [];
  const nearFadeFlags: boolean[] = [];
  let count = 0;
  let nearFadeTotal = 0;
  let disposed = false;

  const dummy = new Object3D();
  const workColor = new Color();
  // 姿勢の合成に使う作業用（毎回の生成を避ける）。X軸まわりの寝かせ回転と、Y軸まわりの向き（ヨー）回転を合成する。
  const xAxis = new Vector3(1, 0, 0);
  const yAxis = new Vector3(0, 1, 0);
  const pitchQuaternion = new Quaternion().setFromAxisAngle(xAxis, BUTTERFLY_BASE_PITCH_RADIANS);
  const yawQuaternion = new Quaternion();

  // 軌道（カメラ進行）方向の水平成分から、蝶の向きのヨー角を求める。蝶は寝かせ回転後に胴の前方が −z を向くため、
  // Y軸まわりに回して −z を進行方向（headingX, headingZ）へ合わせる。長さ0のとき（向き無し）は0を返す。
  function headingToYaw(headingX: number, headingZ: number): number {
    if (headingX === 0 && headingZ === 0) {
      return 0;
    }
    return Math.atan2(-headingX, -headingZ);
  }

  // 索引の姿勢行列を書く。位置・水平へ寝かせる回転・向き（ヨー）・等方スケールを与える。羽ばたきはシェーダがこの行列
  // 適用前のローカル空間で効くため、ここでは姿勢と大きさだけを与える。寝かせ回転を先に、向きの回転を後に合成する。
  function writeMatrix(
    index: number,
    position: { x: number; y: number; z: number },
    scale: number,
    yaw: number,
  ): void {
    yawQuaternion.setFromAxisAngle(yAxis, yaw);
    dummy.position.set(position.x, position.y, position.z);
    dummy.quaternion.copy(yawQuaternion).multiply(pitchQuaternion);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    object.setMatrixAt(index, dummy.matrix);
  }

  // 索引の色を書く（基準色 GLOW_NEON_RGB に実効輝度を乗じる）。
  function writeColor(index: number, effectiveBrightness: number): void {
    workColor.r = GLOW_NEON_RGB[0] * effectiveBrightness;
    workColor.g = GLOW_NEON_RGB[1] * effectiveBrightness;
    workColor.b = GLOW_NEON_RGB[2] * effectiveBrightness;
    object.setColorAt(index, workColor);
  }

  function add(input: LanternButterflyAddInput): boolean {
    assertFinite(input.position.x, "配置位置x");
    assertFinite(input.position.y, "配置位置y");
    assertFinite(input.position.z, "配置位置z");
    if (count >= capacity) {
      return false;
    }
    const index = count;
    const scale = lanternScale(input.sizeStrength);
    const base = persistentBrightness(input.brightnessStrength);
    const yaw = headingToYaw(input.headingX, input.headingZ);
    writeMatrix(index, input.position, scale, yaw);
    // 近距離フェード対象は追加直後はカメラの近傍にあるため淡い（輝度0）で置き、update で現す。通常個体は基準輝度。
    writeColor(index, input.nearFade ? 0 : base);
    // 翅の開き角の位相を配置順に対し連続的に進める（0以上TAU未満へ正規化）。
    const phase = (index * LANTERN_BUTTERFLY_WING_PHASE_STEP) % TAU;
    phaseAttr.array[index] = phase;

    positions.push({ x: input.position.x, y: input.position.y, z: input.position.z });
    baseBrightness.push(base);
    nearFadeFlags.push(input.nearFade);
    if (input.nearFade) {
      nearFadeTotal += 1;
    }
    count += 1;
    object.count = count;
    markNeedsUpdate();
    return true;
  }

  function markNeedsUpdate(): void {
    object.instanceMatrix.needsUpdate = true;
    if (object.instanceColor) {
      object.instanceColor.needsUpdate = true;
    }
    phaseAttr.needsUpdate = true;
  }

  function update(cameraPosition: { x: number; y: number; z: number }): void {
    if (disposed || nearFadeTotal === 0) {
      // 近距離フェード対象が無ければ毎フレームの書き換えをしない（通常時は空回りで負荷を持たない）。
      return;
    }
    assertFinite(cameraPosition.x, "カメラ位置x");
    assertFinite(cameraPosition.y, "カメラ位置y");
    assertFinite(cameraPosition.z, "カメラ位置z");
    const span = LANTERN_BUTTERFLY_FULL_REVEAL_DISTANCE - LANTERN_BUTTERFLY_NEAR_FADE_DISTANCE;
    let wrote = false;
    for (let i = 0; i < count; i += 1) {
      if (!nearFadeFlags[i]) {
        continue;
      }
      const p = positions[i];
      const dx = cameraPosition.x - p.x;
      const dy = cameraPosition.y - p.y;
      const dz = cameraPosition.z - p.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      // 近距離（下限未満）で0、遠距離（上限以上）で1、その間は線形。span が0以下の異常設定では遠距離扱い（1）にする。
      const t = span > 0 ? clamp01((distance - LANTERN_BUTTERFLY_NEAR_FADE_DISTANCE) / span) : 1;
      // 位置・スケールは変えず色（輝度）だけを書く（行列を書き換えないことで色のみの反映と整合させる）。
      writeColor(i, baseBrightness[i] * t);
      wrote = true;
    }
    if (wrote && object.instanceColor) {
      object.instanceColor.needsUpdate = true;
    }
  }

  function applyFinale(elapsedSec: number, finaleCount: number, params: FinaleParams): void {
    if (disposed) {
      return;
    }
    const limit = Math.min(finaleCount, count);
    for (let i = 0; i < limit; i += 1) {
      const local = finaleLocalProgress(elapsedSec, i, limit, params);
      const multiplier = finaleBrightnessMultiplier(local, params.brightnessOvershoot);
      // 立ち上げ中は近距離フェードより優先し、基準輝度に倍率を乗じて書く（距離による減光は適用しない）。
      writeColor(i, baseBrightness[i] * multiplier);
    }
    if (limit > 0 && object.instanceColor) {
      object.instanceColor.needsUpdate = true;
    }
  }

  function reset(): void {
    positions.length = 0;
    baseBrightness.length = 0;
    nearFadeFlags.length = 0;
    count = 0;
    nearFadeTotal = 0;
    object.count = 0;
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
    add,
    update,
    applyFinale,
    commit: markNeedsUpdate,
    activeCount: () => count,
    reset,
    dispose,
  };
}
