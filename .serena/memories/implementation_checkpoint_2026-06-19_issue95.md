# 実装チェックポイント（2026-06-19・Issue #95）

**状態: Issue #95（ローカル品質検査ハーネス基盤）の実装を完了。ブランチ `feat/issue-95-quality-harness` で PR #118 を作成・push 済み。マージ前。**
**用途**: セッション喪失時の復帰点（実装フェーズ・マイルストーンM9 品質保証）。前段の実装は [[implementation_checkpoint_2026-06-19_issue5]] と [[implementation_checkpoint_2026-06-19_issue4]]、その前は [[implementation_checkpoint_2026-06-18_issue3]] と [[implementation_checkpoint_2026-06-18_issue2]] と [[implementation_checkpoint_2026-06-18_issue7]] と [[implementation_checkpoint_2026-06-18_issue6]] と [[implementation_checkpoint_2026-06-18]]、設計正典は [[phase2_design_checkpoint_2026-06-14]]、開発基盤の現状は [[dev_infrastructure_notes]]。仕様の正典は `docs/research/08-quality-assurance.md` の1節。

## このIssueの責務の境界（厳守）

- #95は品質ゲート（#97描画性能・#98文字可読性・#99表示同期・#100空間品質・#101灯し分布・#102両立・#103操作判定）が共通利用する**基盤だけ**を作る。具体ゲートの検査内容・合格閾値（#104）・曲プロファイルJSONスキーマ本体（#34定義・#96登録）は実装しない。基盤に閾値・ゲートの合否・具体スキーマを焼き込まない。レポートにゲートの合否欄は設けない。下位5パーセンタイルは算出値であって合否ではない。

## 最重要の意思決定（すべて採用理由を先に述べる）

- **GPU有効化は新しいヘッドレスモードで起動し、描画系統の実測を合否の唯一の根拠とする**: クラウドのCIにはGPUが無くヘッドレスは既定でソフトウェア描画にフォールバックし、フレーム数と見た目が実機を表さないため。Windows 11では仮想ディスプレイ方式が使えないため、Playwright公式が「新しいヘッドレスモード」と記す起動経路 `channel:"chromium"` でANGLEのDirect3D 11経路（`--use-gl=angle --use-angle=d3d11 --enable-gpu --ignore-gpu-blocklist`）を指定する。起動設定が効いたかは環境依存で保証にならないため、WebGLの拡張 `WEBGL_debug_renderer_info` の描画系統名の実測で判定し、ソフトウェア描画を示す語（SwiftShader・llvmpipe・Software Rasterizer・Microsoft Basic Render Driver・WARP）を含むか、描画系統名が取得できない場合は失敗とする。起動経路ノブ（chrome・msedge）とANGLEバックエンドノブ（既定d3d11）を持つ。
- **クラウド経路でブラウザ起動部品を読み込まない**: クラウドはGPUが無く、ブラウザ起動部品を読み込むだけで不要な依存評価が走るため。モード判定（純粋関数 `resolveMode`）と実行（`run-local.mjs`／`run-cloud.mjs`）を分け、コマンド入口 `scripts/quality-harness.mjs` が `--mode` を解釈した後に一方だけを動的に読み込む。これによりクラウド経路はPlaywrightの読み込みに到達しない。純粋関数の単体テストも対象モジュールを直接読み込み、再エクスポートの入口は設けない。
- **合否は純粋関数 `evaluateRunAcceptance` に集約し、計測フック契約の欠落を検出する**: 合否規則を1か所の純粋関数に集約すると単体テストで決定的に検証でき見落としを防げるため。合格条件は4つ。描画系統が信頼できること（描画系統名が取得できない場合に限り手元調査ノブ `--allow-unknown-renderer` で許容、ソフトウェア描画は許容しない）、平均フック `window.__avgFps` が公開されていること（`avgFps < 0` は欠落）、毎秒フレーム数の標本が1件以上あること、ページの未捕捉例外が無いこと。計測フック契約 `window.__fps`／`__avgFps`／`__fpsSamples` の欠落はそれぞれ「準備待ちのタイムアウト（例外）」「avgFpsが負」「標本0件」で検出される。背景の404のような良性のコンソールエラーは記録のみで合否に含めない。
- **既存 `scripts/prototype-fps.mjs` を共通部品へ載せ替える（厳格判定は持ち込まない）**: 仕様が基盤の起点を `prototype-fps.mjs` と `window.__fps` と定めるため。`prototype-fps.mjs` は計測の道具でありゲートではないため、ソフトウェア描画で失敗させる厳格判定は `npm run quality` 側だけに置く。接続先既定（5174番）・URLクエリノブ・2系統計測（デスクトップとモバイル相当）・スクリーンショット名（`scripts/proto-*.png`）・標準出力の体裁を互換に保つ。
- **クラウド側スキーマ検査はライブラリ ajv を用いる**: 曲プロファイルの必須項目検査（#96）が列挙・範囲・パターンを含む見込みで自作の最小検証では表現力が足りないため。ajv を開発依存に加え、`scripts/` の検査機構からのみ用いる。本体の本番ビルドには含まれず静的アプリの規約に影響しない。#95は検査の登録簿を空で出荷し、登録0件で合格する。具体スキーマは #34／#96 が登録する。

## 実装した内容

- 新規 `scripts/harness/`: `config.mjs`（接続先・出力先・起動経路既定・ANGLE既定・GPU起動引数・計測時間既定12000ミリ秒・端末プロファイル）／`mode.mjs`（`resolveMode` 純粋）／`metrics.mjs`（純粋関数 `percentileNearestRank`・`summarizeFps`・`isSoftwareRenderer`・`evaluateRunAcceptance`、ページから描画系統名を読む `readRendererInfo`、Playwright非読込）／`schema-check.mjs`（ajv・登録簿）／`report.mjs`（JSON整形と書き出し、ブラウザ起動部品非読込）／`browser.mjs`（起動・版情報収集）／`page.mjs`（準備待ち・ウォームアップ・標本採取・撮影・ページ例外とコンソールエラーの分離収集）／`run-local.mjs`／`run-cloud.mjs`。
- 新規 コマンド入口 `scripts/quality-harness.mjs`（`--mode` ほかノブの解釈と動的読み込み）。
- 新規 単体テスト `scripts/harness/metrics.test.mjs`・`schema-check.test.mjs`・`mode.test.mjs` と検査用標本 `scripts/harness/__fixtures__/`。
- 新規 `docs/runbooks/quality-harness.md`（手順・GPU有効化の採用理由・クラウドとの違い・拡張指針）。
- 変更 `src/tools/perf/main.ts`: 区間ごとの生標本を複製して返すアクセサ `window.__fpsSamples = () => samples.slice()` を追加（複製返却は外部から内部配列を書き換えられないようにするため）。
- 変更 `src/types/globals.d.ts`・`src/tools/README.md`: `__fpsSamples` の契約を追記。
- 変更 `vitest.config.ts`: 検査対象に `scripts/**/*.test.mjs` を追加（既定が `src/**/*.test.ts` のみで基盤の単体テストが走らないため）。
- 変更 `package.json`: コマンド `quality`（`--mode=local`）と `quality:cloud`（`--mode=cloud`）、開発依存 `ajv` を追加。
- 変更 `.github/workflows/ci.yml`: 検証ジョブの末尾にクラウド側スキーマ検査の手順（`npm run quality:cloud`、ブラウザ非起動・GPU不要）を追加。
- 変更 `.gitignore`: ローカル出力先 `scripts/.quality-out/` を追加。

## 採用した数値とその理由（すべて理由を先に述べる）

- 下位5パーセンタイルの算出 = 最近接順位法（順位は天井(パーセンタイル/100 × 標本数)、最小1・最大は標本数でクランプ）: 標本は500ミリ秒区間の区間平均値で数が小さく、補間法は実在しない中間値を作って外れ値に引きずられやすいため、実測標本値をそのまま返す方法を採る。
- 計測時間の既定 = 12秒（24区間）: 下位5パーセンタイルが最小値そのものと一致すると区別する意味が失われる。最近接順位法では標本数20以下で順位が天井(0.05×20)=1となり最小値に一致し、21以上で順位2となる。500ミリ秒区間で21件以上を得るには10.5秒を超える必要があるため、余裕を見て12秒（順位は天井(0.05×24)=2）を既定とする。
- `run-local.mjs` の `measuredAvgFps` の既定 = 0: 計測へ到達する前に例外で抜けた場合（接続失敗など）は平均フックの欠落ではないため、誤った不合格理由を足さない。計測が走れば実際の読み取り値（フックが無ければ-1）で上書きする。0以上は合格側・負のみ不合格のため、極端に低い正常計測値0と欠落-1を取り違えない。

## レビューと検証（事実）

- 計画段階で Codex のレビューを3回反復し、`vitest.config.ts` の検査対象拡張・`prototype-fps.mjs` を厳格ゲート化しない分離・ソフトウェア描画判定語の網羅と取得不可の失敗扱い・GPU有効化方式を一次情報（Playwright公式・michelkraemerの記事）で確定・計測時間12秒・モード指定の起動引数化・クラウド経路の動的読み込みによるPlaywright非到達・純粋テストの直接読み込み・描画系統情報の信頼印記録を反映。3回目で「実装着手して良い」と判定。
- 実装後の Codex レビューで非ブロッキング推奨2件（標本0件と平均フック欠落を失敗にする、未捕捉例外を失敗にする）を反映。`evaluateRunAcceptance` を純粋関数として切り出しテスト駆動で実装。最終の確認レビューで「コミット/PRに進んで良い」と無条件判定。
- 検証はNode 22（バージョン22.23.0、`.nvmrc`に固定）で実施。`npm run typecheck`（厳格・両設定）型エラーなし。`npm run test`（vitest）98テスト全通過（基盤の純粋関数45・既存53）。`npm run build` と `npm run build:app` 成功。`npm run quality:cloud` 成功（ブラウザ非起動・登録0件で合格）。`npm run smoke` と engine-loop-smoke 成功。`npm run quality` 成功（実GPU ANGLE Direct3D 11 Intel Iris Xe・信頼可・デスクトップ毎秒60フレーム・モバイル相当毎秒46フレーム）。起動引数 `--angle=swiftshader` でSwiftShaderを検出して信頼不可と判定し失敗（終了コード非0）。`prototype-fps.mjs` は接続先既定・標準出力の体裁・計測ケース・スクリーンショット名が従来どおりで互換。
- 検証中の注意（事実）: `build:app`（index.htmlのみ）を最後に実行すると `dist/` が index.html だけになり、プレビューが `/prototype.html` に index.html を代替返却して別ページを計測する。3ページの `npm run build` を最後にすると解消する。`npm run build` の一時クラッシュは空きメモリの逼迫が原因で、Node 22では正常にビルドできる（CLAUDE.md記載のNode 24固有の問題ではない）。

## 次の主要作業

1. PR #118 のレビュー・マージ。
2. 各品質ゲートの実装（#97〜#103）。本基盤の `scripts/harness` の関数を直接読み込んで各ゲートのスクリプトを `scripts/` に置く。閾値判定は各ゲートと #104 が持ち込む。
3. 解析先行のゲート（マイルストーンM1）: #34（スキーマ定義）→ #46（TAKEOVERプロファイル）→ #96（スキーマ検証ゲート。本基盤の `schema-check.mjs` の登録簿へ曲プロファイルの検査を登録する）。
