// 舞台土台モデル（Issue #105）の設定（値の定義のみ）。型は src/types/stage.ts に置く。
// 本ファイルは差し替えの単一地点であり、別の地形へ差し替える際は、この設定値の変更と、配信ディレクトリ
// public/models/stage/ のファイル置換だけで完結させる。
//
// 地形は国土地理院 地理院地図の数値標高データから、人間が用意した変換工程（scripts/build-stage-model.mjs）で
// 生成した。表示する地形メッシュは実測標高の形式変換であり、AIによる生成物ではない。出典の文言の最終確定と
// 規約適合の確認は Issue #106（提出前の最終確定）で行う。

import type { StageModelConfig } from "../types/stage";

/**
 * 中心の湖の舞台土台。配信先は public/ 直下を基準とするパス。
 * 地形メッシュの node 名は terrain、水面領域マーカーの node 名は water とする
 * （scripts/build-stage-model.mjs の出力に合わせる）。
 */
export const LAKE_STAGE: StageModelConfig = {
  url: "/models/stage/lake-stage_v01.glb",
  terrainNodeName: "terrain",
  waterNodeName: "water",
  displayName: "湖の舞台土台",
  provenance:
    "国土地理院 地理院地図の数値標高データを、変換工程（scripts/build-stage-model.mjs）で地形メッシュへ形式変換して生成。AIによる生成物ではない。",
  sourceCredit: {
    label: "舞台土台の地形",
    source: "国土地理院 地理院地図（数値標高データ）",
    sourceUrl: "https://maps.gsi.go.jp/",
    note: "実測の数値標高データを地形メッシュへ形式変換して使用。AIによる生成物ではない。最終的な出典文言と規約適合の確認はIssue #106で行う。",
  },
};
