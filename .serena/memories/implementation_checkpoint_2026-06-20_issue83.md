# 実装チェックポイント（2026-06-20・Issue #83）

**状態: Issue #83（README整備）の対応を完了。ブランチ `worktree-issue-83-readme` で PR #137 を作成・push 済み。編集対象は `README.md` のみで、アプリの実装は変更していない。型検査・単体テスト451件・開発検証ビルド（本体と開発診断7ページの計8ページ）・本番ビルド（本体 index.html のみ）・開発サーバ配信（5173）・プレビュー配信（4173）を Node 22 で確認済み。レビュー後マージへ進む。**
**用途**: セッション喪失時の復帰点（マイルストーンM7 規約適合・最適化・提出の項目。受け入れ基準は「手順通りで第三者がビルド・実行できる」）。規約の正典は `docs/concept.md`「応募のきまり」、楽曲ロードの正典は `docs/support-page.md`、実装アーキテクチャは `docs/decisions/architecture.md`、関連実装は `src/main.ts`・`src/app/index.ts`・`src/screens/titleScreen.ts`・`src/config/songs.ts`・`src/tools/analysis/main.ts`・`src/rendering/reflection.ts`・`src/rendering/constants.ts`・`vite.config.ts`・`package.json`。

## 最重要の意思決定

- **本Issueの範囲は文書整備のみ。アプリ実装は変更しない**: 既に充実した `README.md`（166行）が存在したため、新規作成ではなく「記載と現状の実装・設定の食い違いの是正」と「Issue が必須とする項目の正確化」を行う。曲切替をアプリ本体へ結線することは機能実装であり別の課題に属するため範囲外とする。
- **`?song=` は現状を正確に記載し、本体結線は行わない**: 検証の結果、`src/main.ts` は URLパラメータ `smoke`・`refl`・`bloom` のみ読み `song` を読まない。`src/app/index.ts` の `createApp` は `findSong(DEFAULT_SONG_KEY)` で既定曲 TAKEOVER を固定読み込みする。`src/screens/titleScreen.ts` は6曲を一覧し `implemented` が真の曲だけ開始ボタンを持たせ偽の曲は「準備中」の無効ボタンにする。`src/config/songs.ts` で `implemented` が真なのは TAKEOVER のみ。`src/tools/analysis/main.ts` は `?song=` を読み解析対象曲を切り替える。これらより、アプリ本体の曲選択は題名画面であり遊べるのは TAKEOVER のみ、`?song=` が機能するのは開発用 `analysis.html` だけ、と正確に記載した。
- **規約適合の境界**: AI生成物排除監査（#79）とクレジット表記システム（#82）には踏み込まず、README は現状方針の反映に留める。各 Issue の実装範囲を侵さない。

## README で是正・追加した内容（`README.md` のみの変更、64追加・24削除）

- 対応楽曲: 「現在の状態」列を追加し、TAKEOVER を「遊べる（既定の読み込み曲）」、他5曲を「準備中」とした。アプリ本体は題名画面で曲を選ぶこと、`?song=` は開発用 `analysis.html` 限定でアプリ本体は常に TAKEOVER を読み込むことを明記。
- セットアップ: Node.js の動作条件を `package.json` の `engines`（20.19.0 以上または 22.12.0 以上、推奨22系）に正確化。依存導入を `npm ci`（固定ファイル `package-lock.json` どおりの導入）を主、`npm install` を開発時の選択肢として併記。`TEXT_ALIVE_API_TOKEN` が `import.meta.env.VITE_TEXTALIVE_TOKEN` として注入される関係を明記。`npm test` を動作確認手段として追加。
- ページ構成: `vite.config.ts` の入口に合わせ、本番配信対象（本体 `index.html` のみ）と開発診断用の7ページ（`analysis.html`・`prototype.html`・`typography.html`・`rain.html`・`camera-trajectory.html`・`rendering.html`・`input.html`）を別表・別見出しに分離。従来の本文中の開発ページ数の食い違いを是正。
- アプリ本体のURLパラメータ節を新設: 本番でも有効な表示調整（`refl`・`bloom`）と開発検証用の診断モード（`smoke`）を用途区分つきで記載。
- 動作環境: 実行環境（ブラウザと端末）とビルド環境（Node.js）を区別して明確化。

## 採用した記載値とその理由（理由を先に述べる）

- Node.js 24系を避ける理由を「応募規約ではなくビルド工具の都合」と明記: 規約由来の禁止と誤読させないため。実体はビルド工具（Vite 5.4系とそれが用いる Rollup）が Node.js 24系の本番ビルドで異常終了し、22系の長期サポート版では正常完了することを確認済みであるため。
- 依存導入を `npm ci` 主・`npm install` 併記: 第三者が同一の依存の版でビルドを再現するには固定ファイルどおり導入する `npm ci` が確実なため。`package-lock.json` が存在することが前提として成り立つことを確認済み。
- `refl` の受理値を `0`（反射を無効化）・`256`・`512`、未指定や不正値は既定の `512` と記載: `src/rendering/constants.ts` の `REFLECTION_RESOLUTIONS = [0, 256, 512]` と `DEFAULT_REFLECTION_RESOLUTION = 512`、`src/rendering/reflection.ts` の解釈（Issue #9 受け入れ基準「256と512で可変、refl=0 で無効化」）に一致させたため。
- 開発サーバのポートを5173、プレビューのポートを4173と記載: `vite.config.ts` に開発サーバとプレビューのポートを上書きする設定が無く、Vite の既定値がそのまま適用されるため。

## レビューと検証（事実）

- 計画段階で Codex のレビューを3巡反映: URLパラメータの用途区分の分離、ページ構成の本番対象と開発診断用の見出し分離、`npm test` と型検査の位置づけ（必須起動手順でなく動作確認）、6曲のうち遊べるのは TAKEOVER のみという誤読防止、トークン変数名の注入関係の明示、`npm ci` と `npm install` の使い分け、動作環境の実行環境とビルド環境の区別。
- 実装後の Codex レビューを1巡反映: `refl` の受理値（0・256・512、未指定や不正値は既定の512）と `bloom` の有効化例（1）を実装どおりに補足。
- 参照先ファイルと開発診断用7ページのHTMLがすべて実在することを確認。
- `npm ci` 成功（132パッケージ導入）。
- `npm run typecheck`（厳格・両設定）: 型エラーなし。
- `npm test`（vitest, Node 22）: 全36ファイル451テスト通過。
- `npm run build`（全8ページ）と `npm run build:app`（本体 index.html のみ）: 成功。Node 24系は `vite build` が異常終了する既知の環境問題のため Node 22系（`.nvmrc`）で実施。
- 実行検証（README手順どおり）: `npm run dev` が `http://localhost:5173/` で本体HTML（`#stage`・`#app`・モジュール `/src/main.ts`）を HTTP 200 で配信。`npm run preview` が `http://localhost:4173/` で本番ビルド成果物をバンドル済み資産付きで HTTP 200 配信。本番ビルドの `dist` 内HTMLは `index.html` のみで、プレビューで `/analysis.html` が200を返すのは解析ツールでなく `index.html` への代替配信（内容が `/` とバイト一致）であり、開発診断ページが本番に含まれないことを確認。

## 次の主要作業

1. PR #137 のレビューとマージ（本チェックポイント push 後）。
2. マイルストーンM7 の規約適合・提出の後続: #79 AI生成物排除監査（花・蝶・ひまわりがコード描画である旨を README とクレジットに明記する監査）、#82 クレジット表記システム（ピアプロ指定文言をアプリ内常設区画と README に表示。README のライセンス・出典節と常設クレジット区画の結線がここで完結する）、#80 静的アプリ規約適合確認、#84 性能最終確認、#85 実機テストマトリクス、#86 応募フォーム提出物準備、#87 提出コミット凍結とタグ付け。
3. README はアプリ本体への `?song=` 曲切替が結線され次第（別の課題）、対応楽曲節の「準備中」表記を実装状況に合わせて更新する。
