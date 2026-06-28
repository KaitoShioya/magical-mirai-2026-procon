// 中心に常在するキャラクター（初音ミク）の型。
// 型のみを定義し、具体値（配信先・出典文言など）は src/config/character.ts が持つ。
// 型をここに置く理由を先に述べる。共有・ドメインの型は types に置く方針であり（src/types/README.md、
// src/config/README.md がランク段階の型を types に置く先例を示す）、config は値の定義のみを持つため、
// 型を types に分けると config は値のみ・rendering は型のみを参照でき、層の依存方向を乱さない。

/** 3次元の位置（ワールド座標、いずれもワールド単位）。 */
export interface CharacterPosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * 初音ミクを描く際にアプリ内へ常時表示する出典の必須要素。
 * 4要素は規約・調査の正典（docs/research/05-asset-procurement.md §3・§5、docs/concept.md）が求める内容に対応する。
 */
export interface CharacterCredit {
  /** ピアプロ・キャラクター・ライセンスに基づき初音ミクを描いた旨。 */
  readonly subject: string;
  /** ライセンスの名称。 */
  readonly licenseName: string;
  /** ライセンスのアドレス。 */
  readonly licenseUrl: string;
  /** 権利者の表記（クリプトン・フューチャー・メディア株式会社の社名を含む）。 */
  readonly rightsHolder: string;
  /** クリプトンのキャラクター利用のガイドラインに従う旨。 */
  readonly guidelineNote: string;
}

/**
 * ツインテールへ与える常時の風なびきの設定（コードによる動的表現）。
 * 各値の意味と計算は src/utils/twinTailWind.ts を参照する。
 */
export interface CharacterTwinTailWindConfig {
  /** 対象ジョイントを選ぶボーン名の正規表現（文字列）。2本のツインテールの全ジョイントに一致させる。 */
  readonly boneNamePattern: string;
  /** 風の基本方向（ミク局所座標）。垂れる方向の反対へ流すため後方かつ上向きを与える。 */
  readonly baseDirectionLocal: CharacterPosition;
  /** 流れの強さ（スプリングボーンの gravityPower に与える値）。 */
  readonly power: number;
  /** 方向の揺らぎ量（0以上1未満）。 */
  readonly oscillationAmplitude: number;
  /** 揺らぎの周波数（ヘルツ）。 */
  readonly oscillationFrequencyHz: number;
  /** 2本目のツインテールへ与える位相差（ラジアン）。左右が同じ動きで固まらないようにする。 */
  readonly chainPhaseOffset: number;
  /** 任意。揺れの戻し力（stiffness）。流れが不足する場合に下げる補助調整。 */
  readonly stiffness?: number;
  /** 任意。揺らぎの収まり（dragForce）。 */
  readonly dragForce?: number;
}

/**
 * 中心キャラクターへ実行時に与える躍動（コードによる動的表現の生成）。省略時は適用しない。
 * ポーズ資産（VRMアニメーション）は変更せず、コードでスプリングボーンの外力を操作する。
 */
export interface CharacterDynamicsConfig {
  /** ツインテールの常時の風なびき。 */
  readonly twinTail: CharacterTwinTailWindConfig;
}

/**
 * 中心キャラクターのモデル設定。差し替えの単一地点として、配信先・配置・出典・来歴を1つに束ねる。
 * 差し替えはこの設定値の変更と、配信ディレクトリ（public/models/）のファイル置換だけで完結させる。
 */
export interface CharacterModelConfig {
  /** VRMモデルの配信先（public/ 直下を基準とするパス）。 */
  readonly url: string;
  /** 配置（既定は原点）。 */
  readonly position: CharacterPosition;
  /** 等方スケールの倍率。中心の存在感に応じて調整する初期値であり、最終的な寄りはカメラ軌跡が担う。 */
  readonly scale: number;
  /** カメラへ正面を向けるための鉛直軸まわりの回転（ラジアン）。 */
  readonly rotationY: number;
  /** 表示名。 */
  readonly displayName: string;
  /** アプリ内へ常時表示する出典。 */
  readonly credit: CharacterCredit;
  /** 来歴。AIが生成したモデルでないことの記録（例: VRoid Studio で人間が自作）。 */
  readonly provenance: string;
  /**
   * 固定ポーズを与えるVRMアニメーション（拡張子 .vrma）の配信先（public/ 直下を基準とするパス）。
   * 省略時はモデル読み込み時の既定姿勢（バインドポーズ）のままとする。
   */
  readonly poseAnimationUrl?: string;
  /**
   * 固定ポーズとして据える時刻（秒。VRMアニメーションを再生するミキサーの時間の単位）。
   * 省略時は0とする。
   */
  readonly poseFreezeTimeSec?: number;
  /**
   * 実行時に与える躍動（コードによる動的表現の生成）。省略時は固定ポーズのみで躍動を適用しない。
   * 指定時は固定ポーズに加えてツインテールの風なびきとスカート右端の右手固定を適用する。
   */
  readonly dynamics?: CharacterDynamicsConfig;
}
