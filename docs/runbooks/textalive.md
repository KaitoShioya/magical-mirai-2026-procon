# Runbook: TextAlive App API

リリックアプリの中核ライブラリ。楽曲再生＋歌詞・音楽地図の同期取得。本プロジェクトの正典ロード情報は `docs/support-page.md`、API詳細は `docs/textalive-api-refs/*.md`（Grepで該当クラス検索）。本書はセッションで実証した実用知の要約。

---

## 1. 利用方法（セットアップ〜再生）

### 依存とバージョン（重要）
- npm: `textalive-app-api@0.4.0`（**`^0.5.x` は存在しない**。指定するとinstall失敗）
- 実行時: クライアント v0.10.0 がサーバ v0.10.1 に接続（ログに出る、正常）
- ビルド: Vite。トークンは `.env` の `TEXT_ALIVE_API_TOKEN` を `vite.config.js` の `loadEnv`+`define` で `import.meta.env.VITE_TEXTALIVE_TOKEN` に注入

### 最小初期化
```js
import { Player } from "textalive-app-api";

const player = new Player({
  app: { token: import.meta.env.VITE_TEXTALIVE_TOKEN },
  mediaElement: document.querySelector("#audio-media"), // <div> or <audio>
  valenceArousalEnabled: true,   // 感情値を使うなら必須（初期化時のみ）
  vocalAmplitudeEnabled: true,   // 声量を使うなら必須（初期化時のみ）
});
```

### 楽曲ロード（音楽地図ID固定が必須）
```js
player.addListener({
  onAppReady(app) {
    if (!app.managed) {                 // 自前ホスト時は managed=false
      player.createFromSongUrl("https://piapro.jp/t/E2i3/20251215092113", {
        video: {                        // 音楽地図ID（support-page.md から一字一句転記）
          beatId: 4827298, chordId: 2963759, repetitiveSegmentId: 3086266,
          lyricId: 126533, lyricDiffId: 28631,
        },
      });
    }
  },
});
```
- 楽曲URLは `https://piapro.jp/t/ID/バージョン番号` 形式（短縮URL不可）。バージョン番号と `video:` のID群で歌詞タイミング/サビが固定される
- 「こたえて」はコーラス重複あり → `6W2N_chorus_timings.jsonc` 参照（support-page.md）

---

## 2. 機能リファレンス（よく使うAPI）

### ライフサイクル（リスナー）
| イベント | タイミング | 主な用途 |
|---|---|---|
| `onAppReady(app)` | ホスト接続確立 | `app.managed===false` で `createFromSongUrl` |
| `onVideoReady(v)` | 楽曲・歌詞ロード完了 | 各unitに `animate` 関数割当 |
| `onTimerReady()` | 再生タイマー準備完了 | UI有効化、`player.video.duration` 取得可 |
| `onTimeUpdate(pos)` | 再生位置更新（約 `player.wait` ms毎） | シークバー・描画更新 |
| `onPlay/onPause/onStop` | 再生状態遷移 | ボタン表示更新 |
| `onAppLoad(_app, error)` | ロード結果 | `error` でエラーハンドリング |

### 再生制御
- `player.requestPlay()` / `requestPause()` / `requestStop()` / `requestMediaSeek(ms)`
- `player.isPlaying`（真偽）、`player.video.duration`（ms）、`player.timer.position`（現在位置ms, rAF参照用）

### 歌詞（linked list と children 配列）
- ルート: `player.video.firstPhrase` / `firstWord` / `firstChar`
- **横断は2系統**: `unit.next`（同種を曲全体で連結）と `unit.children`（親内の子配列）
- IPhrase/IWord/IChar 共通: `startTime` `endTime` `text` `duration` `contains(now)` `progress(now)` `parent` `children`
- IWord 固有: `pos`（品詞）
- 発声判定 `unit.contains(now)`、進行度 `unit.progress(now)`（0〜1、`Ease.*` と併用）

### 音楽地図（配列API）
- `player.getBeats()` → IBeat[]（`position`=小節内拍位置, `length`=拍子, `index`, `startTime`, `endTime`, `duration`）
- `player.getChords()` → IChord[]（`name`, `index`, `startTime`, `endTime`, `duration`）
- `player.getChoruses()` → IRepetitiveSegment[]（サビ区間。返るものは全てサビ）
- 時刻検索: `player.findBeat(ms)` / `findChorus(ms)` / `findBeatChange(last, now)`（rAF内の区間トリガ向き）

### 感情値・声量（初期化で有効化済みのとき）
- `player.getValenceArousal(ms)` → `{ v, a }`（感情価/覚醒度）
- `player.getVocalAmplitude(ms)` → number（声量。曲ごとにスケール差大）

### 描画ループ
- `animate` 割当: `onVideoReady` で `phrase.animate = fn`。`fn(now, unit)` が毎フレーム呼ばれる
- 自前rAF（p5/Canvas/three.js/PixiJS）は `player.timer.position` を時刻源にする。更新間隔の目安は `player.wait`

---

## 3. 機能詳細（落とし穴と確定知見）

### ⚠ linked list 横断バグ（最重要）
`word.next` / `char.next` は**フレーズ境界を越えて曲全体を辿る**。フレーズ内の単語/文字を列挙する目的で `next` を使うと、各フレーズに後続の全単語が重複して入り、データが爆発する（本プロジェクトで songmap JSON が **175MB** に膨張しダンプがフリーズ／タイムアウトした）。
- **フレーズ内の子は必ず `phrase.children` / `word.children` 配列で辿る**
```js
const words = phrase.children.map(w => ({
  text: w.text, pos: w.pos, startTime: w.startTime, endTime: w.endTime,
  chars: w.children.map(c => ({ text: c.text, startTime: c.startTime, endTime: c.endTime })),
}));
```
- 「同種を曲全体で順に処理」したいときだけ `firstPhrase`＋`.next` ループは正しい（main.js の animate 割当はこの用途）

### 存在しないAPIに注意
- `video.firstBeat` / `firstChord` / `firstRepetitiveSegment` は**無い** → 配列API（`getBeats/getChords/getChoruses`）を使う
- `IRepetitiveSegment` に `isChorus` フラグは**無い**（`getChoruses()` の戻りは全てサビ扱い）

### songmap ダンプ運用（解析基盤）
- `analysis.html` + `src/analyze.js`: ロード後 `window.__songMap` に格納し `document.title="DUMP_READY"` で完了通知
- 巨大JSONを `<pre>` にそのまま入れるとフリーズ → **プレビューは10万文字に制限**
- `scripts/dump-songmap.mjs`（Playwright headless）: devサーバ起動後 `node scripts/dump-songmap.mjs <key>`（key省略で3曲）
- 出力: `docs/analysis/<key>.songmap.json`（beats/chords/segments/phrases/maxVocalAmplitude/valenceArousal/amplitudeCurve(200ms)/vaCurve(1000ms)）

---

## 4. トラブルシューティング

| 症状 | 原因 | 対処 |
|---|---|---|
| `npm install` で textalive-app-api が解決不能 | `^0.5.x` 指定（存在しない） | `^0.4.0` に修正 |
| songmapダンプがタイムアウト/フリーズ | `next` 横断によるデータ爆発（175MB） | `children` で辿る。DOM描画を制限 |
| `firstBeat is not a function` 等 | 存在しないAPI参照 | `getBeats()/getChords()/getChoruses()` 配列APIへ |
| 歌詞タイミング/サビがプレイ毎にズレる | 音楽地図ID未固定 or バージョン番号無しURL | `video:{...}` のID群＋版番号付きURLを固定 |
| `getVocalAmplitude`/`getValenceArousal` が常に0/null | 初期化で `*Enabled` 未設定 | Player生成時に `valenceArousalEnabled`/`vocalAmplitudeEnabled` |
| ヘッドレスダンプで `The play() request was interrupted by a call to pause()` | 自動再生抑制の無害な pageerror | ダンプ目的なら無視可（`onTimerReady` 後にダンプ実行） |
| トークンが `undefined` | `.env` 未読込 or キー名違い | `vite.config.js` の `loadEnv`+`define`、`.env` の `TEXT_ALIVE_API_TOKEN` を確認 |

### 関連
- 正典ロード情報: `docs/support-page.md` / API個別: `docs/textalive-api-refs/<Class>_textalive-app-api.md`（Grep検索）/ ライフサイクル詳細: `docs/tutorial/04-lifecycle-of-app.md`（740KB・Grep節抽出）
