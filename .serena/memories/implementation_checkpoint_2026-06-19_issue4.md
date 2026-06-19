# 実装チェックポイント（2026-06-19・Issue #4）

**状態: Issue #4（TextAlive統合エンジン昇格＋ロード失敗導線）の実装を完了し、ブランチ `feat/issue-4-textalive-integration` で PR #114 を作成・push 済み。検証CI（Verify）にトークンを注入し、両ジョブとも緑。マージ前。**
**用途**: セッション喪失時の復帰点（実装フェーズ）。前段は [[implementation_checkpoint_2026-06-18_issue3]]、その前は [[implementation_checkpoint_2026-06-18_issue2]] と [[implementation_checkpoint_2026-06-18_issue7]] と [[implementation_checkpoint_2026-06-18_issue6]] と [[implementation_checkpoint_2026-06-18]]、設計正典は [[phase2_design_checkpoint_2026-06-14]]、実行計画は [[dev_planning_checkpoint_2026-06-14]]、開発基盤の現状は [[dev_infrastructure_notes]]。

## 最重要の意思決定

- **再生抽象 `Playback` を `src/textalive` に置き、engine は `TimeSource` だけを見る**。textalive は `tools` を import せず、判定・得点の論理を持たない（時刻と再生状態を値として供給するのみ）。依存規則の出典 `docs/decisions/architecture.md` §5。
- **再生開始はウォームアップ→プレイ遷移時**（正典 `docs/decisions/app-overall-decisions.md` §3.8。TAKEOVERは0秒開始でウォームアップは楽曲前の準備区間）。統括が画面遷移要求を包み、プレイ遷移成立後に先頭から再生開始する。
- **タブ離脱時の楽曲停止・再開は `loop.onPause`/`onResume` に結ぶ**（接合点は Issue #3 が用意。`src/engine/loop.ts`）。プレイ進行中だけ `requestPause`/`requestPlay` を呼ぶ。題名やウォームアップでのタブ復帰で再生を始めないため。再開時の3-2-1カウントインは設けない暫定挙動で、Issue #112 が差し替える。
- **ローディング・ロード失敗・「触れて再生」は画面状態を増やさず `document.body` 直下のオーバーレイで表す**。理由は、状態機械が画面表示領域（`screen-root`）の配下を毎遷移で置換するため、その内側に置くと消えるから。確定（`onTimerReady`）までは画面表示領域に `inert` 属性を付け、ポインタだけでなくキーボード操作や焦点移動も抑止する。
- **トークン未設定（undefined または空文字）は API 呼び出し前に設定エラー**（再試行ボタンを出さず設定案内）。**読み込み失敗は同一プレイヤーで再試行**。再試行は「読み込み失敗の状態のときだけ」始める不変条件にし、読み込みを同時に1つだけ進行させる。これにより、試行を識別する引数を持たないライフサイクル用コールバックの遅延通知が新しい試行へ混ざる経路を、「読み込み中のときだけ反映」ガードと合わせて断つ。
- **楽曲終了の検知**: 主条件「再生位置 ≥ 楽曲長 − 余白」、補助条件「再生開始後の停止イベントかつ再生位置が楽曲長近傍」。専用の終了イベントが無く、`onStop` は汎用の停止イベントのため。二重遷移は統括の進行フラグで一度だけに抑える。
- **診断モード（`?smoke=1`）はトークン非依存の擬似再生を用いる**。スモーク検証をトークン無しで決定的に通すため。実プレイヤーと擬似再生は同じ `Playback` 契約を満たす。

## Issue #4 で実装した内容（PR #114 / ブランチ feat/issue-4-textalive-integration）

- `src/textalive/`（新規）
  - `playback.ts`: 再生抽象 `Playback` の型と純粋ロジック。`createReadyGatedTimeSource`（読み取り口と確定判定から `TimeSource` を作る）、`isSongEnded`（終了判定）、`createLoadStateMachine`（読み込み状態の遷移。`beginAttempt`＝最初の読み込み、`beginRetryAttempt`＝読み込み失敗のときだけ新試行、`markReady`/`markLoadError`＝読み込み中のときだけ反映、`isLatestAttempt`、`markConfigError`）。終了の定数を所有。
  - `textAlivePlayback.ts`: 実プレイヤーの結線。生成、`onAppReady`→`createFromSongUrl`、`onTimerReady`/`onPlay`/`onStop`/`onAppLoad`、`beginFromStart`（先頭シーク＋再生）、`pause`/`play`、`retry`、`primeAudioPermission`（題名の操作中に再生許可を確立する最善努力）、`dispose`。トークンは `string | undefined` で受け、未設定は設定エラー。
  - `fakePlayback.ts`: 診断用の決定的な擬似再生（`performance.now` 基準、楽曲長は短い固定値）。
  - `index.ts`: 公開窓口。
  - `playback.test.ts`: 純粋ロジックの単体検証。
- `src/app/`（改修）
  - `index.ts`: 仮の時間源を `Playback` に差し替え。オーバーレイ購読・確定前の `inert`、`onPause`/`onResume` をプレイ進行中だけ結線、画面遷移要求の包み込みでプレイ遷移成立後に `beginFromStart`、毎フレームの楽曲終了観測でプレイ→結果、再生開始の成立確認で「触れて再生」、後始末で `inert` を外す。
  - `overlay.ts`（新規）: ローディング・エラー（設定／読み込みの出し分け）・「触れて再生」の生成・更新・除去。
- `src/screens/playScreen.ts`（改修）: 暫定の「結果へ」ボタンを撤去（プレイ→結果は統括の楽曲終了検知が起こす）。
- `index.html`（改修）: 音声配置先 `#audio-media` を `#app` の外（`body` 直下）に追加。
- `src/style.css`（改修）: オーバーレイの体裁と音声配置先の非表示。
- `scripts/screens-smoke.mjs`（改修）: 撤去したボタンのクリックをやめ、楽曲終了の自動遷移を待つ形へ。
- `.github/workflows/ci.yml`（改修）: 2つのビルド手順に `TEXT_ALIVE_API_TOKEN`（既存シークレット）を注入し、検証を本番のトークン注入経路と一致させる。

## 採用した数値とその理由（すべて理由を先に述べる）

- 楽曲終了の主条件の余白 = 120ミリ秒: 再生位置は毎フレーム離散標本化され末尾で楽曲長へ厳密到達せず数十ミリ秒手前で更新が止まり得るため、再生位置更新の間隔（約50ミリ秒）の2回ぶんを余白にする。★暫定。
- 楽曲終了の補助条件（停止イベント）の許容 = 1000ミリ秒: 自然終了時に再生位置が楽曲長より手前で更新を止める場合があるため、停止が楽曲長から1秒以内のときだけ自然終了とみなす。明らかに途中の停止を除外しつつ末尾近傍を拾う区切り。★暫定。
- 再生開始の成立を待つ上限 = 400ミリ秒: 再生開始の通知は再生位置更新の間隔（約50ミリ秒）に依存するため、その数回ぶんを超え、操作の反応が遅く感じない範囲とする。超えたら「触れて再生」を出す（スマートフォンの自動再生制約への対応）。★暫定。
- 診断用擬似再生の楽曲長 = 800ミリ秒: スモークのフレーム率下限（毎秒5フレーム）でも数フレームで終了へ到達し、終了の余白より十分に長い値。再生位置は実時間で進むため再生開始からおよそ680ミリ秒で終了。

## レビューと修正（事実）

- 計画段階で Codex のレビューを3回受け、自動再生制約の内包（「触れて再生」フォールバック）、オーバーレイの `document.body` 直下配置、`onStop` を楽曲長近傍のときだけ補助に使う、再試行の試行番号、遷移順序と失敗処理、`onResume` と `forceResync` の順序整合、トークン未設定と読み込み失敗の出し分け、終了余白の定数化を計画へ反映。
- 実装後の Codex レビューで中2件・低1件を修正。`beginRetryAttempt` で「読み込み失敗のときだけ再試行」する不変条件を導入し、ライフサイクル通知の取り違えと多重ロードを断つ。確定前の `inert` 化。続く低1件で `dispose` の `inert` 後始末を追加。最終判定「コミット可」。
- CI 失敗（`Cannot read properties of undefined (reading 'trim')`）を修正。トークン未注入ビルドでは `import.meta.env.VITE_TEXTALIVE_TOKEN` が undefined になるため、`token` を `string | undefined` で受け undefined を設定エラーにした。あわせて検証CIに既存シークレットのトークンを注入。

## 検証結果（事実）

- `npm run typecheck`（厳格・両設定）: 型エラーなし。
- `npm run test`（vitest）: 47テスト全通過（うち再生抽象の純粋ロジック検証を新規追加）。
- `npm run build`（Node 22）: 成功。
- `npm run smoke`（画面遷移・配信プレビュー）: トークン無しビルドとトークン有りビルドの両方で成功（5状態走破・単一画面・通常構成で診断アクセサ未公開）。`engine-loop-smoke` も成功。
- PR #114 の検証CI（GitHub Actions）: トークン注入後、両ジョブとも pass。
- ローカルの Node 24 系では `vite build` が異常終了（exit 127）する既知の環境問題があるため、Node 22 系で実施。CI は `.nvmrc`=22 で実行される。

## 次の主要作業

1. PR #114 のレビュー・マージ。
2. Issue #5（6曲ロード設定の拡張・未実装曲の無効化）。本実装は既定曲 TAKEOVER の単一ロードに限るため、曲選択UIと無効化を追加する。
3. Issue #112（プレイ中の一時停止オーバーレイ・再開3-2-1カウントイン）。本実装の `onPause`/`onResume` 接合点と再生制御を土台に結ぶ。
4. 解析先行のゲート（マイルストーンM1）: #34（スキーマ定義）→ #46（TAKEOVERプロファイル）→ #96（スキーマ検証ゲート）。
