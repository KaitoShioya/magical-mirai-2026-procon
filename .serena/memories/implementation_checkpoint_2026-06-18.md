# 実装チェックポイント（2026-06-18）

**状態: 実装着手。Issue #1（基盤・足場の起点）を完了し、PR #107 を作成済み。**
**用途**: セッション喪失時の復帰点（実装フェーズ）。設計正典は [[phase2_design_checkpoint_2026-06-14]]、コンセプト正典は [[concept_revision_checkpoint_2026-06-18]]、実行計画は [[dev_planning_checkpoint_2026-06-14]]。開発基盤の現状は [[dev_infrastructure_notes]]。

## 確定した最重要事項：実装アーキテクチャの正典

- **`docs/decisions/architecture.md` が実装アーキテクチャとディレクトリ構成の正典。** 後続の全Issueはこれを土台とする。3Dグラフィック・リズムゲーム・フレームワーク非依存TypeScriptアプリのベストプラクティス調査と本アプリ要件の照合で確定。
- 採用アーキテクチャ: 薄いモジュール構成＋トップレベル有限状態機械（完全なECSは不採用）／外部の楽曲再生位置（`player.timer.position`）を源泉とする固定時間刻みループ＋描画補間（操作音は `AudioContext.currentTime` の別時計）／状態を唯一の源泉とし three.js 描画はビュー／単一WebGL描画領域で3D→深度消去→2D正射影の明示パス順（`Object3D.layers` 不使用）／リソース取得（ローダ）と破棄（dispose走査、glTF/VRMは画像ビットマップを閉じる）の分離／エンジンと曲プロファイルの厳格分離。
- **依存規則（一方向固定）**: `engine`/`chart`/`scoring`/`input`/`audio` は `profiles` を import しない。`rendering` は状態を読むだけで論理を持たない。本体中核（`app`/`engine` 等）は `tools` を import しない（`tools` は共有設定のみ可）。

## Issue #1 で完了した内容

- 旧試作（旧 `src/` 一式・旧3HTML・旧 `vite.config.js`）を `docs/poc/` へ凍結アーカイブ（参照専用・Vite入力ではない）。
- TypeScript 厳格設定を導入。`tsconfig.json`（アプリ向け）と `tsconfig.node.json`（ビルド設定向け）を作成し、ビルドモード（`tsc -b`）を使わず設定ごとに `tsc -p` で個別型検査する方式を採用（参照先の `composite` 要求を避け、`vite.config.ts` の検査漏れを防ぐため）。
- `src/` を最上位サブシステムのディレクトリのみで確立し、各ディレクトリのREADMEに責務・禁止依存・担当Issue番号を記載。深い内部構造はディレクトリ化せず親READMEに将来構成として記述。
- 実体を置いたのは `src/main.ts`（最小起動）・`src/style.css`・`src/config/songs.ts`・`src/types/`（環境型・グローバル契約型・troika型宣言）・`src/tools/`（開発ツール）のみ。ドメイン型は各担当Issueが定義する。
- `src/config/songs.ts` の値は楽曲ロードの正典 `docs/support-page.md` と照合済み。既定曲は縦切り対象に合わせ TAKEOVER。

## 守る契約（移行で維持済み・今後も変更しない）

- 楽曲データ解析ツール（`analysis.html`／`src/tools/analysis/main.ts`）: `window.__songMap`・`document.title="DUMP_READY"`・`#status`。`scripts/dump-songmap.mjs` が依存。
- 描画性能検証ツール（`prototype.html`／`src/tools/perf/main.ts`）: `window.__fps`/`__avgFps`/`__resetFps` とクエリの値（`refl`/`bloom`/`bloomScale`/`points`/`rain`/`bpm`/`dpr`）。`scripts/prototype-fps.mjs` が依存。

## 検証結果（事実）

- `npm run typecheck`（厳格・両設定）型エラーなし。
- `npm run build` 成功。`dist/` に本体・解析・性能検証の3ページ出力（three.jsチャンクの500キロバイト超は警告でエラーではない。コード分割はM2／#7で扱う）。
- `node scripts/dump-songmap.mjs takeover` で `docs/analysis/takeover.songmap.json` 生成（ビート676・フレーズ90・237.25秒）、契約維持を確認。
- `BASE=http://localhost:5173 node scripts/prototype-fps.mjs` でページエラーなく毎秒フレーム数出力、契約維持を確認。

## 次の主要作業

1. PR #107 のマージ後、Issue #2（アプリ状態遷移マシン骨格、5画面状態）へ着手。続いて Issue #3（ゲームループ＋固定時間刻み）、Issue #4（TextAlive本起動＋ロード失敗導線）、Issue #5（6曲設定拡張・未実装曲無効化）。
2. 解析先行のゲート: マイルストーンM1（譜面・曲プロファイルパイプライン）で #34（スキーマ定義）→ #46（TAKEOVERプロファイル）→ #96（スキーマ検証ゲート）。
3. 後続へ送った範囲外事項: 楽曲データ解析の感情値中央値の算出方法は旧試作からの忠実移植であり、データを用いる #46 で見直す。`requireElement` の実行時型検査・性能検証ツールのクエリ値検証は各担当Issueで追加。`3dmodel/`（未追跡）は舞台土台モデル #105 の作業対象で本PRには含めていない。
