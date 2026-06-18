# engine — 曲非依存の中核

- **責務**: 固定時間刻みのループ（loop）、楽曲再生位置を平滑化・単調化・ずれ補正した時計（clock）、目標ゲーム時刻まで固定刻みで進めるスケジューラ（scheduler）、進行中のシミュレーション状態（world）。曲に依存しない。
- **禁止依存**: `profiles` を import しない（曲固有の内容は引数または読込済みデータとして外から受け取る）。`tools` を import しない。`screens`・`three`・`textalive-app-api` も import しない（時間源は `TimeSource` 接合面で受け取る）。
- **担当Issue**: #3
- 内部構成:
  - `timeSource.ts` — 時間源の接合面（`TimeSource`）。TextAlive 統合（#4）が `player.timer.position` を供給する継ぎ目。本Issueは型のみ。
  - `clock.ts` — 再生位置を平滑化・単調化・ずれ補正してゲームの時計を出す純粋ロジック。
  - `scheduler.ts` — 最終処理時刻を保持し、目標ゲーム時刻まで固定刻みで進める純粋ロジック。各刻みに絶対ゲーム時刻を渡す。
  - `world.ts` — 進行中シミュレーション状態の最小実体（ゲーム時刻・刻み回数）。将来 chart/scoring が状態を足す接合点。下流の時刻源は `gameTimeMs`、`stepCount` は診断専用。
  - `loop.ts` — 毎フレーム判定 `advanceFrame`（描画合図にもタブ表示イベントにも依存しない）と、環境層で `advanceFrame` を駆動する薄い結線 `createLoop`。
  - `environment.ts` — 環境層 `Environment`（描画合図とタブ表示状態）の型と既定のブラウザ実装。検証で差し替え可能。
  - `constants.ts` — engine 固有の調整定数（固定時間刻み・クランプ上限・再同期閾値・平滑化係数・停止中再同期閾値・最大刻み回数）。
- 時刻の二系統（`docs/decisions/architecture.md` §6）: ゲームの時計はこの engine が持つ。操作音の時計 `AudioContext.currentTime` は別系統（Issue #52）であり engine は関与しない。
- 一時停止（Issue #112）: 「楽曲の停止（`TimeSource.isPlaying` が偽。時計据え置き）」と「描画ループの停止（タブ非表示）」を分ける。loop は `onPause`/`onResume` 接合点を外へ出し、楽曲の停止・再開指示は外部（#4・#112）が結ぶ。
