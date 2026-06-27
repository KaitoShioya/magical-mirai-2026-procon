# 実装チェックポイント 2026-06-27 Issue #198「画面振動の縮小・サビ限定と音量バランス調整」

## 概要
実機フィードバックの3点を解消した調整チェックポイント（実機所見対応・M6/M7仕上げ）。画面振動を小さくしサビ（コーラス）区間だけに限定し、タップ操作音を大きく、楽曲音量を下げて音量バランスを整えた。新規ロジックは区間判定の純粋関数1つのみで、既存の描画・採点・音声の構造は変えていない。ブランチ `worktree-issue-198-shake-audio-balance`、PR #200（base=main）。

## 意思決定（ユーザー確定 2026-06-27）
- サビの定義はコーラス区間（曲プロファイルの `repetitiveSegments` のうち `isChorus` が真。TAKEOVERでは3区間）とする。資料は「サビ＝コーラス」と「見せ場＝投下倍率用の6区間」を別概念として区別しており、字義に忠実なコーラス区間を採る。
- 音量バランスは中庸（楽曲をマイナス3デシベル、タップをプラス3デシベル。合計でタップが楽曲に対し約6デシベル前に出る）。
- 換算の根拠: 知覚音量は音圧の対数におよそ比例するためデシベルで表す。デシベル差dの線形振幅倍率は10の(d/20)乗。
- 本変更は二重レビュー（Codex）を2巡受け、指摘（圧縮の段順に基づくクリップ根拠の修正、達成基準と余韻の整合、コメント数値の更新範囲、型検査の構成数）を反映済み。マージ判定は「マージ可」。

## 実装範囲とファイル
- `src/utils/screenShake.ts`:
  - `BEAT_AMPLITUDE_DOWNBEAT` 0.12→0.09（倍率1.09、Issue #76 の範囲0.05〜0.15内）。`SHAKE_MARGIN_FRACTION` 0.6→0.3（横ずれの移動量が画面外余白に占める割合の上限を下げ、横ずれ最大量を半減。1未満で画面端に隙間なし）。`BEAT_AMPLITUDE_OFFBEAT` 0.05は範囲下限のため据え置き。
  - 純粋関数 `isWithinAnyRange(ranges, timeMs)` を追加。半開区間（開始時刻を含み終了時刻を含まない）判定。`profiles` を import せず区間配列を構造的に受け、依存規則を保つ。
  - 横ずれ係数0.6を引用するコメント（係数宣言・`ZOOM_IDENTITY_EPSILON`・`evaluate` 内・factor 上限）を0.3へ更新。
- `src/app/index.ts`: `takeoverProfile.repetitiveSegments.filter((s)=>s.isChorus)` でサビ区間配列を前計算し、`beatScheduler.advance` の発火を `isWithinAnyRange` でサビ区間内の拍だけに限定。サビ区間外は新規発火せず、最後の拍の余韻が減衰しきってから恒等に戻る。`isWithinAnyRange` を import。
- `src/audio/synthConstants.ts`: `SYNTH_MASTER_GAIN` 0.3→0.42（プラス3デシベル＝×1.413）。音声経路は動的圧縮→マスター音量の順でマスターは圧縮の後段のため圧縮挙動は不変。クリップ確認は最終出力で行い、圧縮が働かない最悪条件でも単音最大0.675×0.42≈0.284<1.0。
- `src/textalive/textAlivePlayback.ts`: 定数 `BGM_PLAYBACK_VOLUME=71`（マイナス3デシベル＝100×0.708）を追加し、`playbackVolume` を目標値で設定。従来はプレイヤー現在値（既定100）を読むだけで下げられなかった。本アプリは自前ロードのため明示的目標値を用いる。既存の無音化→復元処理がこの値で機能する。
- `src/utils/screenShake.test.ts`: `isWithinAnyRange` の境界テスト5件を追加。94行コメントの拡大量「0.12」を「0.09」へ更新。181行の `exp(-0.6)` は時定数250ミリ秒に対する `exp(-150/250)` の数式で横ずれ係数と無関係のため変更しない。
- `scripts/screen-shake-smoke.mjs`: 立ち上がりの期待倍率を1.12から1.09へ更新（変更定数への追従）。

## 暫定値（★実機調整）
- 画面振動: `BEAT_AMPLITUDE_DOWNBEAT=0.09`、`SHAKE_MARGIN_FRACTION=0.3`。
- 操作音: `SYNTH_MASTER_GAIN=0.42`。
- 楽曲音量: `BGM_PLAYBACK_VOLUME=71`。
いずれも目視・試聴で適切と確認済みだが、端末差で微調整の余地あり。

## 検証結果（Node 22）
- `npm run typecheck`（tsconfig.json / tsconfig.node.json / tsconfig.scripts.json の3構成）: 緑。
- `npm test`: 138ファイル・1719件緑（`isWithinAnyRange` 境界5件含む）。
- `npm run build`: 成功。
- `npm run quality:fps`（#97）: 成功。判定（デスクトップVRM常在満載）平均60.1・下位5%60・最低60（実GPU Intel Iris Xe）。
- `npm run quality:readability`（#98）・`quality:spatial`（#100）・`quality:display-sync`（#99）・`quality:operation-judgment`（#103関連80件）: いずれも成功。
- `npm run smoke:screen-shake`・`smoke:audio`: 成功。
- `npm run smoke:play`: 注入回数に対し処理数が1少ない差異が出るが、変更前のmainでも同一結果であり検証環境（擬似プレイ窓が約680ミリ秒と短い）のタイミング由来で本変更とは無関係。発音回数・算入タップ数・蝶生存数の3計数は互いに一致し連鎖は健全。
- 目視・試聴確認（実楽曲 TAKEOVER）: サビ区間のみ振動・振動の縮小・タップ音量・楽曲音量バランスの4点をユーザーが確認し、いずれも適切。

## 留意事項
- 画面振動の発火限定はサビ区間内の拍のみ。区間外は新規発火せず、最後の拍の余韻のみ減衰して恒等に戻る（余韻は効果設計の一部）。
- BGM音量はプレイヤー現在値ではなく目標定数で固定。ホスト管理での再生は本アプリの対象外。
- 目視確認のためメインの `.env`（キー `TEXT_ALIVE_API_TOKEN`）をworktreeへローカルコピーしたが、`.gitignore` 対象でコミット対象外。
