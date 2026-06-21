# 実装チェックポイント（2026-06-22・Issue #92）

**状態: Issue #92（ミク常在配置・本編開始時登場・湖の中心固定）の実装を完了。ブランチ `worktree-issue-92-miku-reflection` で PR #166 を作成・push 済み（base は main、本文に Closes #92）。型検査・単体テスト955件・実ブラウザのスモーク（性能診断・中心キャラクター診断・回帰3種）・本番ビルドの診断ページ除外・実ブラウザ目視に合格。受入条件「本編開始時に湖の中心へVRMが配置され、タップの有無に依らず常在する」を満たす。**
**用途**: セッション喪失時の復帰点（マイルストーンM2、ミクVRMローダーと常在配置 [[implementation_checkpoint_2026-06-20_issue64]]・モーション抽象層 [[implementation_checkpoint_2026-06-21_issue93]] の上に積む）。仕様の出典は作品仕様 `docs/idea/concept-final.md` 第2節・第10節・第12節・第17節、縮退順序 `docs/research/03-rendering-ui.md` 第6節、依存規則 `docs/decisions/architecture.md` §5。

## 最重要の意思決定

- **常在配置そのものは Issue #64 で完了済み**: `renderRoot` が中心オブジェクト（光柱フォールバックとVRM）を生成してシーンへ追加し、`src/app/index.ts` が起動時に `mountCenterCharacter` を呼び、毎フレーム更新し、`lighting.ts` のリムライトで暗い背景から分離している。よって Issue #92 の新規実装は「反射対象からの中心オブジェクト除外機構」と「自動劣化制御（Issue #18）の縮退ラダー第1段への結線」に絞る。
- **反射の既定は「含める」**: 作品仕様 第10節が「常在するミクのモデルも平面反射・ブルーム・影の対象に含める」と定めるため、起動時は反射に含める。
- **反射からの除外を縮退ラダーの第1段にする**: 反射は世界全体を鏡像カメラで再描画するため描画コストが最も大きく、かつ湖面に映るミクの像は情報量が小さい（研究 第6節）。よって画素密度を下げる前の第一手として外すのが、見た目の損失が小さく性能の回復が大きい。
- **除外手段は visible 制御**: 物体ごとの表示層（`Object3D.layers`）を使わない方針（Issue #92 の方針指示、`src/rendering/README.md` の合成方針）に従い、反射描画の直前直後で中心オブジェクトの表示を切り替える。
- **画面状態によるミクの表示と非表示の切り替えは行わない**: 作品仕様 第17節がミクの突然の出現を廃止しミクを常在と定めるため、隠してから出す挙動は正典に反する。受入条件は「既に在る」連続性であり、隠す処理は含めない。

## Issue #92 本体で実装した内容

- `src/rendering/reflectionExclusion.ts`（新規・テスト付き）: `withReflectionHidden(対象集合, 反射描画関数)`。表示中の対象だけを非表示にして反射描画関数を実行し、`finally` で本補助が非表示にした対象だけを表示へ戻す純粋関数。three.js は型 `Object3D` のみ取り込む。
- `src/rendering/water.ts`（変更）: `Water` に `setReflectionExcluded(物体, 除外するか)`（反射が有効なら真を返す）を追加。反射が有効な水面では `Reflector.onBeforeRender` を生成時に1回だけラップし、除外集合の中身を反射描画の間だけ非表示にする。反射が無効な水面は何もせず偽を返す。
- `src/rendering/renderRoot.ts`（変更）: 反射に含める意図の値 `centerFigureReflected`（既定は真）と、現在の水面へ反映する `applyCenterFigureReflection`、公開契約 `setCenterFigureReflected`、`mountStageTerrain` の水面差し替え後の再適用、`applyPerformanceLevel` での反射段の適用と `reflectCenterFigureChanged` の `effectiveChanged` への合算を追加。`RenderState` に `centerFigureReflected`、`PerformanceLevelApplyResult` に `reflectCenterFigureChanged` を追加。
- `src/rendering/constants.ts`（変更）: `PerfLevelSetting` に `reflectCenterFigure` を追加し、`PERF_LEVELS` を4段から5段へ拡張（段階0=反射に含める、段階1=反射から外す、段階2=画素密度上限を下げる、段階3=ブルーム解像度倍率を下げる、段階4=ブルームを無効にする。各遷移で変わる設定はちょうど1つ）。
- 受け入れ診断とスモーク（新規）: `center-figure.html`、`src/rendering/diagnostics/centerFigure/main.ts`（`window.__centerFigureState` で配置と反射状態を公開、`?reflectMiku=0` で反射から外す）、`scripts/rendering-center-figure-smoke.mjs`。
- 5段化への整合（変更）: `src/rendering/performanceBudget.test.ts`、`src/rendering/diagnostics/perfBudget/main.ts`、`scripts/rendering-perf-smoke.mjs`、`src/types/globals.d.ts`、`src/rendering/README.md`。
- ビルドと継続的インテグレーション（変更）: `vite.config.ts`（検証用ビルドへ診断ページ追加、本番ビルドから除外）、`package.json`（中心キャラクター診断スモークの登録）、`.github/workflows/ci.yml`（本番ビルドの診断ページ除外確認へ追加、性能診断スモークと中心キャラクター診断スモークの実行追加）。

## 採用した判断とその理由（すべて理由を先に述べる）

- 反射ラップの原関数を `original.apply(reflector, args)` で呼び `this` を反射オブジェクトに保つ: three.js 0.184 の `Reflector.onBeforeRender` 本体が `this._getReflectionCamera` と `this.forceUpdate` を参照するため、`this` を落とすと反射カメラの取得で例外になるためである。
- ラップを生成時に1回だけ仕込み、`setReflectionExcluded` は集合操作だけにする: 呼び出しのたびにラップを重ねると反射描画が多重に走るためである。
- 反射が無効な端末で `reflectCenterFigureChanged` を偽にする: 描画が変わらないのに実効変化を性能判定器へ伝えると、次の段への降下や待機の判断を誤るためである。判定は `setReflectionExcluded` の戻り値で行う。
- 水面を作り直した後に反射設定を再適用する: 舞台土台の読み込みで `water` が再生成されるため、再適用しないと反射からの除外設定が失われるためである。
- 除外対象を中心オブジェクトの最上位 `Group` にする: 親の表示を偽にすると three.js は部分木全体の描画を飛ばすため、光柱からVRMへの差し替え後も同一の `Group` で追従し、再登録が不要になるためである。
- 性能判定器の回復テストで供給時間を40000ミリ秒とする: 判定器の定数（時間窓2000ミリ秒・下降の滞留3000ミリ秒・復帰の滞留8000ミリ秒）から、段階4からの復帰は4回の上昇を要し内部時刻19000・27000・35000・43000ミリ秒で起きる。回復開始の内部時刻12000ミリ秒から最後の上昇時刻43000ミリ秒へ到達するには31000ミリ秒以上の供給が必要で、安全余裕を見て40000ミリ秒とするためである。
- 中心キャラクター診断スモークでVRMの読み込み完了を待つ上限を20000ミリ秒とする: VRMファイル（約16メガバイト）の読み込みと解析に数秒を要し、舞台土台スモークが同じ上限で安定しているためである。VRMの読み込みと解析は中央処理装置の処理であり画像処理装置を必要としないため、画像処理装置の無い継続的インテグレーション環境でも読み込み完了に達する。

## レビューと検証（事実）

- 計画段階で6回の独立レビュー（Codex 1回と汎用サブエージェント5回、いずれも実コード参照）を反映: 反射ラップの `this` 保持、生成時1回ラップ、反射無効時の `reflectCenterFigureChanged` を偽にする扱い、`globals.d.ts` の `__renderState` インライン型への追記、本番ビルド除外確認へ `center-figure.html` を加える、現状の継続的インテグレーションが性能診断スモークを実行していないため追加する、本番ビルドの実在スクリプトは `build:app` である、性能判定器の回復テストの供給時間を40000ミリ秒へ直す。最終のレビューで「条件なしで取り込み可能」を確認。
- `npm run typecheck`（厳格・`tsconfig.json` と `tsconfig.node.json` の両方）: 型エラーなし。
- `npm test`（vitest）: 74ファイル955件全通過。新規は `reflectionExclusion.test.ts`（非表示の退避と復帰、元から非表示のものを戻さない、例外時の復帰、空集合での無操作、4件）と、5段化に合わせた `performanceBudget.test.ts` の更新（降下で段階4まで進む、最深の段階4から段階0まで回復する）。
- 本番ビルド（`vite build --mode app`、Node 22）: 成果物が `index.html` のみで、中心キャラクター診断ページを含まないことを確認。本番配信を本体のみに限る規約適合（Issue #7）のためである。
- 性能診断スモーク（`smoke:perf`）: 5段すべてと、各遷移でちょうど1つの設定だけが変わることを確認。
- 中心キャラクター診断スモーク（`smoke:center-figure`）: VRMが湖の中心へ配置されること、反射が有効で既定が含めるであること、`?reflectMiku=0` で反射から外れることを確認。
- 回帰確認のスモーク（画面遷移・舞台土台・描画層合成）: すべて成功。
- 実ブラウザ目視（ユーザー確認済み）: `center-figure.html` で既定はミク本体と湖面反射が見え、`?reflectMiku=0` で本体は残り反射だけが消える。`perf-budget.html?view=1` で段階0から4まで切り替えられ、段階1で中心オブジェクトの水面反射が消え段階0で戻る（この診断はVRMを読み込まず中心は光柱のため、反射が消えるのは光柱の反射である）。

## 次の主要作業

1. PR #166 の継続的インテグレーション通過を確認しマージ（本チェックポイント push 後）。
2. 後続の縮退段（影を接地影へ、ブルームからのVRM除外、頂点数を下げた簡易モデルへの置換、反射解像度そのものの実行時縮退）と、本編へ統合した状態での反射性能の再計測は Issue #97 の範囲。
3. 本編結線 #59 がカメラ軌跡で寄りを与える際、`setCenterFigureReflected` を演出や性能の都合で呼ぶ口は既に公開済みであり、追加の公開接点は不要。
