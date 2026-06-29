# マジミラ2026 プロジェクター

あなたのプレイで湖面でひまわりと蝶に囲まれて歌を奏でる初音ミクの姿を完成させよう！
リズムに合わせて湖面を弾くと、ミクの周りにひまわりが咲き、蝶が舞います。
リズムにのるほどひまわりは密に咲き、きれいな景色が生まれます！あなたの作った景色は最後にカメラモードで撮影して保存・共有することが可能です！
きれいにひまわりを咲かせて、ワールドを動き回ることで一番きれいな景色のアングルを見つけよう！

## 素材

- 浜名湖：国土地理院の数値標高データを加工して作成した地形メッシュを利用して浜名湖をアプリケーションの舞台に設定しています．(クレジットについてはアプリ中に記載)
- 初音ミク：VRoid StudioとBlenderを使って作者が作成しました。

## 対応楽曲

課題曲6曲を登録しています。アプリ本体（`index.html`）では題名画面で曲を選びます。現在は6曲中5曲を遊べます。未実装の「世界最後の音楽隊」だけは題名画面に「準備中」と表示され、まだ選べません。

| key | 曲名 | アーティスト | 状態 |
|-----|------|-------------|------|
| `kotaete` | こたえて | imie | 遊べる |
| `after-the-curtain` | アフター・ザ・カーテン | Rulmry | 遊べる |
| `shutter-chance` | シャッターチャンス | 夜未アガリ | 遊べる |
| `sekai-saigo` | 世界最後の音楽隊 | 夏山よつぎ×ど～ぱみん | 遊べる |
| `toritsuku-logy` | トリツクロジー | 鶴三 | 遊べる |
| `takeover` | TAKEOVER | Twinfield | 遊べる |

## セットアップ

### 必要なもの
- Node.js は 22系の長期サポート版を推奨します（推奨版はプロジェクト直下の `.nvmrc` に `22` と記載）。動作条件は `package.json` の `engines` に従い、20.19.0 以上または 22.12.0 以上です。**Node.js 24系は使わないでください。** これは応募規約による制限ではなく、本作のビルド工具の都合です。理由を先に述べると、ビルド工具（Vite 5.4系とそれが用いる Rollup）が Node.js 24系での本番ビルド中に異常終了し、Node.js 22系の長期サポート版では正常に完了することを確認済みのためです。
- TextAlive アプリトークン（[developer.textalive.jp/profile](https://developer.textalive.jp/profile) で取得）

### 手順

```bash
# 依存関係のインストール。第三者が同じ依存の版で再現するため、固定版（package-lock.json）どおりに導入する npm ci を使う
npm ci
# 開発中に依存を更新したい場合は npm install を使う（package-lock.json を更新する）

# .env.example をコピーして .env を作成し、TEXT_ALIVE_API_TOKEN に取得したトークンを設定する（.env はコミットしない）。
# ここに設定した TEXT_ALIVE_API_TOKEN は、ビルド時に import.meta.env.VITE_TEXTALIVE_TOKEN としてアプリへ渡る。
cp .env.example .env

# 開発サーバ起動（http://localhost:5173）
npm run dev

# 型検査（strict）。tsconfig.json と tsconfig.node.json を個別に検査する
npm run typecheck

# 単体テスト（vitest）。動作確認に使う
npm test

# 開発検証用の静的ビルド（型検査を経て dist/ に出力。本体に加え開発・診断用の7ページも出力される）
npm run build

# 本番配信用ビルド（本体 index.html のみを dist/ に出力。開発・診断用ページは含めない）
npm run build:app

# ビルド後のプレビュー（http://localhost:4173）
npm run preview
```

## ページ構成

Vite のマルチページ構成です。ローカル開発時（`npm run dev` または `npm run build`）には次のページが出力されます。**本番配信（Cloudflare Pages）に含めるのは本体 `index.html` のみ**で、開発・診断用のページは配信に含めません（本番配信用ビルド `npm run build:app` では本体だけを出力します）。

本番配信に含めるページ:

| URL | 説明 |
|-----|------|
| `/` または `/index.html` | アプリ本体（リリックアプリ） |

開発・診断用のページ（全7ページ。いずれも本番配信に含めない）:

| URL | 説明 |
|-----|------|
| `/analysis.html?song=<key>` | 楽曲データ解析ツール。`?song=` で解析する曲を指定する |
| `/prototype.html` | 描画負荷の基準検証ツール |
| `/typography.html` | キネティック文字エンジンの受け入れ診断（性能計測） |
| `/rain.html` | 雨パーティクルの単独診断 |
| `/camera-trajectory.html` | カメラ軌跡システムの受け入れ診断 |
| `/rendering.html` | 発光点の描画命令数の受け入れ診断 |
| `/input.html` | 入力アーキテクチャの受け入れ診断 |

## アプリ本体のURLパラメータ

アプリ本体（`index.html`）は次のURLパラメータを解釈します。用途ごとに分けて示します。

本番ビルドでも有効な表示調整:

| パラメータ | 値 | 効果 |
|-----------|-----|------|
| `refl` | `0`（反射を無効化）・`256`・`512` のいずれか。未指定や不正値は既定の `512` | 水面反射の解像度を変える。自動の負荷調整を入れる前に反射を手動で抑える退避手段として本番でも有効にしている |
| `bloom` | `0` で無効。未指定や他の値（明示的に有効化するなら `1`）は有効 | 発光のにじみ（ブルーム）後処理の有無を切り替える |

開発・検証用:

| パラメータ | 値 | 効果 |
|-----------|-----|------|
| `smoke` | `1` で有効 | 診断モード。トークンに依存しない擬似再生で画面遷移を検証し、中心キャラクターのモデルは読み込まない |

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

# フォントのサブセット生成（assets/fonts-source/ の元フォントから public/fonts/ の .woff を作る。欠字があれば失敗する）
npm run build:font-subset

# UI見出し用フォント（M PLUS 1）のサブセット生成（assets/fonts-source/MPLUS1-VF.ttf から public/fonts/ の .woff2 を作る。欠字または上限超過で失敗する）
npm run build:ui-font-subset

# キネティック文字エンジンの性能検証（要 dev サーバ起動。ANGLE経由でGPU描画して受け入れ基準を判定する）
BASE=http://localhost:5173 npm run typography:fps
```

### 文字エンジンの性能検証（正式判定）

描画性能の正式な合否はGPUのある手元の環境で行う（ヘッドレスのブラウザは既定でGPUを使わず計測値が実機性能を表さない。`docs/research/08-quality-assurance.md` §1）。`npm run typography:fps` は Issue #95 の品質検査ハーネスと同じ方式で、Chromium を新しいヘッドレスモードと ANGLE（DirectX 11）で起動して実GPU描画し、`typography.html` を駆動して受け入れ基準を判定する。ソフトウェア描画にフォールバックしていないことを描画系統名で確認し、フォールバック時は失敗にする。判定は、平均と単発フレーム落ちを実測再現（最悪集中区間）で、初回表示遅延を出現が連続する条件（実プレイの密な歌詞区間に相当）で行う。初回表示遅延を連続条件で測る理由は、時間的に孤立した単発の出現は troika が後続作業まで配置確定を遅らせるバッチ挙動の影響を受け、実プレイを代表しないためである。

目視や手動計測を行う場合は、`npm run dev` を起動しGPUを使う通常起動のブラウザで `http://localhost:5173/typography.html` を開く。画面左上に1フレームごとの計測値（平均・下位5パーセンタイルの毎秒フレーム数、33ミリ秒超のフレーム落ち回数、初回表示遅延）が出る。標準計測条件は画面寸法 1280×720 と 390×844・画素密度上限2・表示残存4拍である。クエリで条件を変えられる（`profile=real|maxload`、`start=<ミリ秒>`、`residence=<ミリ秒>`、`dpr=<上限>`、`bloom=0|1`、`single=<数>`、`batched=<数>`、`speed=<倍率>`）。

## 配信（Cloudflare Pages + Cloudflare Access）

募集期間中の一般公開は規約で禁止されているため（応募のきまり）、本番は Cloudflare Pages に配信し、Cloudflare Access で閲覧者を限定する（自分の Cloudflare アカウント、または許可したメールアドレスのみが閲覧可能）。GitHub Pages は有料プランでもサイトが一般公開され、サイト自体の閲覧制限には上位プランが必要なため採用しない。本番に公開するのは本体 `index.html` のみで、開発・診断用のページ（「ページ構成」に挙げた7ページ）は配信に含めない。

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

1. Cloudflare アカウントを作成する。
2. Account ID を控える（ダッシュボードの「Workers & Pages」を開くと右側に表示される）。Secrets `CLOUDFLARE_ACCOUNT_ID` に登録する。
3. API トークンを発行する（権限: Account スコープの「Cloudflare Pages」「Edit」）。Secrets `CLOUDFLARE_API_TOKEN` に登録する。
4. Pages プロジェクトを **wrangler で作成**する。ダッシュボードの Direct Upload では本番ブランチ（production branch）を設定できず、その場合ワークフローの `--branch=main` が preview 扱いになって本番URLが更新されないため、本番ブランチを `main` に指定して作成する。`CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` を環境変数に設定した状態で次を実行する（`<プロジェクト名>` は任意）:

   ```bash
   npx wrangler pages project create <プロジェクト名> --production-branch=main
   ```

   作成したプロジェクト名を Variables `CLOUDFLARE_PAGES_PROJECT_NAME` に登録する。本番URLは `https://<プロジェクト名>.pages.dev` になる。
5. Cloudflare Access を後述の手順で設定する。
6. 準備が整い、かつ **未認証のブラウザで本番URLと preview URL の双方が Access 認証を要求すること**（誰でも閲覧できる状態でないこと）を確認したうえで、Variables `DEPLOY_ENABLED` を `true` にする（これでデプロイが有効になる）。

### Cloudflare Access による限定公開

前提: 初回は Cloudflare の Zero Trust（無料プラン）を有効化しておく必要がある（左メニューの「Zero Trust」からチーム名を決め、Free プランを選択する。無料だが支払い方法の登録が求められ、請求は発生しない）。これを有効化しないと次の「Enable access policy」が表示されない。

1. Workers & Pages → 対象プロジェクト → Settings → General で「Enable access policy」を有効化する。これは preview デプロイのURL（`*.<プロジェクト名>.pages.dev`）を認証必須にし、この操作で Zero Trust に Access アプリケーションが作られる。この設定だけでは本番 `<プロジェクト名>.pages.dev`（サブドメインなし）は保護されない（ワイルドカード `*.` は apex を含まないため）。
2. 本番URLも保護するため、作られた Access アプリケーションの「Destinations（Public hostnames）」に宛先を1つ追加する。Subdomain を空欄、Domain を `<プロジェクト名>.pages.dev` にして保存する。既存の `*`（preview 用）の行はそのまま残す。これで preview 用（`*.<プロジェクト名>.pages.dev`）と本番用（`<プロジェクト名>.pages.dev`）の両方が同じアプリケーションのポリシーで保護される。
3. ポリシーで許可する対象を設定する（自分の Cloudflare アカウントのみを許可する既定のポリシー、または許可するメールアドレス一覧と一度きり暗証番号（メール）認証）。
4. 未認証のブラウザで本番URLと preview URL の双方が認証を要求すること（誰でも閲覧できる状態でないこと）を確認する。なお最初のデプロイ前は、認証を通しても配信物が無いため接続が一時的にタイムアウトすることがあるが、これは正常で、デプロイ後に解消する。

参考: https://developers.cloudflare.com/pages/configuration/preview-deployments/ と https://developers.cloudflare.com/pages/platform/known-issues/

### 提出時の凍結

募集期間終了から入賞発表までは更新が禁止されるため、提出時点のコミットにタグを付けて版を固定する。あわせて Variables `DEPLOY_ENABLED` を `false` にして自動デプロイを止める（誤って `main` へ push してもジョブがスキップされ版が変わらない）。凍結中は Cloudflare ダッシュボードやローカルの wrangler からの手動デプロイも行わない。

## 動作環境

実行環境（このアプリを動かすブラウザと端末）:

- Google Chrome または Microsoft Edge の最新版
- スマートフォン横持ちを主軸とし、パソコンにも対応
- TextAlive ホストには接続不要（スタンドアロン動作）

ビルド環境（開発とビルドに使う環境）は、上の「セットアップ」に記した Node.js の条件を参照してください。

## ランキングと百分位について

このアプリは、プレイ結果の「上位何パーセント相当」を、外部サーバを使わずアプリ内に同梱した固定の水準分布で推定して表示します。外部サーバを使わない理由は、静的Webアプリの規約により動的な応答を返すオンライン順位サーバを持てないためです。

水準分布は、得点の理論的な最大と最小から累積分布関数を合成し、少数の実測で補正して同梱します。現時点の補正値は理論由来の初期値であり、通しプレイが完成した後のプレイ検証の実測で差し替える予定です。

表示は「上位◯パーセント相当」の語を使います。◯は上位率で、高得点ほど小さい値になります。

ここで表示する値は作品内の推定（固定分布）であり、実際のオンライン順位ではありません。

## ライセンス・出典

アプリ内にも常設のクレジット表示がある（画面隅の「クレジット」ボタンから開く一覧）。アプリ内の表示とこの節は、同じ出典（初音ミク・フォント・楽曲・AI生成物の不使用）を示す。この節には、読み手向けの補足の説明を加えている箇所がある。

### 初音ミク（ピアプロ・キャラクター・ライセンス）

- 本作はピアプロ・キャラクター・ライセンスに基づいて初音ミクモデルを制作しています。
- ライセンス: ピアプロ・キャラクター・ライセンス（https://piapro.jp/license/pcl/summary ）
- © Crypton Future Media, INC. www.piapro.net
- 本作はクリプトン・フューチャー・メディア株式会社のキャラクター利用ガイドラインに従います。
- モデルは VRoid Studio で人間が自作した二次創作モデルであり、AI が生成したものではありません。

### フォント

- Zen Kaku Gothic New（作者 Yoshimichi Ohira / Zenfonts）
- 配布元 Google Fonts（https://fonts.google.com/specimen/Zen+Kaku+Gothic+New ）
- SIL Open Font License 1.1（同梱したライセンス本文 `/fonts/zen-kaku-gothic-new-OFL.txt`）
- 遊べる全曲（5曲）の歌詞に現れる文字へサブセット化して同梱している。歌詞表示に用いる。
- M PLUS 1（作者 Coji Morishita / M+ FONTS Project）
- 配布元 Google Fonts（https://fonts.google.com/specimen/M+PLUS+1 ）
- SIL Open Font License 1.1（同梱したライセンス本文 `/fonts/m-plus-1-OFL.txt`）
- 画面UIの見出し・タイトルに用いる。UIに現れる見出しの文字へサブセット化して同梱している。

### 楽曲・歌詞

- こたえて（作者 imie さん） https://piapro.jp/t/6W2N/20251215164617
- アフター・ザ・カーテン（作者 Rulmry さん） https://piapro.jp/t/zoqO/20251214200738
- シャッターチャンス（作者 夜未アガリ さん） https://piapro.jp/t/PNpQ/20251209170719
- トリツクロジー（作者 鶴三 さん） https://piapro.jp/t/QBdL/20251215094303
- TAKEOVER（作者 Twinfield さん） https://piapro.jp/t/E2i3/20251215092113
- 課題曲は piapro.jp で公開されたマジカルミライ2026楽曲コンテストの楽曲であり、TextAlive App API を通じてロードする。

### 舞台土台の地形

- 舞台土台の地形は、国土地理院 地理院地図（3D機能の数値標高データ）を素材源とする。配布元 https://maps.gsi.go.jp/
- 国土地理院の数値標高データを加工して作成した地形メッシュである。素材は地理院地図の3D機能で取得し、地図画像のテクスチャは含めず標高の地形のみを用いる。実測標高の形式変換であり、AIが生成したものではない。
- 標高の地形は、地理院タイル一覧で基本測量成果以外の出典の記載のみで利用できる区分にあたり、出所の明示のみで測量法の承認申請なく利用できる。国土地理院コンテンツ利用規約が適用する公共データ利用規約（第1.0版）により、出典と加工した旨の記載を条件に再配布できる。国土地理院コンテンツ利用規約 https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html
- 地形は国土地理院が作成したものではない。

### AI 生成物について

- 本作品が表示する絵・音楽・文章に、AIが生成した素材は使用していません。視覚表現はすべてコードによる動的描画です。
