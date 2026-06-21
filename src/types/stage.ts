// 舞台土台モデル（Issue #105）の型。型のみを定義し、具体値（配信先・出典文言など）は src/config/stage.ts が持つ。
// 型をここに置く理由を先に述べる。共有・ドメインの型は types に置く方針であり（src/types/README.md、
// src/types/character.ts の先例）、config は値の定義のみを持つ。型を types に分けると config は値のみ・
// rendering は型のみを参照でき、層の依存方向を乱さない。

import type { TerrainSourceCredit } from "./credits";

/**
 * 水面領域。反射水面の平面を、この寸法・中心・高さで実行時に生成する（Issue #105）。
 * 幅は X 方向、奥行きは Z 方向の一辺の長さ、中心は水平面上の中心座標、高さは水面の高さ（Y座標）。
 */
export interface WaterRegion {
  /** 水面の幅（X方向の一辺、ワールド単位）。 */
  readonly width: number;
  /** 水面の奥行き（Z方向の一辺、ワールド単位）。 */
  readonly depth: number;
  /** 水面の中心のX座標（ワールド単位）。 */
  readonly centerX: number;
  /** 水面の中心のZ座標（ワールド単位）。 */
  readonly centerZ: number;
  /** 水面の高さ（Y座標、ワールド単位）。 */
  readonly y: number;
}

/**
 * 水面の元の範囲（世界座標、中心合わせ後）。水面マーカーの extras から読み、後続の湖輪郭の切り出しに使う。
 * 本Issueでは値を保持し公開するのみで、反射面の生成には使わない。
 */
export interface OriginalWaterBoundsWorld {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly y: number;
}

/**
 * 舞台土台モデルの設定。差し替えの単一地点として、配信先・識別する node 名・出典・来歴を1つに束ねる。
 * 差し替えはこの設定値の変更と、配信ディレクトリ（public/models/）のファイル置換だけで完結させる。
 */
export interface StageModelConfig {
  /** glTFモデルの配信先（public/ 直下を基準とするパス）。 */
  readonly url: string;
  /** 地形メッシュを識別する node 名。 */
  readonly terrainNodeName: string;
  /** 水面領域を識別する node 名。 */
  readonly waterNodeName: string;
  /** 表示名。 */
  readonly displayName: string;
  /** 来歴。AIが生成した素材でないことの記録。 */
  readonly provenance: string;
  /** アプリ内へ表示する素材源の出典。 */
  readonly sourceCredit: TerrainSourceCredit;
}
