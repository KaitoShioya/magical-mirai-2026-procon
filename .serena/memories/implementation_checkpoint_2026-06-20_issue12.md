# 実装チェックポイント（2026-06-20・Issue #12）

**状態: Issue #12（雨環境パーティクル）の実装を完了。ブランチ `feat/issue-12-rain-particles` で PR #121 を作成・push 済み。型検査・単体テスト・ビルドはローカルで通過。マージ可否を確認中。**
**用途**: セッション喪失時の復帰点（実装フェーズ・マイルストーンM2のレンダリング後続1件）。同じ描画基盤の上に立つ前段は [[implementation_checkpoint_2026-06-19_issue8]]（描画基盤 `createRenderRoot`）。文字エンジンの先行例は [[implementation_checkpoint_2026-06-19_issue20]]。設計正典は [[phase2_design_checkpoint_2026-06-14]]、ディレクトリと依存規則は `docs/decisions/architecture.md`、世界観の根拠は `docs/idea/concept-final.md` §2。

## 最重要の意思決定

- **スコープは独立モジュールと診断ページに限定**: Issue #12 は試作 `src/tools/perf/main.ts` の雨を本番描画層の再利用可能モジュールへ昇格させる作業である。本番の単一描画領域 `src/rendering/renderRoot.ts` は変更しない。本編シーンへ雨を載せる結線は、`RenderRoot` への `scene` 公開または追加APIという共有描画基盤の拡張（#33/#59 の前提）を要するため本Issueの範囲外とし、層合成 #15 と通しプレイ統合 #59 へ委譲した。Issue #12 の受け入れ基準「連続落下・rain=0で消滅」は、本編結線なしに単独診断ページとユニットテストで完全に検証できる。この境界はユーザーの承認を得て確定した。
- **再利用可能な契約**: `createRainSystem` は `RainSystem`（`object`＝シーンへ追加する `Points`、`update(deltaMs)`＝毎フレームの落下、`dispose()`＝破棄）を返す。後続Issueが `scene.add(rain.object)` の一行で本編へ載せられる。
- **判定・時刻の論理を持たないビュー**: `rain` は `profiles`・`tools` を import せず、更新はフレーム時間差（ミリ秒）を受け取るだけにする（`docs/decisions/architecture.md` §5）。three.js は名前付き import のみ（`Points`・`BufferGeometry`・`BufferAttribute`・`PointsMaterial`）。雨固有の定数は `src/rendering/rain/constants.ts` に three.js を import しない純粋数値として置く（文字エンジンが自前の定数を持つのと同じ方針）。
- **検証の二系統**: 位置計算は純粋関数（`normalizeCount`・`normalizeDeltaMs`・`initRainPositions`・`stepRainColumn`）に切り出し node 環境の vitest で検証する。three.js のコアオブジェクト（`BufferGeometry`・`PointsMaterial`・`Points`）の生成は `WebGLRenderer` を要さず node で構築できるため、`createRainSystem` の契約（マテリアル設定値・位置更新の通知・破棄の冪等性）も vitest で直接検証する。実描画の連続落下と消滅は診断ページ `rain.html` を Playwright で駆動して確認する。
- **粒数0でも有効な戻り値**: 試作は粒数0のとき `Points` を生成しない（null 扱い）が、本モジュールは粒数0でも頂点数0の `Points` を返す。three.js は頂点数0を何も描画せず例外も出さないため視覚的な消滅を満たしつつ、呼び出し側の判定を不要にして契約を一様に保つ。試作との差は README に明記した。

## Issue #12 本体で実装した内容

- `src/rendering/rain/constants.ts`（新規）: 粒数800・色0x6a7ba0・大きさ0.07・不透明度0.5・落下速度毎秒26ワールド単位・巻き戻し加算量40・X/Z配置範囲90・時間差上限100ミリ秒。各値に採用理由と出典行を併記。
- `src/rendering/rain/rain.ts`（新規）: 純粋関数 `normalizeCount`・`normalizeDeltaMs`・`initRainPositions`・`stepRainColumn` と `createRainSystem`。`update` は有効な時間差が無いとき・粒数0のとき何もせず、それ以外は落下後に `position.needsUpdate=true`。`dispose` はジオメトリとマテリアルを直接破棄し `disposed` フラグで冪等。
- `src/rendering/rain/index.ts`（新規）: 公開窓口。
- `src/rendering/rain/rain.test.ts`（新規）: ユニットテスト30件。
- `src/rendering/rain/README.md`（新規）: 責務・禁止依存・三層の取り込み方針・試作との差・テスト方針・診断ページの所在。
- `src/rendering/rain/diagnostics/main.ts`（新規）: 診断ページの入口。背景・霧・カメラ・画素密度は Issue #8 の `rendering/constants` と `rendering/viewport` を再利用。クエリ `rain`（粒数）・`dpr`（画素密度上限）を正規化。検証用に `window.__rainProbe`（頂点数と先頭粒のY座標）を公開（本ページは本番ビルドに含まれないため許容）。
- `rain.html`（新規）: 診断ページ。
- `vite.config.ts`（変更）: 開発ツール入口に `rain` を登録。本番ビルド（`--mode app`）は本体 `index.html` のみのため自動で除外される。

## 採用した数値とその理由（すべて理由を先に述べる）

- 落下速度 = 毎秒26ワールド単位: 試作は `THREE.Clock.getDelta()`（戻り値は秒）に26を乗じるため落下速度は毎秒26ワールド単位である。本番の毎フレーム駆動は時間差をミリ秒で扱うため、更新関数はミリ秒を受け取り1000で割って秒へ換算する。これにより試作と同一の落下速度を保ちながら本番の時間ソースへ接続できる。
- 時間差の上限 = 100ミリ秒: 100ミリ秒は毎秒10フレームに相当し、これを下回ると動き自体が既に滑らかでなくなる水準である。上限100ミリ秒なら1フレームの落下量は最大で26×0.1＝2.6ワールド単位であり、巻き戻し加算量40を大きく下回るため、Yが0未満になった粒へ一度だけ40を加算すれば必ず有効範囲（0以上40未満）へ戻ることが保証される。この保証は直前のYが有効範囲にある不変条件の上で成り立つ。
- 粒数の正規化で `Number.isFinite` を切り詰めの前に使う: `Math.trunc(正の無限大)` は正の無限大のままで型付き配列 `Float32Array` の確保を壊すため、切り詰めの前に有限性を判定して無限大を排除する。
- 近似比較の桁数 = 4: 位置は単精度の `Float32Array` に格納するため計算値を単精度へ丸めた誤差がおよそ1e-6出る。桁数4は許容差5e-5に相当し、この丸め誤差を吸収しつつ意味のある検証（例として18.7と18.7008を区別する）を保つ。

## レビューと検証（事実）

- 計画段階で Codex のレビューを4巡反映: 粒数0の仕様明文化、乱数源の注入、位置バッファの更新通知、破棄の冪等性、時間差の上限と非数・無限大への防御、正規化規則の共有関数化、配列の同一参照、有効粒数の整数化と境界外書き込み防止、テスト期待値の不変条件整合、診断クエリの厳密な数値判定。
- 実装後の Codex レビューで2点（`createRainSystem` の契約が自動テスト未検証、診断ページの空文字クエリに関するコメント矛盾）を指摘され、両方を反映（契約テスト9件追加・コメント修正）。
- `npm run typecheck`（厳格・両設定）: 型エラーなし。
- `npm run test`（vitest）: 30件（rain）を含む222件が通過。`scripts/build-font-subset.test.mjs` の1件は `fontkit` 未インストールの環境起因の失敗で本変更と無関係。
- ビルド（Node 22）: 本番 `vite build --mode app` は `index.html` のみを出力し `rain.html` を含まない。開発 `vite build` は `rain.html` を含む5ページを出力。
- 動作（Playwright、毎秒60フレーム）: `rain=800` で頂点数800・先頭粒のY座標が時間とともに移動し0以上40未満に留まる（連続落下）。`rain=0` で頂点数0（消滅）。簡易情報表示は粒数を表示し空表示を読み込み失敗と区別できる。

## 次の主要作業

1. PR #121 の CI 通過確認とマージ（本チェックポイント push 後）。
2. 本編シーンへの雨の結線（#15 描画層合成・#59 通しプレイ統合）。`RenderRoot` への `scene` 公開または追加APIを最小拡張し、`scene.add(rain.object)` と毎フレーム `rain.update(deltaMs)` を結線する。
3. マイルストーンM2の後続: #9（平面反射、別途進行）・#10（発光点 InstancedMesh）・#11（ブルーム）・#13（カメラ軌跡）。いずれも Issue #8 の `createRenderRoot` へ積み上げる。
