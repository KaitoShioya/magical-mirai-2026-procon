// 発光点（灯し）の描画基盤。多数の発光点を単一の InstancedMesh で描き、1回の描画命令にまとめる。
// 状態を読むだけのビューであり、判定・得点・時刻の論理を持たない（依存規則 docs/decisions/architecture.md §5）。
// profiles・tools は import しない。最終形状（ひまわり #60・蝶 #61）・配置（#62）・本体シーンへの組み込みと
// 演出（#63）は下流が担い、本基盤は形状に依存しない「発光点」として位置・大きさ・色・輝度・可視数の設定だけを提供する。

import {
  type BufferGeometry,
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  type Material,
  MeshBasicMaterial,
  Object3D,
  SphereGeometry,
} from "three";
import { GLOW_SPHERE_RADIUS, GLOW_SPHERE_SEGMENTS } from "../constants";

/** 1個の発光点の見た目。位置・等方スケール・基準色・輝度を与える。 */
export interface GlowInstance {
  /** 湖を基準とする3次元位置。 */
  position: { x: number; y: number; z: number };
  /** 等方スケール（縦横高さ同率）。0以上。 */
  scale: number;
  /** 基準色（線形sRGB、各成分0以上1以下）。 */
  colorRgb: readonly [number, number, number];
  /** 輝度スカラ（既定1）。基準色へ乗算し、1を超える発光量を表す。0以上で上限なし。 */
  brightness?: number;
}

/** 発光点群の描画基盤。 */
export interface GlowPoints {
  /** シーンへ追加する本体。下流（#63）が追加する。 */
  readonly object: InstancedMesh;
  /** 収容できるインスタンスの上限。 */
  readonly capacity: number;
  /** 索引（0以上 capacity 未満の整数）のインスタンスの位置・スケール・色・輝度を設定する。 */
  setInstance(index: number, instance: GlowInstance): void;
  /** 実際に描くインスタンス数を設定する。0以上 capacity 以下に正規化する。 */
  setVisibleCount(count: number): void;
  /** 設定を GPU へ反映する。明示的に false を指定したもの以外（行列・色）を確定する。 */
  commit(options?: { matrix?: boolean; color?: boolean }): void;
  /** 後始末。基盤が生成した形状・材質のみ解放する。冪等。 */
  dispose(): void;
}

/** 発光点基盤の生成設定。 */
export interface GlowPointsOptions {
  /** 収容できるインスタンスの上限。正の整数。 */
  capacity: number;
  /** 既定は球（半径 GLOW_SPHERE_RADIUS・分割 GLOW_SPHERE_SEGMENTS）。注入時は呼び手が解放責任を負う。 */
  geometry?: BufferGeometry;
  /**
   * 既定は白の MeshBasicMaterial（toneMapped 無効）。注入時は色・トーンマップ・instanceColor 反映と解放を
   * 呼び手が保証する。白を既定にする根拠を先に述べる。instanceColor は材質色と乗算されるため、白でないと
   * インスタンスへ設定した色がそのまま出ない。発光点はトーンマップで減光させず後続ブルーム（#11）の
   * しきい値判定を素直にするため toneMapped を無効にする。
   */
  material?: Material;
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} は有限値でなければなりません（受領: ${value}）`);
  }
}

/**
 * 発光点の描画基盤を生成する。
 * 生成直後の可視数は0で、何も描かない。可視化は呼び手が setVisibleCount で行う。
 * 未設定スロットは黒（0, 0, 0）で初期化する。黒を選ぶ根拠を先に述べる。発光点はブルームで加算的に
 * 光らせるため黒は発光へ寄与せず、可視数を誤って未設定スロットまで増やしても白で光るより安全である。
 */
export function createGlowPoints(options: GlowPointsOptions): GlowPoints {
  const { capacity } = options;
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new Error(`容量は正の整数でなければなりません（受領: ${capacity}）`);
  }

  const geometryOwned = options.geometry === undefined;
  const geometry =
    options.geometry ?? new SphereGeometry(GLOW_SPHERE_RADIUS, GLOW_SPHERE_SEGMENTS, GLOW_SPHERE_SEGMENTS);

  const materialOwned = options.material === undefined;
  const material = options.material ?? new MeshBasicMaterial({ color: 0xffffff, toneMapped: false });

  const object = new InstancedMesh(geometry, material, capacity);
  // 任意配置で境界球更新漏れにより画面内の点が消えるのを避けるため、視錐台カリングを無効化する。
  object.frustumCulled = false;
  object.instanceMatrix.setUsage(DynamicDrawUsage);

  // 全スロットの色を黒で初期化して instanceColor を確保し、未設定スロットの白残りを防ぐ。
  const black = new Color(0, 0, 0);
  for (let i = 0; i < capacity; i += 1) {
    object.setColorAt(i, black);
  }
  // instanceColor は最初の setColorAt で確保される。動的更新向けの転送設定にし、初期化を反映する。
  object.instanceColor!.setUsage(DynamicDrawUsage);
  object.instanceColor!.needsUpdate = true;

  // 生成直後は何も描かない。可視化は setVisibleCount に委ねる。
  object.count = 0;

  // 行列と色の書き込みで再利用する作業用オブジェクト（毎回の生成を避けGC負荷を抑える）。
  const dummy = new Object3D();
  const workColor = new Color();

  let disposed = false;

  function setInstance(index: number, instance: GlowInstance): void {
    if (!Number.isInteger(index) || index < 0 || index >= capacity) {
      throw new Error(`索引は0以上${capacity}未満の整数でなければなりません（受領: ${index}）`);
    }
    const { position, scale, colorRgb } = instance;
    assertFinite(position.x, "位置x");
    assertFinite(position.y, "位置y");
    assertFinite(position.z, "位置z");
    assertFinite(scale, "スケール");
    if (scale < 0) {
      throw new Error(`スケールは0以上でなければなりません（受領: ${scale}）`);
    }
    for (let c = 0; c < 3; c += 1) {
      const channel = colorRgb[c];
      assertFinite(channel, "色成分");
      if (channel < 0 || channel > 1) {
        throw new Error(`基準色の各成分は0以上1以下でなければなりません（受領: ${channel}）`);
      }
    }
    const brightness = instance.brightness ?? 1;
    assertFinite(brightness, "輝度");
    if (brightness < 0) {
      throw new Error(`輝度は0以上でなければなりません（受領: ${brightness}）`);
    }

    dummy.position.set(position.x, position.y, position.z);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    object.setMatrixAt(index, dummy.matrix);

    // 色は基準色へ輝度を乗じる。setColorAt は色の r・g・b をそのまま instanceColor へ書く。
    workColor.r = colorRgb[0] * brightness;
    workColor.g = colorRgb[1] * brightness;
    workColor.b = colorRgb[2] * brightness;
    object.setColorAt(index, workColor);
  }

  function setVisibleCount(count: number): void {
    assertFinite(count, "可視数");
    const floored = Math.floor(count);
    object.count = Math.max(0, Math.min(capacity, floored));
  }

  function commit(commitOptions?: { matrix?: boolean; color?: boolean }): void {
    if (commitOptions?.matrix !== false) {
      object.instanceMatrix.needsUpdate = true;
    }
    if (commitOptions?.color !== false && object.instanceColor) {
      object.instanceColor.needsUpdate = true;
    }
  }

  function dispose(): void {
    if (disposed) {
      return;
    }
    disposed = true;
    // InstancedMesh のインスタンス用バッファを解放する。
    object.dispose();
    if (geometryOwned) {
      geometry.dispose();
    }
    if (materialOwned) {
      material.dispose();
    }
  }

  return {
    object,
    capacity,
    setInstance,
    setVisibleCount,
    commit,
    dispose,
  };
}
