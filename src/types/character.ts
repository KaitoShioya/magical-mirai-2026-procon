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
}
