# 実装チェックポイント（2026-06-21・Issue #105）

**状態: Issue #105（舞台土台3Dモデルの読込・配置）の実装を完了。ブランチ `worktree-issue-105-stage-terrain`。型検査・単体テスト742件・両ビルド・受け入れスモーク・回帰スモーク5種・実GPU性能ゲート（reflection:fps 60フレーム毎秒）・目視確認すべて通過。PR作成・push・ゴール基準の再レビューを経てマージへ進む。**
**用途**: セッション喪失時の復帰点（実装フェーズ・マイルストーンM2、平面反射 #9 の直接の後続）。前段は [[implementation_checkpoint_2026-06-20_issue9]]。設計正典は `docs/idea/concept-final.md` §2/§10、描画方針は `docs/research/03-rendering-ui.md` §1・`docs/research/05-asset-procurement.md` §4、ディレクトリは `docs/decisions/architecture.md`。

## 最重要の意思決定（ユーザー確定）

- **素材源は国土地理院 地理院地図のDEM（浜名湖）**: ユーザー提供の `model/lake/`（gitignore済・ローカル専用）は glTF でなく地理院地図の3D出力一式（`dem.csv`=1行・改行とカンマ区切り・値116270=列385×行302、`texture.png`+`texture.pgw`）。位置は東経約137.5度・北緯約34.7度の浜名湖西部。実測標高でありAI生成物でない。出典「国土地理院」を明示し、最終的な規約確認は #106 へ。
- **DEMを事前にglb化してGLTFLoaderで読込（正典維持）**: 正典は「静的glTFをGLTFLoaderで読込／水面は約束名メッシュ water で識別／ミクVRMと同じ読込系統」。ユーザー決定により、DEMをリポジトリ内の変換スクリプトで事前にglb化し、Issue通り読み込む。
- **反射面の向きは実績経路で水平を保証**: 平面反射（`Reflector`）の反射面の向きは対象オブジェクトの向き（ローカル+Zを世界行列で変換した法線）で決まる。土台モデルのジオメトリを直接 Reflector に渡すと垂直面扱いで破綻するため、glbの water は「水面領域の識別用マーカー」とし、その世界座標の境界箱から寸法・中心・高さ（waterRegion）を取り、`water.ts` が `PlaneGeometry`+`rotateX(-π/2)` の実績経路で平面を作り直す。
- **開いた側だけ水面を延長**: DEMは閉じた湖盆でなく湖岸の一区画（陸地が左・左上集中、水面が右下〜右辺下辺でタイル端到達）。陸の縁は生成せず、水面マーカーを原点中心の延長矩形にして開いた側を覆う。輪郭での厳密な切り出しは extras `originalWaterBoundsWorld` を用いた後続へ。
- **水面標高は実際の湖面に合わせる（目視確認で確定）**: DEM標高分布の解析で全セルの約49パーセントが標高ちょうど0に集中（中央値0.027、中央セルも0）と判明し、これが実際の湖面標高。水面基準を 0.05 とし、超えるセルを陸地（水面上）、以下を水面下とする。
- **水没域は平らな湖底へ刻む（水際の点滅対策）**: なだらかな水際を平らな水面が緩く横切ると深度の競合（z-fighting）で点滅する。水没域を水面より明確に低い平らな湖底へ刻み、地形が水面を横切るのを急峻な水際の壁のみにして点滅を防ぎ、陸地を水面より明確に上へ置く。深度バイアス（polygonOffset）は低い岸を覆い「沈み込み」を生むため使わない（刻み込みで幾何学的に解消）。
- **スケールはworldSize=600で確定、最終框取りは#13/#59**: 浜名湖の実寸（タイル約12km×9.4km、面積64.91km²）に対しミク（人, 約1.6m）との比率は約7500:1で、far平面500の描画スケールでは実寸再現不可。描画可能な最大スケール600（1単位≒20m）で確定。アプリ実行時のミクと湖の見かけの比率はカメラ距離（#13/#59）が決め、worldSizeでは飽和する。

## Issue #105 本体で実装した内容

- 変換（ビルド時）: `scripts/lib/stage-geometry.mjs`（純関数 `demToStageMeshes`・`sampleIndices`・`waterCentroidNormalized`、値個数検査・端の行列含む間引き・水面標高と湖底刻み込み）、`scripts/lib/glb.mjs`（純関数 `encodeGlb`、依存なし、node名 terrain/water、位置に最小最大、索引は最大頂点番号で16/32ビット選択、water nodeに extras）、`scripts/build-stage-model.mjs`（`model/lake/dem.csv`→`public/models/stage/lake-stage_v01.glb`）。生成物glbは頂点形状のみ・テクスチャ非埋込で配信対象（コミット）。
- 本体: `src/types/stage.ts`（`StageModelConfig`・`WaterRegion`・`OriginalWaterBoundsWorld`）、`src/config/stage.ts`（`LAKE_STAGE`）、`src/rendering/loaders/stageTerrainLoader.ts`（`loadStageTerrain`、node名で取得・水面マーカーの境界箱から水面領域算出・水平性検査・生water破棄・water無しでreject）、`src/rendering/loaders/waterRegion.ts`（純関数 `waterRegionFromBounds`、three非依存で単体検証）、`src/rendering/entities/stageTerrain.ts`（`createStageTerrain`、法線計算・深夜地形マテリアル）。
- 変更: `src/rendering/water.ts`（`createWater` に任意 `waterRegion` 追加、実績経路で水平な反射面）、`src/rendering/renderRoot.ts`（`mountStageTerrain`、新地形・新水面を生成完了後に例外なしでシーン更新・旧を破棄、診断状態 `stageTerrainStatus`/`stageTerrainError`/`waterSource`/`waterRegion`/`originalWaterBoundsWorld`、破棄は水面先・地形後）、`src/rendering/constants.ts`（`LAND_COLOR`等）、`src/app/index.ts`（通常モードで `mountStageTerrain(LAKE_STAGE)`）、`src/types/globals.d.ts`（`__stageState`・`__renderState`拡張）、`src/types/credits.ts`・`src/app/credits/registry.ts`・`creditsView.ts`・`readmeConsistency.test.ts`（国土地理院 出典）、`vite.config.ts`（stage.html入口）、`package.json`（`build:stage-model`・`smoke:stage`）、`.gitignore`（`model/` 追加）、`README.md`・`src/rendering/README.md`。
- 診断: 受け入れ `stage.html`+`diagnostics/stage/main.ts`（本番経路 `mountStageTerrain` で `window.__stageState` 公開）、目視 `stage-view.html`+`diagnostics/stage/view.ts`（開発専用・ビルド非対象、デバッグ照明で地形を確認）、スモーク `scripts/rendering-stage-smoke.mjs`。
- 単体テスト: `scripts/lib/stage-geometry.test.mjs`・`scripts/lib/glb.test.mjs`・`src/rendering/loaders/waterRegion.test.ts`。

## 採用した数値とその理由（変換、すべて理由を先に述べる。`scripts/lib/stage-geometry.mjs`）

- 水面標高 0.05: DEM解析で実際の湖面が標高0（全セルの約49パーセント）。平坦な水面とそこから立ち上がる岸を分ける等高線をこの値に採る。0.15では実水面より高く岸を水没させるため下げた。
- 高さ拡大率 6: 実起伏（水面基準から最大約3.4）は水平の広がりに対しほぼ平坦で囲んで見えず、過大だと崖。湖を拡大した分に合わせ最高部を約20ワールド単位（ミク約4.2の約5倍）にする。
- 代表寸法 600: 浜名湖の実寸を描画可能な最大スケールで表す（far平面500に対し水面の対角が内側）。ミクは長辺の約0.7パーセント。
- 格子間引き 2: 全11.6万頂点は背景に過剰で反射は二重描画。約2.9万頂点へ。端の行列を必ず含める。索引は頂点番号で16/32ビット選択。
- 水面延長率 1.3: 開いた側で陸外まで届きつつ、水面の対角が遠方面500の内側に収まる。
- 水面高さ -0.05、湖底刻み込み 2.0: 水面は岸の付け根の直下。水没域を水面より2.0低い平らな湖底へ刻み、水際の壁を急峻にして点滅を防ぐ。

## レビューと検証（事実）

- 計画段階で Codex のレビューを3巡反映: 反射面の向き破綻（水平ジオメトリ直渡しを撤回し waterRegion から実績経路で生成）、後始末順、間引き端処理、索引型の理由、地形命名（terrain）、差し替え時の状態整合（新を生成完了後に例外なしで一括更新）、water境界箱の高さ採用と水平性診断、軸平行前提の明記、診断での waterRegion と originalWaterBoundsWorld の別項目化を採用。
- 実装後の Codex レビューを2巡反映: 旧地形のリーク（新→旧の差し替え順へ統一）、差し替え途中の同期例外時の状態整合、README の高さ記述の齟齬、水平性検査の純関数化と単体テスト追加。最終判定「妥当（マージ可）」。
- `npm run typecheck`（厳格・両設定）: 型エラーなし。
- `npm run test`（vitest）: 742テスト全通過（変換20・glb9・水平性4・出典整合2を含む）。
- ビルド: `npm run build`（全ページ・stage.htmlバンドル）・`npm run build:app`（提出・stage.html除外・glb配信）成功。変換glbは再生成で同一ハッシュ（決定的）。
- 受け入れスモーク `scripts/rendering-stage-smoke.mjs`: stageTerrainStatus=loaded・waterSource=stage-mesh（water名メッシュで識別）・reflectionEnabled=true・水面領域の寸法が正。
- 回帰スモーク5種（描画状態・画面遷移・出典・層合成・発光点）通過。
- 実GPU性能ゲート `scripts/reflection-fps.mjs`（NVIDIA RTX 3050・ANGLE Direct3D11）: 反射解像度256と512のいずれも平均60・下位5パーセンタイル60フレーム毎秒で合格（基準 平均55以上・下位5パーセンタイル45以上）。退行なし。地形を含めた反射性能の再計測は #97 の範囲。
- 目視確認（ユーザー）で4課題を解消: (1)目視ページの水面の色の一様性（不透明化）、(2)スケール（worldSize=600で確定）、(3)水際の点滅（湖底刻み込み）、(4)水位の高さと陸地の沈み込み（水面標高0.05＋深度バイアス撤去）。浜名湖特有の複雑な岸線が正しく現れることを確認。

## 次の主要作業

1. PR のマージ（本チェックポイント push 後、ゴール基準の再レビューを経て）。
2. 後続: #92（ミク常在配置）・#93（モーション抽象）・#97（地形を含めた反射性能の再計測と地形除外の最適化）・#13/#59（カメラ軌跡で最終框取り）・#106（舞台土台の素材源・出典の規約確定）。
3. 灯し（#60ひまわり・#61蝶・#62ボロノイ緩和）は水面領域の上に配置する。
