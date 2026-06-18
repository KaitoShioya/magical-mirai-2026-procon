# マジカルミライ2026 プログラミング・コンテスト応募作品

TextAlive App API を使った、歌詞がリアルタイムに同期して動くリリックアプリです。テーマ「湖のソナーレ」を舞台に、キネティックタイポグラフィとタップ操作で湖を奏でるリリック・リズム作品を目指しています。

技術スタックは TypeScript・Vite・three.js・troika-three-text・Web Audio・TextAlive App API です。画面の枠組みを作るフレームワークは使いません。設計の確定版は `docs/decisions/architecture.md` を参照してください。

## 対応楽曲

課題曲6曲を登録済みです（URLパラメータ `?song=<key>` で曲を切り替える設計。曲選択をアプリに反映する処理は後続の実装で追加する）。

| key | 曲名 | アーティスト |
|-----|------|-------------|
| `kotaete` | こたえて | imie |
| `after-the-curtain` | アフター・ザ・カーテン | Rulmry |
| `shutter-chance` | シャッターチャンス | 夜未アガリ |
| `sekai-saigo` | 世界最後の音楽隊 | 夏山よつぎ×ど～ぱみん |
| `toritsuku-logy` | トリツクロジー | 鶴三 |
| `takeover` *(デフォルト)* | TAKEOVER | Twinfield |

> デフォルトを TAKEOVER にしているのは、共通エンジンを最初に縦切りで完成させる対象が TAKEOVER のためです（作品仕様の正典 `docs/idea/concept-final.md`）。

## セットアップ

### 必要なもの
- Node.js 20系 または 22系 の長期サポート版（22系を推奨）。**Node.js 24系は使わないこと。** 理由を先に述べる。本作のビルド工具（Vite 5.4系とそれが用いる Rollup）は Node.js 24系での本番ビルド中に異常終了し、Node.js 22系の長期サポート版では正常に完了することを確認済みのためである。推奨版はプロジェクト直下の `.nvmrc`（22）に記載している。
- TextAlive アプリトークン（[developer.textalive.jp/profile](https://developer.textalive.jp/profile) で取得）

### 手順

```bash
# 依存関係のインストール
npm install

# .env.example をコピーして .env を作成し、TEXT_ALIVE_API_TOKEN に取得したトークンを設定（.env はコミットしない）
cp .env.example .env

# 開発サーバ起動（http://localhost:5173）
npm run dev

# 型検査（strict）。tsconfig.json と tsconfig.node.json を個別に検査する
npm run typecheck

# 開発検証用の静的ビルド（型検査を経て dist/ に出力。本体に加え開発ツール2ページも出力される）
npm run build

# 本番配信用ビルド（本体 index.html のみを dist/ に出力。開発ツール2ページは含めない）
npm run build:app

# ビルド後のプレビュー
npm run preview
```

## ページ構成

下表はローカル開発時（`npm run dev` / `npm run build`）のページである。**本番配信（Cloudflare Pages）に含めるのは本体 index.html のみ**で、開発ツールの2ページは配信に含めない。

| URL | 説明 |
|-----|------|
| `/` または `/index.html` | アプリ本体（リリックアプリ）。本番配信対象 |
| `/analysis.html?song=<key>` | 開発用: 楽曲データ解析ツール。本番配信に含めない |
| `/prototype.html` | 開発用: 描画性能検証ツール。本番配信に含めない |

## ディレクトリ構成（概要）

`src/` は最上位のサブシステムごとに分かれ、各ディレクトリの README に責務・禁止依存・担当Issueを記しています。確定版は `docs/decisions/architecture.md` を参照してください。

- `src/main.ts` — アプリ本体の入口
- `src/config/` — 楽曲ロード設定と調整値
- `src/types/` — 共有型・環境型の宣言
- `src/tools/` — 開発ツール（楽曲データ解析・描画性能検証。提出本体には含めない）
- `src/app` `src/textalive` `src/engine` `src/chart` `src/scoring` `src/input` `src/audio` `src/screens` `src/rendering` `src/typography` `src/ui` `src/profiles` `src/utils` — 各サブシステム（後続Issueで実装）
- `docs/poc/` — 旧試作の凍結アーカイブ（参照専用）

## 開発用スクリプト

```bash
# 楽曲データを解析して docs/analysis/<key>.songmap.json に保存（要 dev サーバ起動）
node scripts/dump-songmap.mjs takeover

# 描画性能（毎秒フレーム数）を計測（要 dev サーバ起動。BASE で接続先を明示）
BASE=http://localhost:5173 node scripts/prototype-fps.mjs
```

## 配信（Cloudflare Pages + Cloudflare Access）

募集期間中の一般公開は規約で禁止されているため（応募のきまり）、本番は Cloudflare Pages に配信し、Cloudflare Access のメール宛て一度きり暗証番号認証で閲覧者を限定する。GitHub Pages は有料プランでもサイトが一般公開され、サイト自体の閲覧制限には上位プランが必要なため採用しない。本番に公開するのは本体 `index.html` のみで、開発ツール（analysis.html / prototype.html）は配信に含めない。

### デプロイの仕組み

`main` ブランチへの push（または main を対象にした手動実行）で GitHub Actions（`.github/workflows/deploy.yml`）が起動する。ただし実際にデプロイするのは Variables `DEPLOY_ENABLED` が `true` かつ対象が `main` のときだけで、それ以外（未設定・`false`・main 以外のブランチ）はジョブをスキップする（赤いエラーにならない）。デプロイ時は、設定検証 → 型検査 → 本番ビルド（`npm run build:app`、index.html のみ・トークン注入）→ 成果物検証 → `cloudflare/wrangler-action` の `pages deploy dist --branch=main`（本番デプロイ）を実行する。Cloudflare Pages プロジェクト名は YAML を書き換えず Variables `CLOUDFLARE_PAGES_PROJECT_NAME` で渡す。Node.js は `.nvmrc`（22）に追従する。

### 必要な GitHub Secrets と Variables

「Settings → Secrets and variables → Actions」で設定する。

Secrets（秘匿値）:

| 名前 | 用途 |
|------|------|
| `TEXT_ALIVE_API_TOKEN` | ビルド時に `import.meta.env.VITE_TEXTALIVE_TOKEN` へ注入 |
| `CLOUDFLARE_API_TOKEN` | Pages デプロイ用。権限は Account スコープの Cloudflare Pages（Edit） |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare アカウントID |

Variables（非秘匿の設定値）:

| 名前 | 用途 |
|------|------|
| `CLOUDFLARE_PAGES_PROJECT_NAME` | デプロイ先の Cloudflare Pages プロジェクト名 |
| `DEPLOY_ENABLED` | `true` のときだけデプロイする。準備が整うまで設定せず、凍結時は `false` にする |

`GITHUB_TOKEN` は GitHub Actions が自動発行するため手動登録は不要である。

### Cloudflare 側の事前準備

1. Cloudflare アカウントを作成し、Account ID を控える。
2. Pages プロジェクトを **Direct Upload 種別**で作成する。決めたプロジェクト名を Variables `CLOUDFLARE_PAGES_PROJECT_NAME` に登録する。本番URLは `https://<プロジェクト名>.pages.dev` になる。「New project from Git」を選ぶと内蔵の自動ビルドが有効化され wrangler の直接アップロードと二重化するため選ばない。ワークフローは `--branch=main` でデプロイするため、プロジェクトの production branch（本番ブランチ）を `main` に設定しておく。
3. API トークンを発行し（権限: Account スコープの Cloudflare Pages（Edit））、上記 Secrets に登録する。
4. Cloudflare Access を後述の手順で設定する。
5. 準備が整い、かつ **未認証のブラウザで本番URLと preview URL の双方が Access 認証を要求すること**（誰でも閲覧できる状態でないこと）を確認したうえで、Variables `DEPLOY_ENABLED` を `true` にする（これでデプロイが有効になる）。

### Cloudflare Access による限定公開（公式手順）

1. Workers & Pages → 対象プロジェクト → Settings → General で「Enable access policy」を有効化する。これは preview デプロイのハッシュ付きURL（例 `<ハッシュ>.<プロジェクト名>.pages.dev`）だけを認証必須にし、この操作で Zero Trust に Access アプリケーションが作られる。この設定だけでは本番 `<プロジェクト名>.pages.dev` は保護されない。
2. 本番 `<プロジェクト名>.pages.dev` を保護するため、Zero Trust → Access のアプリケーションで、サブドメイン欄の `*` ワイルドカードを外して `<プロジェクト名>` を指定したポリシーを用意する。
3. 両ポリシーに、許可するメールアドレスの一覧と一度きり暗証番号（メール）認証を設定する。
4. 本番用（`<プロジェクト名>.pages.dev`）と preview 用（`*.<プロジェクト名>.pages.dev`）の2つの Access ポリシーが作成されていることを確認し、未認証のブラウザで本番URLと preview URL の双方が認証要求されることを確認する。

参考: https://developers.cloudflare.com/pages/configuration/preview-deployments/ と https://developers.cloudflare.com/pages/platform/known-issues/

### 提出時の凍結

募集期間終了から入賞発表までは更新が禁止されるため、提出時点のコミットにタグを付けて版を固定する。あわせて Variables `DEPLOY_ENABLED` を `false` にして自動デプロイを止める（誤って `main` へ push してもジョブがスキップされ版が変わらない）。凍結中は Cloudflare ダッシュボードやローカルの wrangler からの手動デプロイも行わない。

## 動作環境

- Google Chrome / Edge 最新版（スマートフォン横持ちを主軸、パソコン対応）
- TextAlive ホストには接続不要（スタンドアロン動作）

## ライセンス・出典

- 楽曲・歌詞: 各作者様（piapro.jp）— マジカルミライ2026楽曲コンテスト受賞作品
- 本アプリに AI 生成の絵・音楽・文章は使用していません
