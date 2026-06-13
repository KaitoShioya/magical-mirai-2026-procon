# 楽曲データ (songMap) ダンプ手順

## 概要

`analysis.html` を使って TextAlive から楽曲の音楽地図データ (beats / chords / サビ区間 / 歌詞フレーズ) を JSON として取得できます。

## 自動取得（Playwright）

`playwright` npm パッケージをインストールして以下のスクリプトを実行します:

```bash
# 1. playwright を devDependency としてインストール
npm install -D playwright

# 2. Chromium ブラウザをダウンロード（初回のみ）
npx playwright install chromium

# 3. 開発サーバを起動（別ターミナル）
npm run dev

# 4. ダンプスクリプトを実行（デフォルト: 3曲）
node scripts/dump-songmap.mjs

# 特定の曲だけ実行する場合（song キーは src/songs.js を参照）
node scripts/dump-songmap.mjs shutter-chance
node scripts/dump-songmap.mjs shutter-chance takeover sekai-saigo
```

出力先: `docs/analysis/<key>.songmap.json`

### 利用可能な曲キー

| key | 曲名 | アーティスト |
|-----|------|-------------|
| `kotaete` | こたえて | imie |
| `after-the-curtain` | アフター・ザ・カーテン | Rulmry |
| `shutter-chance` | シャッターチャンス | 夜未アガリ |
| `sekai-saigo` | 世界最後の音楽隊 | 夏山よつぎ×ど～ぱみん |
| `toritsuku-logy` | トリツクロジー | 鶴三 |
| `takeover` | TAKEOVER | Twinfield |

## 手動取得（ブラウザで直接ダウンロード）

1. 開発サーバを起動: `npm run dev`
2. ブラウザで `http://localhost:5173/analysis.html?song=<key>` を開く
3. "完了" と表示されたら "JSON ダウンロード" ボタンをクリック
4. ダウンロードした JSON を `docs/analysis/<key>.songmap.json` に配置する

## songMap スキーマ

```json
{
  "song": {
    "name": "曲名",
    "artist": "アーティスト名",
    "key": "shutter-chance",
    "songUrl": "https://piapro.jp/t/PNpQ/20251209170719",
    "duration": 230000,
    "durationSec": 230.0
  },
  "beats": [
    { "index": 0, "position": 1, "startTime": 0, "endTime": 500, "length": 4, "duration": 500 }
  ],
  "chords": [
    { "index": 0, "name": "C", "startTime": 0, "endTime": 2000, "duration": 2000 }
  ],
  "segments": [
    { "index": 0, "startTime": 45000, "endTime": 75000, "duration": 30000, "isChorus": true }
  ],
  "phrases": [
    {
      "startTime": 5000, "endTime": 8000, "text": "フレーズ全体のテキスト",
      "words": [
        {
          "startTime": 5000, "endTime": 6000, "text": "単語",
          "pos": "名詞",
          "chars": [
            { "startTime": 5000, "endTime": 5500, "text": "単" }
          ]
        }
      ]
    }
  ],
  "maxVocalAmplitude": 0.85,
  "valenceArousal": {
    "median": { "valence": 0.3, "arousal": 0.7 }
  }
}
```
