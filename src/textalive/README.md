# textalive — TextAlive 連携

- **責務**: TextAlive Player の生成、ライフサイクル（onAppReady→onVideoReady→onTimerReady→onTimeUpdate）の配線、楽曲ロード失敗時のユーザー導線。加えて、歌詞構造から歌詞タイムライン（フレーズ・単語・文字の番号と時刻と文字列を持つ平易なデータ）を構築して供給する（`lyricsTimeline.ts`）。
- **禁止依存**: `tools` を import しない。判定・得点・可読性の論理を持たない（時刻は値として供給するのみ）。
- **担当Issue**: #4、歌詞タイムライン橋渡しは #133。
- **歌詞タイムラインの結線の入口**: 本編結線（#59）が onVideoReady の後に `buildLyricsTimeline(player.video)` を呼んで構築する。再生抽象 `Playback` は時間源と状態のみを公開するため、歌詞データはこの関数で別に供給する。
- 詳細は `docs/decisions/architecture.md` を参照する。
