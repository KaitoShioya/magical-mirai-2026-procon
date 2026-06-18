# 実装チェックポイント（2026-06-18・Issue #7）

**状態: Issue #7（配信CI）の実装を完了し、PR #109 を作成・push 済み。配信先を GitHub Pages から Cloudflare Pages + Cloudflare Access へ変更した。**
**用途**: セッション喪失時の復帰点（実装フェーズ）。前段は [[implementation_checkpoint_2026-06-18_issue6]]、その前は [[implementation_checkpoint_2026-06-18]]、設計正典は [[phase2_design_checkpoint_2026-06-14]]、実行計画は [[dev_planning_checkpoint_2026-06-14]]、開発基盤の現状は [[dev_infrastructure_notes]]。

## 最重要の意思決定：配信先を GitHub Pages から Cloudflare Pages + Cloudflare Access へ変更

- **判断基準（先に述べる）**: 規約（`docs/concept.md` 117行）が募集期間中に作品内容を推測させる公開を禁止しているため、配信は誰でも閲覧できる一般公開ではなく、アクセス制限がかかることが必須要件である。
- **各プロバイダの評価**: GitHub Pages は有料プランでもサイトが一般公開され、サイト自体の閲覧制限には GitHub Enterprise Cloud が必要なため要件を満たせない。Netlify 無料・Vercel 無料は本番ドメインのアクセス制限が有料プラン必須のため満たせない。Cloudflare Pages + Cloudflare Access は無料の Zero Trust（メール宛て一度きり暗証番号認証、最大50人）で閲覧者を限定でき、独自サブドメインのルート配信で Vite の `base` 設定が不要、GitHub 連携の自動デプロイとビルド時のトークン注入にも対応する。
- **結論**: 配信先を Cloudflare Pages + Cloudflare Access とした。Issue 本文は GitHub Actions での build から deploy を求めているため、配信先を変えてもデプロイ手段は GitHub Actions（`cloudflare/wrangler-action@v3`）を維持した。Issue タイトルは「GitHub Pages」だが、`CLAUDE.md`「齟齬は正典（規約）を優先」に従った。正典文書 `docs/decisions/architecture.md` と `docs/research/06-tech-stack-and-architecture.md` の配信記述も Cloudflare Pages 基準へ更新済み。

## Issue #7 で実装した内容（PR #109 / ブランチ feat/issue-7-deploy-ci）

- `vite.config.ts`: `vite build --mode app` のときだけ入口を `index.html` のみに絞る分岐を追加（本番配信物に開発ツール analysis.html・prototype.html を混入させないため。専用 mode を使う理由は、`--mode app` でもビルドの NODE_ENV は production のままで入口制御専用の軸として使えるため）。トークン取得は既存の `loadEnv(mode, process.cwd(), "")` のままで、空プレフィックス指定により CI 環境でも環境変数 `TEXT_ALIVE_API_TOKEN` から取得できる。
- `package.json`: 本番配信用スクリプト `build:app`（`npm run typecheck && vite build --mode app`）を追加。既存の `build`（開発検証用に3ページ出力）は不変。追加依存なし。
- `.github/workflows/deploy.yml`（新規）: `main` への push と手動実行を契機に、型検査・本番ビルド・成果物検証・Cloudflare Pages へのデプロイを行う。
- `.env.example`（新規・コミット対象）: トークン設定の雛形。`.gitignore` の `.env.*` が例ファイルを無視するため、直後に `!.env.example` を追加して追跡対象にした。
- `README.md`: 配信節（選定理由・必要な Secrets と Variables・Cloudflare 側の事前準備・Cloudflare Access の設定手順・提出時の凍結）を追加し、`.env` 作成手順を `.env.example` のコピーへ変更。

## ワークフローの要点（判断理由つき）

- 有効化ガード `if: ${{ vars.DEPLOY_ENABLED == 'true' && github.ref == 'refs/heads/main' }}`: 配信先の準備が整う前のマージや、`main` 以外を対象にした手動実行（workflow_dispatch）での誤った本番配信を防ぐため、Variable `DEPLOY_ENABLED` が `true` かつ対象が `main` のときだけ実行し、それ以外はスキップ（失敗扱いにしない）。提出後の凍結は `DEPLOY_ENABLED` を `false` にするだけで実現できる。
- 設定検証ステップ: `CLOUDFLARE_PAGES_PROJECT_NAME`（Variable）・`CLOUDFLARE_API_TOKEN`・`CLOUDFLARE_ACCOUNT_ID`（Secrets）が未設定、またはプロジェクト名が雛形値のままのとき、値をログに出さず失敗させる。
- Node.js は `node-version-file: ".nvmrc"`（22）に追従（Node 24 系のビルド異常終了を避けるため。詳細は [[implementation_checkpoint_2026-06-18_issue6]]）。
- 成果物検証: `dist` に `index.html` があり `analysis.html`・`prototype.html` が無いこと、加えて名前に `analysis` または `prototype` を含むファイルが無いことを `find` で確認し、混入時はパスを出力して失敗させる。
- デプロイ: `pages deploy dist --project-name=<Variable> --branch=main`。`--branch=main` を明示するのは本番デプロイとして確実に扱わせるため（Pages プロジェクトの本番ブランチを `main` に設定する前提）。
- 同時実行制御: `concurrency` を固定名 `deploy-cloudflare-pages` にし、配信先が単一プロジェクトであることに合わせ全デプロイを直列化。

## ゴール基準（Issue #7 受け入れ基準）の充足状況

- 受け入れ基準は「push でデプロイ成功」「本番URLで 直接アクセス・リロード・?song=付きURL の3ケースが動作」。
- ?song= は「クエリ付きでもページが表示される（エラーで落ちない）」ことの確認であり、曲選択の反映は別Issue #5 の範囲（本Issueの達成基準には含めない）。
- 現アプリはプレースホルダ表示のみのため、配信さえ通れば3ケースは静的配信で成立する。
- 実際の配信成立には、コードでは賄えないユーザー作業（後述）が前提で、それが揃い `DEPLOY_ENABLED=true` にして初めてデプロイが走る。Issue タイトルの「早期に空で設置」どおり、配信経路の足場を先に通す段階である。

## 配信を実際に動かすために必要なユーザー作業（コードで賄えない外部設定）

1. Cloudflare で Pages プロジェクトを Direct Upload 種別で作成し、本番ブランチを `main` に設定。
2. GitHub の Secrets に `TEXT_ALIVE_API_TOKEN`・`CLOUDFLARE_API_TOKEN`・`CLOUDFLARE_ACCOUNT_ID` を登録。
3. GitHub の Variables に `CLOUDFLARE_PAGES_PROJECT_NAME` を登録。
4. Cloudflare Access で preview 用と本番用の2つのポリシーを作成し、メール宛て一度きり暗証番号認証を設定（Pages 設定の「Enable access policy」は preview のみ保護するため、本番 `<プロジェクト名>.pages.dev` は Access アプリでサブドメイン欄の `*` を外して別ポリシーにする）。
5. 未認証ブラウザで本番URLと preview URL の双方が認証を要求すること（一般公開でないこと）を確認してから Variables `DEPLOY_ENABLED` を `true` にする。

## 検証結果（事実）

- `npm run typecheck`（厳格・両設定）: 型エラーなし。
- `npm run build:app`: 成功し、`dist` は `index.html` と `assets` のみ、開発ツール由来ファイルの混入なし。
- `npm run build`: 成功し、index・analysis・prototype の3ページ出力（既存ビルドへの回帰なし）。
- `deploy.yml`: YAML として解釈可能で、有効化ガード条件と配信コマンドが意図どおり。
- 実装は Codex のレビューで「P0なし・条件付きマージ可」と確認し、指摘された P1・P2（本番デプロイの明示・同時実行の直列化・手動実行の main 限定・規約面の事前確認手順・成果物検証の堅牢化）を反映済み。

## 次の主要作業

1. PR #109 のマージ後、Issue #2（アプリ状態遷移マシン骨格、5画面状態）へ着手。続いて #3（ゲームループ＋固定時間刻み）、#4（TextAlive 本起動＋ロード失敗導線）、#5（6曲設定拡張・未実装曲無効化、?song= の反映処理を含む）。
2. 解析先行のゲート: マイルストーンM1で #34（スキーマ定義）→ #46（TAKEOVERプロファイル）→ #96（スキーマ検証ゲート）。
3. `3dmodel/`（未追跡）は舞台土台モデル #105 の作業対象で、本PRには含めていない。
