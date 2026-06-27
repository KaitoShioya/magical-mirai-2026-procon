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
  subject: "この作品はピアプロ・キャラクター・ライセンスに基づいて初音ミクを描いています。",
  licenseName: "ピアプロ・キャラクター・ライセンス",
  licenseUrl: "https://piapro.jp/license/pcl/summary",
  rightsHolder: "© Crypton Future Media, INC. www.piapro.net",
  guidelineNote:
    "本作品はクリプトン・フューチャー・メディア株式会社のキャラクター利用のガイドラインに従います。",
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
};
