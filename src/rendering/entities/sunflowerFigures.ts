// ひまわりエンティティ（Issue #60）。多数のひまわりを単一の InstancedMesh で描く。ひまわりは楽曲終了後に
// 一括で立ち上がる静的な灯しで、毎フレームの頂点アニメーションを持たないため、形状非依存の発光点基盤
// glowPoints（entities/glowPoints.ts）を再利用し、ひまわりのジオメトリと頂点色対応の材質を注入する。
// 状態を読んで描くビューであり、判定・得点・時刻の論理を持たない（依存規則 docs/decisions/architecture.md §5）。
// profiles・tools・得点層は import しない。本体シーンへの組み込みと立ち上げ演出（#63）・配置（#62）は下流が担う。
//
// 図形内の色階調は頂点色（ジオメトリの color 属性、純粋なトーン）で、個体ごとの輝度はインスタンスの色で与える。
// three.js は頂点色とインスタンス色を同一の頂点色変数へ二段で乗算するため、最終色 = 白材質 × 頂点トーン × 輝度 に
// なる。材質を白・トーンマップ無効・頂点色有効・両面表示にする理由を先に述べる。白でないと頂点色とインスタンス色が
// 減衰し、トーンマップ有効だと輝度1超がブルームの閾値判定前に縮むため、glowPoints の既定材質と同じく白・トーンマップ
// 無効にし、図形内階調のため頂点色を有効化し、湖面に水平に寝た造形を裏からも見せるため両面表示にする。

import { DoubleSide, type InstancedMesh, MeshBasicMaterial } from "three";
import { SUNFLOWER_SEED_COUNT, SUNFLOWER_SEED_COUNT_HIGH } from "../constants";
import { createGlowPoints } from "./glowPoints";
import { createSunflowerGeometry } from "./sunflowerGeometry";
import { reactionToBrightness, reactionToScale } from "./sunflowerReactionMapping";
import {
  finaleLocalProgress,
  finaleBrightnessMultiplier,
  type FinaleParams,
} from "../../utils/finaleReveal";

/** 1個のひまわりの配置入力。大きさ強度・輝度強度は反応強度の0以上1以下の素の数値で、得点層の型は受け取らない。 */
export interface SunflowerSetInput {
  /** 配置位置（湖を基準とする3次元座標）。 */
  position: { x: number; y: number; z: number };
  /** 大きさ強度（タイミング精度由来、0以上1以下）。reactionToScale で大きさへ写像する。scale を渡したときはそちらを優先する。 */
  sizeStrength: number;
  /** 輝度強度（音程精度由来、0以上1以下）。reactionToBrightness で輝度へ写像する。brightness を渡したときはそちらを優先する。 */
  brightnessStrength: number;
  /** 等方スケールの明示指定（任意）。渡したときは sizeStrength の写像でなくこの値をそのまま大きさに用いる。
   *  本タスクの灯し配置が、舞台に対する実寸スケールを直接与えるために使う（0以上）。 */
  scale?: number;
  /** 輝度の明示指定（任意）。渡したときは brightnessStrength の写像でなくこの値をそのまま輝度に用いる。
   *  本タスクの灯し配置が、上品な発光のための輝度を直接与えるために使う（0以上）。 */
  brightness?: number;
}

/** ひまわりの幾何メトリクス（検査・配置で参照する）。 */
export interface SunflowerMetrics {
  discRadius: number;
  overallRadius: number;
  centerPetalRatio: number;
  seedCount: number;
  petalCount: number;
}

/** ひまわりエンティティ。 */
export interface SunflowerFigures {
  /** シーンへ追加する本体。下流（#63）が追加する。 */
  readonly object: InstancedMesh;
  /** 収容できるインスタンスの上限。 */
  readonly capacity: number;
  /** 造形の幾何メトリクス（全インスタンス共通。実寸は各インスタンスの等方スケールで決まる）。 */
  readonly metrics: SunflowerMetrics;
  /** 索引のインスタンスへ、位置と反応強度（大きさ強度・輝度強度）から大きさと輝度を写像して設定する。 */
  setInstance(index: number, input: SunflowerSetInput): void;
  /** 実際に描くインスタンス数を設定する。0以上 capacity 以下に正規化する。 */
  setVisibleCount(count: number): void;
  /** 設定を GPU へ反映する。 */
  commit(options?: { matrix?: boolean; color?: boolean }): void;
  /**
   * 楽曲終了後の灯し立ち上げ演出（Issue #63）を適用する。先頭から count 個の各個体へ、配置順に時間差を付けた
   * 点灯の盛り上がり（輝度の一過性の増加）を、保持した基準輝度に乗じて反映し、GPU へ反映する。
   * 位置と大きさは基準のまま変えない。完了時（局所進行が1）は基準輝度へ戻る。
   */
  applyFinale(elapsedSec: number, count: number, params: FinaleParams): void;
  /** 後始末。生成したジオメトリ・材質と発光点基盤を解放する。冪等。 */
  dispose(): void;
}

/**
 * ひまわりエンティティを生成する。生成直後の可視数は0で何も描かない。可視化は setVisibleCount で行う。
 * highQuality が真のとき種数を高品質の値にする（机上環境向け。既定はモバイル優先の種数）。
 */
export function createSunflowerFigures(options: {
  capacity: number;
  highQuality?: boolean;
}): SunflowerFigures {
  const seedCount = options.highQuality ? SUNFLOWER_SEED_COUNT_HIGH : SUNFLOWER_SEED_COUNT;
  const sunflower = createSunflowerGeometry({ seedCount });
  // 白・頂点色有効・トーンマップ無効・両面表示（理由は冒頭コメント）。
  const material = new MeshBasicMaterial({
    color: 0xffffff,
    vertexColors: true,
    toneMapped: false,
    side: DoubleSide,
  });
  // glowPoints が capacity の検査・InstancedMesh の構築・instanceColor の初期化・視錐台カリング無効化を担う。
  // 注入したジオメトリと材質は glowPoints が解放しないため、本ファクトリが dispose で解放する。
  const glow = createGlowPoints({ capacity: options.capacity, geometry: sunflower.geometry, material });

  let disposed = false;

  // 立ち上げ演出（#63）のため、各個体の基準（位置・大きさ・輝度）を保持する。applyFinale が基準輝度に倍率を乗じて
  // 点灯の盛り上がりを作り、完了時は基準へ戻すために用いる。索引がそのままインスタンスのスロット索引に対応する。
  const basePosition: { x: number; y: number; z: number }[] = [];
  const baseScale: number[] = [];
  const baseBrightness: number[] = [];

  function setInstance(index: number, input: SunflowerSetInput): void {
    // scale・brightness の明示指定があればそれを優先し、無ければ反応強度から写像する（既存の診断呼び出しは
    // 強度のみを渡すため従来どおり）。本タスクの灯し配置は実寸スケールと上品な輝度を明示で渡す。
    const scale = input.scale ?? reactionToScale(input.sizeStrength);
    const brightness = input.brightness ?? reactionToBrightness(input.brightnessStrength);
    // 基準色は白（[1,1,1]）で渡す。図形内の橙の階調は頂点色が持ち、ここでは個体ごとの輝度だけを与える。
    glow.setInstance(index, { position: input.position, scale, colorRgb: [1, 1, 1], brightness });
    // 立ち上げ演出のための基準を保持する。
    basePosition[index] = { x: input.position.x, y: input.position.y, z: input.position.z };
    baseScale[index] = scale;
    baseBrightness[index] = brightness;
  }

  function applyFinale(elapsedSec: number, count: number, params: FinaleParams): void {
    const limit = Math.min(count, baseBrightness.length);
    for (let i = 0; i < limit; i += 1) {
      const local = finaleLocalProgress(elapsedSec, i, limit, params);
      const multiplier = finaleBrightnessMultiplier(local, params.brightnessOvershoot);
      glow.setInstance(i, {
        position: basePosition[i],
        scale: baseScale[i],
        colorRgb: [1, 1, 1],
        brightness: baseBrightness[i] * multiplier,
      });
    }
    // 輝度（色）だけが変わるため色の反映を指示する（位置・大きさの行列は基準のまま変えていない）。
    glow.commit({ color: true });
  }

  return {
    object: glow.object,
    capacity: glow.capacity,
    metrics: {
      discRadius: sunflower.discRadius,
      overallRadius: sunflower.overallRadius,
      centerPetalRatio: sunflower.centerPetalRatio,
      seedCount: sunflower.seedCount,
      petalCount: sunflower.petalCount,
    },
    setInstance,
    setVisibleCount(count: number): void {
      glow.setVisibleCount(count);
    },
    commit(commitOptions?: { matrix?: boolean; color?: boolean }): void {
      glow.commit(commitOptions);
    },
    applyFinale,
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      glow.dispose();
      sunflower.geometry.dispose();
      material.dispose();
    },
  };
}
