# マジカルミライ2026 プログラミング・コンテスト応募作品

TextAlive App API を使った、歌詞がリアルタイムに同期して動くリリックアプリです。テーマ「湖のソナーレ」を舞台に、キネティックタイポグラフィとタップ操作で湖を奏でるリリック・リズム作品を目指しています。

技術スタックは TypeScript・Vite・three.js・troika-three-text・Web Audio・TextAlive App API です。画面の枠組みを作るフレームワークは使いません。設計の確定版は `docs/decisions/architecture.md` を参照してください。

## 対応楽曲

課題曲6曲を登録済みです（URLパラメータ `?song=<key>` で切り替え）。

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

# .env ファイルを作成してトークンを設定（コミットしない）
echo "TEXT_ALIVE_API_TOKEN=<your_token>" > .env

# 開発サーバ起動（http://localhost:5173）
npm run dev

# 型検査（strict）。tsconfig.json と tsconfig.node.json を個別に検査する
npm run typecheck

# 静的ビルド（型検査を経て dist/ に出力）
# dist/ には本体に加え開発ツールの2ページ(analysis/prototype)も出力される。
# 開発ツールはアプリの利用者体験には含まれず本体から参照されない。
# 提出時に公開するページ構成は Issue #7(規約適合・提出)で確定する。
npm run build

# ビルド後のプレビュー
npm run preview
```

## ページ構成

| URL | 説明 |
|-----|------|
| `/` または `/index.html` | アプリ本体（リリックアプリ） |
| `/analysis.html?song=<key>` | 開発用: 楽曲データ解析ツール |
| `/prototype.html` | 開発用: 描画性能検証ツール |

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

## 動作環境

- Google Chrome / Edge 最新版（スマートフォン横持ちを主軸、パソコン対応）
- TextAlive ホストには接続不要（スタンドアロン動作）

## ライセンス・出典

- 楽曲・歌詞: 各作者様（piapro.jp）— マジカルミライ2026楽曲コンテスト受賞作品
- 本アプリに AI 生成の絵・音楽・文章は使用していません
