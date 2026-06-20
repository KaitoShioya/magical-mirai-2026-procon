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
  url: "/models/miku/miku-magical-mirai-2026_V02.vrm",
  position: { x: 0, y: 0, z: 0 },
  // 倍率の初期値。目視比較（実寸1.0は遠い暫定カメラで小さく、6.0は他要素を圧倒）に基づき、暫定カメラで
  // 明瞭に見えて灯しに囲まれた中心の存在感が出る3.0を採る。最終的な寄りはカメラ軌跡（Issue #13・#59）が担う。
  scale: 3,
  rotationY: 0,
  displayName: "初音ミク",
  credit: PCL_CREDIT,
  provenance: "VRoid Studio で人間が自作した初音ミクの二次創作モデル",
};
