// 中心に常在する初音ミクのモデル設定（値の定義のみ）。
// 型は src/types/character.ts に置く。本ファイルは差し替えの単一地点であり、別モデルへ差し替える際は
// この設定値の変更と、配信ディレクトリ public/models/ のファイル置換だけで完結させる。
//
// 出典文言（PCL_CREDIT）は docs/research/05-asset-procurement.md §3・§5 が求める必須4要素に対応する。
// 文言はユーザー確認により確定済みである。

import type { CharacterCredit, CharacterModelConfig } from "../types/character";

/**
 * 初音ミクを描く際にアプリ内へ常時表示する出典（ピアプロ・キャラクター・ライセンス）。
 * 4要素（描いた旨・ライセンス名・ライセンスのアドレス・権利者の社名・ガイドライン遵守の旨）を満たす。
 */
export const PCL_CREDIT: CharacterCredit = {
  subject: "本作はピアプロ・キャラクター・ライセンスに基づいて初音ミクモデルを制作しています。",
  licenseName: "ピアプロ・キャラクター・ライセンス",
  licenseUrl: "https://piapro.jp/license/pcl/summary",
  rightsHolder: "© Crypton Future Media, INC. www.piapro.net",
  guidelineNote:
    "本作はクリプトン・フューチャー・メディア株式会社のキャラクター利用ガイドラインに従います。",
};

/**
 * 中心に常在する初音ミクのモデル設定。
 * 配置は湖の中心（原点）。スケール・向きは暫定カメラでの見えに応じて調整する初期値であり、
 * 最終的な寄りはカメラ軌跡（Issue #13・#59）が担う。
 * url は public/ 直下を基準とする配信パス（public/models/miku/ に配置した実体を指す）。
 */
export const MIKU_CHARACTER: CharacterModelConfig = {
  url: "/models/miku/miku-plane-ver3.0.vrm",
  position: { x: 0, y: 0, z: 0 },
  // 倍率。採用理由を先に述べる。従来の3.0はユーザーの目視確認で暫定カメラにおいてミクが小さく見えたため、
  // 3.0を1.3倍した3.9を採る。最終的な寄りはカメラ軌跡（Issue #13・#59）が担う。
  scale: 3.9,
  rotationY: 0,
  displayName: "初音ミク",
  credit: PCL_CREDIT,
  provenance:
    "VRoid Studio で人間が自作した初音ミクの二次創作モデル（miku-plane ver3）。" +
    "姿勢は作者本人が手付けで作成したVRMアニメーション（miku-ver3-posed.vrma）の固定ポーズであり、いずれもAIが生成したものではない。",
  // 固定ポーズを与える自作VRMアニメーション。固定する時刻は0秒。
  // 0秒を採る理由は、このVRMアニメーションが全フレーム同一姿勢（人体ボーンの回転と平行移動が全フレームで一致）であり、
  // 任意の時刻で同じ作成ポーズが得られるため、補間の生じないクリップ先頭を最も単純で決定的な標本点として選ぶことによる。
  poseAnimationUrl: "/models/miku/miku-ver3-posed.vrma",
  poseFreezeTimeSec: 0,
  // 実行時の躍動（コードによる動的表現）。値はモデルの実ボーン名に基づく初期値であり、向き・強さ・対象ボーン・
  // オフセットの最終値は開発サーバーと中心表示診断ページでの目視で確定する（プランの視覚確認項目）。
  dynamics: {
    twinTail: {
      // 2本の長いツインテールの全ジョイント（モデル解析で確定した実ボーン名 J_Sec_Hair{1..6}_10 / _11 と各 _end）に一致する。
      boneNamePattern: "^J_Sec_Hair\\d+_1[01](_end)?$",
      // 基本方向（ミク局所座標）。後方かつ上向き（奥行きの負が後方、正のyが上）。最終値は目視で確定する。
      baseDirectionLocal: { x: 0, y: 0.4, z: -1 },
      // 流れの強さ。採用理由を先に述べる。既定の gravityPower=0.3 は戻し力に対して弱く垂れに近いため、後方への流れが
      // 出るよう2.5を採る。戻し力（stiffness）を0.15へ下げて尾を風に追従しやすくする。最終値は目視で確定する。
      power: 2.5,
      stiffness: 0.15,
    },
  },
};
