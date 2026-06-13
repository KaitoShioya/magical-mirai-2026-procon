# CLAUDE.md

## Purpose
マジカルミライ2026 プログラミング・コンテスト応募作品。**TextAlive App API** で課題曲に歌詞が同期して動く**静的Webアプリ（リリックアプリ）**を実装する。締切 2026-06-29 正午JST。審査軸: クリエイティビティ / イノベーション / 完成度。

**確定コンセプト（フェーズ①ブレスト完了済み・正典は `docs/idea/concept-final.md`）**: マジカルミライ2026テーマ「湖のソナーレ」を舞台に、疾走するキネティックタイポと「ハメ（タイミング×Y軸音程×X軸色）」で湖を奏でるリリック・リズム作品。目的関数=ポートフォリオ×多様性逓減×一回性。成果物=スコア/ランク/造形を統合した「あなたが奏でた湖」静止画。**1曲目=TAKEOVER**（縦切り先行→世界最後の音楽隊・シャッターチャンスへ拡張）。

## Repo Map
- `CLAUDE.md` — 本ファイル（最初に読む）。
- **`docs/idea/concept-final.md`** — **作品コンセプトの正典**（フェーズ①確定版）。仕様判断はこれを正とする。
- `docs/idea/brainstorm-roadmap.md` — ブレスト全記録（凍結・経緯/意思決定の出典）。`docs/refs/` は発散副資料・参考演出解析。
- `.serena/memories/` — セッション横断のチェックポイント（`brainstorm_checkpoint_2026-06-13.md` が復帰点）。
- `docs/concept.md` — 公式サイト全文（概要・応募のきまり・対象楽曲6曲・FAQ）。**規約はこれを正とする**。`docs/rule.md` は抜粋。
- `docs/support-page.md` — **楽曲ロードの正典**。6曲のバージョン固定URL + 音楽地図ID（beatId/chordId/repetitiveSegmentId/lyricId/lyricDiffId）入り `createFromSongUrl`、「こたえて」コーラス補正 jsonc、トークン入手先。
- `docs/tutorial/01〜03,05-*.md` — TextAlive入門（番号順=学習順）: 01初期化 / 02楽曲・歌詞情報＋音楽地図固定Tips / 03アニメーション / 05サンプル。
- `docs/tutorial/04-lifecycle-of-app.md` — ライフサイクル詳細。**740KB（base64画像埋込）。全読み禁止 → `Grep`で節抽出**。
- `docs/musics/*.md` — 課題曲6曲の歌詞本文＋piapro基URL（**ロードID は support-page.md 側**）。
- `docs/textalive-api-refs/*.md` — API約90本（1クラス1ファイル）。`textalive-app-api.md` が目次。**全読み禁止 → `Grep`でクラス名検索 → 該当ファイルRead**。
- `docs/analysis/*.songmap.json` — TextAlive音楽地図ダンプ（beats/chords/segments/phrases/amplitudeCurve/vaCurve）。曲プロファイル生成の入力。`song-insights.md`=曲構造比較。
- `docs/research/` — フェーズ②技術調査（`research-roadmap.md` が進行表）。
- `docs/runbooks/*.md` — ツール再利用リファレンス（利用方法/機能/詳細/トラブルシュート）: `textalive.md` / `mcp-music-analysis.md` / `claude-video-vision.md`。
- `src/`, `index.html`, `analysis.html`, `vite.config.js`, `scripts/dump-songmap.mjs` — 実装と解析ツール。
- `.env` — アプリトークン。**コミット禁止**。

## Rules & Commands

### MUST
- TextAlive App API使用。**静的HTML/CSS/JSのみ**（サーバ処理不可・自前バックエンドAPI不可）。課題曲6曲中1曲以上をロード。
- 楽曲は `https://piapro.jp/t/ID/バージョン番号` 形式 ＋ `video:` に音楽地図ID固定で読込（support-page.md）。短縮URL不可。「こたえて」はコーラス重複 → 専用jsonc参照。
- アプリトークン必須（developer.textalive.jp/profile、`.env`）。素材は自作/適正ライセンス（Piaproキャラ可・出典をアプリ内に明示）。
- 難読化禁止・読みやすい構成。ビルド/実行手順をREADMEに記載。動作環境を応募フォームに明記（スマホ主軸+PC対応想定）。

### MUST NOT
- **表示する絵/音楽/文章にAI生成物を使わない**。境界線=「**素材をAIが生成しているか**」。
  - **不可**: AIが完成品として作ったアセット（画像/SVG/イラスト/音源）をプログラムに組み込んで表示。
  - **可**: プログラミングによる動的表現の生成（コード描画・アルゴリズム演出）、コードのAI支援、翻訳。
  - 例: 蝶/ひまわり/白鳥/ミク等の造形も**コードによる動的描画なら可**。静的アセットを使うなら人間の自作 or 権利OK素材（出典明示）。AI生成モック（例 `play-screen-layers.svg`）は**設計資料限定でアプリに組み込まない**。
- **自分専用のAPIサーバー（バックエンド）を実装しない**（静的アプリ規定違反）。ランキングは内蔵水準カーブ/localStorage自己ベスト/成果物シェアで実現。
- **著作権メディアをコミット/提出物に含めない**: `docs/song/*.mp3`（課題曲）・`docs/idea/video/*.mp4`（参考動画）は**ローカル解析専用**。`.gitignore`済み。アプリはTextAlive API経由でロードするため不要。
- 2026-06-29 正午(JST) 提出後、結果発表まで**コード更新しない**（違反=審査対象外）。
- `.env`・トークンをコミットしない。業務由来コードの流用禁止。

### 開発ガイドライン（全担当共通）
- **正典の階層**: 規約=`concept.md` / 楽曲ロード=`support-page.md` / 作品仕様=`concept-final.md`。判断はこの3つに常時照合し、齟齬は正典を優先。
- **エンジン/曲プロファイル分離**: 共通エンジン（3層構造・2チャンネル操作・目的関数・スコア/ランク）と曲ごとのプロファイル（SE・色彩・生態系・JUSTパターン・見せ場マップ）を分離実装。縦切りでTAKEOVERを完成→3曲へ横展開。
- **データドリブン**: 見せ場・JUST音程・逓減区間は主観でなく解析（songmap+librosa）から生成し曲プロファイルJSONへ。
- **TextAlive linked list の罠**: フレーズ内の子は `phrase.children`/`word.children` で辿る。`word.next`/`char.next` はフレーズ境界を越え曲全体を辿るため重複爆発する（songmapダンプが175MB化した既知バグ）。
- **music-analysis MCP の罠**: AAC/mp4を直接 `load` するとスタック。必ず `ffmpeg -ac 1 -ar 22050` でWAV化してから渡す。`tempo` はstart_bpm依存→`beat_track`のビート間隔で裏取り。課題曲の正確なビートはTextAlive音楽地図が正典、librosaは参考曲解析用。
- **チェックポイント**: 重要な節目で `.serena/memories/` と `concept-final.md` を更新。リポジトリ外の永続メモリ（`~/.claude/.../memory/`）にも要点ポインタを残す。

### ファシリテーター・ルール（ブレスト/コンセプト/意思決定の場で必ず適用）
- **これはユーザーのブレストであり、Claudeはファシリテーターに徹する**。方針決定・アイデア採否・楽曲選定・コンセプト練り上げの**主体はユーザー**。Claudeは整理・言語化・分析・選択肢提示を担う。
- **ユーザーに回答を強要して意思決定を奪わない**。問いは自由回答の招待であり、答えるものはユーザーが選ぶ。`AskUserQuestion`の強制選択でユーザーの進路を縛らない。
- **ロードマップ型で進める**: ユーザーの回答を記録・反映 → 次の回答までのステップを進める。戻り/スキップ/並走は自由。各STEPの成果は進行表（`brainstorm-roadmap.md`等）に追記して蓄積。
- **アイデアは全部まとめ上げなくてよい**。見通しの悪いものは棄却可。ただし**棄却時もユーザーと議論を欠かさない**。
- **ユーザー発言を鏡映しして確認**してから次へ。Claudeの「推奨」「結論」は決定でなく**判断材料**として明示し、決定はユーザーの宣言で確定する。
- 解析・調査の委任を受けたら徹底的に行い、結果は判断材料＋推奨案として提示（採否はユーザー）。

### Commands
```sh
npm install                          # textalive-app-api, vite
npm run dev                          # ローカル開発サーバ(Vite)
npm run build                        # 静的ビルド(提出物)
node scripts/dump-songmap.mjs <key>  # 曲データ解析ダンプ(要 dev サーバ起動)。key省略で3曲
```
> 提出: private GitHub repo → `magicalmirai-procon` 共有 ＋ 応募フォーム。
