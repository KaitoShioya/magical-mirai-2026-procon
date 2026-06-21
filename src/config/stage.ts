// 舞台土台モデル（Issue #105）の設定（値の定義のみ）。型は src/types/stage.ts に置く。
// 本ファイルは差し替えの単一地点であり、別の地形へ差し替える際は、この設定値の変更と、配信ディレクトリ
// public/models/stage/ のファイル置換だけで完結させる。
//
// 地形は国土地理院 地理院地図の3D機能で取得した数値標高データから、人間が用意した変換工程
// （scripts/build-stage-model.mjs）で生成した。地図画像のテクスチャは含めず標高の地形のみを用いる。表示する
// 地形メッシュは実測標高の形式変換であり、AIによる生成物ではない。出典の文言と規約適合は Issue #106 で確定した。
// 標高の地形は出所の明示のみで承認申請なく利用でき、公共データ利用規約（第1.0版）により再配布できる。

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
    "国土地理院 地理院地図の3D機能で取得した数値標高データを、変換工程（scripts/build-stage-model.mjs）で地形メッシュへ形式変換して生成。地図画像のテクスチャは含めず標高の地形のみを用いる。AIによる生成物ではない。",
  sourceCredit: {
    label: "舞台土台の地形",
    source: "国土地理院 地理院地図（3D機能の数値標高データ）",
    sourceUrl: "https://maps.gsi.go.jp/",
    note: "国土地理院の数値標高データを加工して作成した地形メッシュである。素材は地理院地図の3D機能で取得し、地図画像のテクスチャは含めず標高の地形のみを用いる。実測標高の形式変換でありAIによる生成物ではない。標高の地形は出所の明示のみで承認申請なく利用でき、公共データ利用規約（第1.0版）により出典と加工した旨の記載で再配布できる。地形は国土地理院が作成したものではない。",
  },
};
