# 開発基盤・解析ツールの状態と注意点（2026-06-13 / 2026-06-18 Issue #1 で構成更新）

## TextAlive開発基盤（Issue #1 で TypeScript へ移行・ビルド/型検査成功）

**※2026-06-18 Issue #1 で構成を更新。アーキテクチャとディレクトリ構成の正典は `docs/decisions/architecture.md`、実装の復帰点は [[implementation_checkpoint_2026-06-18]]。旧JS試作は `docs/poc/` に凍結アーカイブ（参照専用・Vite入力ではない）。**

- TypeScript + Vite + textalive-app-api@0.4.0（**0.5系は存在しない**）。three@0.184 + troika-three-text@0.52（型非同梱のため `@types/three` と `src/types/troika-three-text.d.ts` で補う）。
- コマンド: `npm run dev` / `npm run typecheck`（厳格・`tsc -p tsconfig.json && tsc -p tsconfig.node.json`）/ `npm run build`（型検査を経てビルド）。
- `vite.config.ts`: ルート `.env` の `TEXT_ALIVE_API_TOKEN` を `import.meta.env.VITE_TEXTALIVE_TOKEN` に注入（.envはgit-ignored、コミット厳禁）。マルチページ入力は本体・解析・性能検証の3つ。
- `src/config/songs.ts`: 6曲のバージョン固定URL+音楽地図ID（support-page.md と照合済み）。既定曲は TAKEOVER。
- 本体入口 `index.html` + `src/main.ts`（Issue #1 ではプレースホルダ表示のみ）。
- 楽曲データ解析ツール `analysis.html` + `src/tools/analysis/main.ts`（`?song=key`）。描画性能検証ツール `prototype.html` + `src/tools/perf/main.ts`。
- `scripts/dump-songmap.mjs`: Playwright(導入済み)でsongmap JSONを自動取得。devサーバを5173で起動後 `node scripts/dump-songmap.mjs`（接続先は5173固定）。
- `scripts/prototype-fps.mjs`: 描画性能を計測。既定接続先が5174のため `BASE=http://localhost:5173` を明示して実行する。
- 既存スクリプトの契約（解析ツールの `window.__songMap`・`DUMP_READY`・`#status`、性能検証ツールの `window.__fps` 系とクエリ値）は移行後も維持。

## 既知のバグと修正済み事項（重要）

1. **TextAliveのlinked list横断バグ（修正済み）**: `word.next`/`char.next` は**フレーズ境界を越えて曲全体を辿る**。フレーズ内の子要素は必ず `phrase.children` / `word.children` 配列で辿ること。nextで辿ると46フレーズ×全単語の重複でJSONが175MBに膨張し、stringify+DOM描画でページがフリーズする（TAKEOVERダンプのタイムアウト原因だった）
2. **巨大JSONのDOM描画禁止**: analyze.jsはプレビュー10万文字に制限済み
3. `IRepetitiveSegment` に `isChorus` フラグは無い。`player.getChoruses()` / `getBeats()` / `getChords()` の配列APIを使う（`video.firstBeat` 等は存在しない）

## music-analysis MCP（librosa）の注意点

- **AAC/mp4を直接 `load` するとaudioreadフォールバックで15分以上スタックする**。必ず `ffmpeg -i in -ac 1 -ar 22050 out.wav` でWAV変換してから渡す
- 出力CSVパスは `<stem>_y.csv` 固定。スライスロードが全体ロードを上書きする
- `tempo` はstart_bpm事前分布に敏感（117↔172の別解）。`beat_track` のビート間隔中央値で裏取りする
- 課題曲の正確なビートはTextAlive songmapが正典。librosaはYouTube参考曲の特徴把握用

## 追加解析機能（2026-06-13）

- `src/analyze.js` に **amplitudeCurve**（声量カーブ200ms刻み）と **vaCurve**（感情値1000ms刻み）のダンプを追加済み。`node scripts/dump-songmap.mjs takeover` で再取得可
- ボルテージ解析（見せ場マップ算出）: 平滑化声量0.65＋文字密度0.35の合成指標、p80閾値・3秒ギャップ統合・4秒以上。TAKEOVER見せ場マップv1は `docs/idea/brainstorm-roadmap.md` STEP 6 に記録

## 素材ファイル

- `docs/song/*.mp3`: TAKEOVER / シャッターチャンス / 世界最後の音楽隊（解析済み）。**メンタルチェンソー.mp3 は0バイトの壊れファイル**（要再取得）
- `docs/idea/DXW0aT6FKSlkqBq2.mp4`: テキスト表現リファレンス（解析済み）。_MBvQZsTPKONt09X.mp4 は未解析
- claude-video-vision: whisper未導入のため映像解析は `skip_audio:true` / transcription無しで使う（歌詞は既知なので不要）
