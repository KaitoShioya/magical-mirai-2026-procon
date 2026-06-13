# マジカルミライ2026 プログラミング・コンテスト応募作品

TextAlive App API を使った、歌詞がリアルタイムに同期して動くリリックアプリです。

## 対応楽曲

課題曲6曲すべてをロード可能です（URLパラメータ `?song=<key>` で切り替え）。

| key | 曲名 | アーティスト |
|-----|------|-------------|
| `kotaete` | こたえて | imie |
| `after-the-curtain` | アフター・ザ・カーテン | Rulmry |
| `shutter-chance` *(デフォルト)* | シャッターチャンス | 夜未アガリ |
| `sekai-saigo` | 世界最後の音楽隊 | 夏山よつぎ×ど～ぱみん |
| `toritsuku-logy` | トリツクロジー | 鶴三 |
| `takeover` | TAKEOVER | Twinfield |

## セットアップ

### 必要なもの
- Node.js 18 以上
- TextAlive アプリトークン（[developer.textalive.jp/profile](https://developer.textalive.jp/profile) で取得）

### 手順

```bash
# 依存関係のインストール
npm install

# .env ファイルを作成してトークンを設定
echo "TEXT_ALIVE_API_TOKEN=<your_token>" > .env

# 開発サーバ起動
npm run dev
# → http://localhost:5173 で動作

# 静的ビルド（提出物）
npm run build
# → dist/ 以下に出力される

# ビルド後のプレビュー
npm run preview
```

## ページ構成

| URL | 説明 |
|-----|------|
| `/` または `/index.html` | メインのリリックアプリ |
| `/analysis.html?song=<key>` | 楽曲データダンプツール（開発用） |

## 動作環境

- Google Chrome / Edge 最新版（デスクトップ）
- TextAlive ホストには接続不要（スタンドアロン動作）

## 技術スタック

- [TextAlive App API](https://developer.textalive.jp/) — 歌詞・音楽地図同期
- [Vite](https://vitejs.dev/) — ビルドツール

## ライセンス・出典

- 楽曲・歌詞: 各作者様（piapro.jp）— マジカルミライ2026楽曲コンテスト受賞作品
- 本アプリに AI 生成の絵・音楽・文章は使用していません
