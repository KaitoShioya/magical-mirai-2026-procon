# CLAUDE.md

## Purpose
マジカルミライ2026 プログラミング・コンテスト応募作品。**TextAlive App API** で課題曲に歌詞が同期して動く**静的Webアプリ（リリックアプリ）**を実装する。締切 2026-06-29 正午JST。審査軸: クリエイティビティ / イノベーション / 完成度。

## Repo Map
- `CLAUDE.md` — 本ファイル（最初に読む）。
- `docs/concept.md` — 公式サイト全文（概要・応募のきまり・対象楽曲6曲・FAQ）。**規約はこれを正とする**。
- `docs/rule.md` — 応募のきまり（concept.md の抜粋。重複）。
- `docs/support-page.md` — **楽曲ロードの正典**。6曲のバージョン固定URL + 音楽地図ID（beatId/chordId/repetitiveSegmentId/lyricId/lyricDiffId）入り `createFromSongUrl`、「こたえて」コーラス補正 jsonc、トークン入手先。実装はまずここを写経。
- `docs/01〜03,05-*.md` — TextAlive入門（番号順=学習順）: 01初期化 / 02楽曲・歌詞情報＋音楽地図固定Tips / 03アニメーション / 05サンプル。
- `docs/04-lifecycle-of-app.md` — ライフサイクル詳細。**740KB（base64画像埋込）。全読み禁止 → `Grep`で節抽出**（onAppReady/onVideoReady/onTimerReady/再生状態/onAppParameterUpdate）。
- `docs/musics/*.md` — 課題曲6曲の歌詞本文＋piapro基URL。曲を扱う時だけ該当1ファイルRead（**ロードID は support-page.md 側**）。
- `docs/textalive-api-refs/*.md` — API約90本（1クラス1ファイル）。`textalive-app-api.md` が目次。**全読み禁止 → `Grep`でクラス名検索 → 該当ファイルRead**（例: Player, IPhrase, IWord, IChar, Ease, Color）。
- `.env` — アプリトークン。**コミット禁止**。
- (未作成) `src/`, `index.html`, `package.json`, `README.md` — 実装はここに作る。

## Rules & Commands

### MUST
- TextAlive App API使用。静的HTML/CSS/JSのみ（サーバ処理不可）。課題曲6曲中1曲以上をロード。
- 楽曲は `https://piapro.jp/t/ID/バージョン番号` 形式 ＋ `video:` に音楽地図ID固定で読込（support-page.md）。短縮URL不可。「こたえて」はコーラス重複 → 専用jsonc参照。
- アプリトークン必須（developer.textalive.jp/profile、`.env`）。素材は自作/適正ライセンス（Piaproキャラ可・出典をアプリ内に明示）。
- 難読化禁止・読みやすい構成。ビルド/実行手順をREADMEに記載。

### MUST NOT
- **表示する絵/音楽/文章にAI生成物を使わない**（コードのAI生成・補助は可、翻訳は例外可）。
- 2026-06-29 正午(JST) 提出後、結果発表まで**コード更新しない**（違反=審査対象外）。
- `.env`・トークンをコミットしない。業務由来コードの流用禁止。

### Workflow
- 方針は `concept.md`（規約）と `support-page.md`（楽曲ロード/Tips）に常時照合。
- ライフサイクル: `onAppReady`(曲ロード) → `onVideoReady`(歌詞unitに`animate`割当) → `onTimerReady` → `onTimeUpdate`。
- 歌詞: `video.firstChar/firstWord/firstPhrase`（linked list: `startTime/endTime/text/next`、単語は`pos`品詞）。発声判定 `unit.contains(now)` / 進行度 `unit.progress(now)` ＋ `Ease.*`。
- 同期演出: `player.findBeat`/`findChorus`(サビ)、時区間API `findBeatChange(last,now)`（rAF内パーティクル向き）。感情値/声量は初期化に `valenceArousalEnabled`/`vocalAmplitudeEnabled` → `getValenceArousal`/`getVocalAmplitude`。
- 描画ループ: `animate`間隔=`player.wait`。p5/Canvas/three.js等は `player.timer.position` を rAF 参照（three.js / PixiJS / p5.js 併用可）。

### Commands
```sh
npm install            # textalive-app-api, axios ほか
npm run dev            # ローカル開発サーバ(Vite/Parcel等)
npm run build          # 静的ビルド(提出物)
```
> ビルドツール導入後に scripts 確定。提出: private GitHub repo → `magicalmirai-procon` 共有 ＋ 応募フォーム。
