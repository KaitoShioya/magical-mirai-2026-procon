# 実装チェックポイント（2026-06-22・Issue #46）

**状態: Issue #46（TAKEOVER曲プロファイル生成・検証）の実装を完了。ブランチ `worktree-issue-46-takeover-profile` で PR #177 を作成・push 済み。マージ前。**
**用途**: セッション喪失時の復帰点（実装フェーズ）。入力の各派生フィールドはオンセット選択・譜面パターン適用 [[implementation_checkpoint_2026-06-22_issue39]]、ノーツ軌跡上配置 [[implementation_checkpoint_2026-06-21_issue40]]、密度設計 [[implementation_checkpoint_2026-06-21_issue43]]、タップ総数上限 [[implementation_checkpoint_2026-06-21_issue44]]。出力先の型は曲プロファイルスキーマ（#34）、無和音解決は #37、JUST音程7スロットは #36、見せ場は #41、カメラ軌跡評価器は #13 が用意した。

## 位置づけ

マイルストーンM1「譜面・曲プロファイルパイプライン」の最上流ゲートである。前段（#34スキーマ、#35〜#44の各生成関数）は完了済みだが、それらの出力を1つの `SongProfile` へ組み立てる統合層が無かった。本Issueはこの統合層を実装し、音楽地図のダンプ（`docs/analysis/takeover.songmap.json`）と手動定義から完成プロファイルを組み立て、検証器 `validateProfile` を通る成果物 `takeover.profile.json` を生成・コミットする。これが通るまで下流（演出#24〜#32、判定#48〜#59）は前提データを得られない。加えてプロファイルの `camera` に本編用の実カメラキーフレームを初めて与える。

## 配置

`src/profiles/takeover/`（新規ディレクトリ）。`buildTakeoverProfile.ts`（組み立て純粋関数と音楽地図ダンプ型 `TakeoverSongmap`）、`manualData.ts`（手動定義）、`index.ts`（公開窓口）、`buildTakeoverProfile.test.ts`（常時実行の検証ゲート）、`generateProfile.gen.test.ts`（生成テスト）、`takeover.profile.json`（成果物）、`README.md`。生成の起動は `scripts/build-takeover-profile.mjs`。

## 最重要の意思決定（すべてユーザー確定）

- **多様性逓減区間は3つのサビ区間にそのまま揃える**。設計判断の正典 `docs/decisions/app-overall-decisions.md` §3.5 が「進化の刻みは反復区間に同期させる」と定めるため、境界の時刻は反復区間そのものとし、役割（主題theme・変奏variation・回帰reprise）を時刻順に割り当て、役割を表すラベルだけを手動で与える。第1サビと第3サビは歌詞「Clap to the Beat」を含み主題と回帰に、第2サビは中盤の見せ場（変奏）に当たる。
- **成果物は事前生成したJSONをコミットし、生成はVitestの上で行う**。リポジトリにTypeScriptを直接実行する道具（tsx・vite-node・ts-node）が無く、生成関数はTypeScriptで、その依存先 `cameraTrajectory.ts` が three.js を取り込むため、three.js の解決が実証済みのVitestを子プロセスとして起動し、環境変数 `GEN_TAKEOVER_PROFILE` が設定されたときだけ書き出す。これにより起動時の再計算を避け、約2万行の解析データをアプリへ同梱しない。
- **完成プロファイルJSONをアプリへ読み込む結線は本Issueに含めず Issue #59 へ先送りする**。アーキテクチャ `docs/decisions/architecture.md` §3.6 が「実カメラキーフレームの生成は #46、読み込んで本編でカメラを駆動する結線は #59」と定めるため、`index.ts` は組み立て関数と型・手動定義の再エクスポートに留め、`resolveJsonModule` の追加や起動時検証は導入しない。ユーザー承認済みの「アプリが起動時にJSONを読み込み検証する」は #46（成果物の用意）と #59（読み込み結線）の分担で実現する。
- **カメラの軌跡上速度の検査は速度が正であることを主判定にする**。`cameraTrajectory.ts` の累積距離は4ミリ秒刻みの弧長表の線形補間で、始点・終点付近で速度が小さいと距離の増分が極小になり零と区別しにくい。軌跡上速度は1ミリ秒の中心差分で、カメラが動かない区間でのみ厳密に零になるため主判定とする。
- **無和音6区間（索引0/22/24/99/170/209）の埋め方は手動の対応表（0scale/22prev/24scale/99prev/170prev/209prev）で与える**。曲頭の索引0は直前和音が無いため調の音階、歌唱中の実質的欠落である索引24も調の音階、他は直前和音保持とする。ファ短調で Fm/Eb/Fm/Eb/Fm/Fm に解決し、`noChordResolution.test.ts` の独立した期待値（変更しない）と一致する。

## 採用した数値と判定方法とその理由（すべて理由を先に述べる）

- **感情曲線の刻みは1000ミリ秒**。音楽地図の感情曲線が毎秒1点で記録されるため、隣接点の時刻差に一致させる。
- **歌詞密度の窓幅は10000ミリ秒**。歌詞密度モジュールの既定値と揃え数小節を1窓として歌詞の粗密を捉えるため。毎分175拍では1小節（4拍）が約1372ミリ秒で、10000ミリ秒は約7小節に当たる。
- **カメラ速度の採取刻みは16ミリ秒、各キーフレーム時刻の直前直後1ミリ秒も採取、採取時刻は軌跡の時刻範囲に収める**。16ミリ秒は毎秒60フレームの1フレームで、表示が見せうる最小間隔に合わせ停止区間を見逃さないため。直前直後を加えるのは重心式スプラインが制御点の近くで速度が小さくなりやすく一様な刻みだけでは踏み越える恐れがあるため。範囲に収めるのは `speedAt` が前後1ミリ秒の差分を範囲端でクランプし、範囲外時刻だと差分の幅が零になり軌跡上速度が偽の零になるため。
- **末尾の無和音コード（索引209）の終了時刻を曲長で頭打ちにする**。音楽地図のコードは曲長237250ミリ秒を19ミリ秒超過して記録され、検証器はコード区間の末尾超過を2000ミリ秒まで許す一方、無和音区間（ncRanges）には1ミリ秒しか許さない。末尾コードが無和音区間のとき両者の許容差の食い違いで検証に失敗するため、曲を超えて鳴らない事実に合わせ `Math.min(終了時刻, 曲長)` で頭打ちにし長さも取り直す。連続被覆・1対1対応・長さの整合に副作用は無い。

## 実装した内容

- 新規 `buildTakeoverProfile.ts`: 基礎フィールドの直写像（song・source[SONGS照合]・tempoBpm175・musicalKey・beats・chords・repetitiveSegments・loudnessCurve・emotionCurve・lyricChars[3段平坦化]・lyricDensity）、無和音解決による全210区間のスロット、`generateOnsetNotes`→`applyNotePatterns`→`placeNotesOnTrajectory` のノーツ434個の統合。全210区間のスロットは無和音6区間を解決名で補う（既存 `chordToneSlots.takeover.test.ts` は無和音除外204区間のため、210区間統合は本Issueの新規手順）。
- 新規 `manualData.ts`: `takeoverCameraKeyframes`（6点、Issue #13 の暫定値を本編実キーフレームへ移管、★暫定）、`takeoverTapColors`、`takeoverOperationSound`（normal:三角波/帯域300〜4500、powerUp:のこぎり波/帯域300〜5000、`synthConstants.ts` と同根拠）、`takeoverNoChordTreatments`、調とテンポと曲長定数。
- 新規 `index.ts`・`README.md`・`buildTakeoverProfile.test.ts`（10項目）・`generateProfile.gen.test.ts`・`scripts/build-takeover-profile.mjs`、`package.json` に `build:profile-takeover` を追加。
- 更新 診断ページ `cameraTrajectory/main.ts`・`view.ts` を実キーフレームへ差し替え、暫定定数 `provisionalTakeoverCamera.ts` を撤去。`noChordResolution.test.ts` と `tsconfig.json` は不変更。

## レビューと検証（事実）

- 実装前に独立レビュアーで設計プランを複数回レビューし、無条件GOへ収束。主な確定点: 生成方式を素のNode実行ではなくVitestの環境変数方式へ、カメラ主判定を軌跡上速度が正へ、JSON読み込み結線を #59 へ先送り、暫定カメラ撤去で診断 `main.ts` と `view.ts` の両方を差し替え。
- 実装後の独立レビュー（実装ファイル読込＋テスト再実行）で「妥当でマージ可」。軽微指摘2点を解消: 起動スクリプトの子プロセス起動を引数配列方式へ、カメラ末尾時刻が曲長に一致することの厳密検査を追加。
- `npm run typecheck`: 型エラーなし。`npm run build:profile-takeover`: 成果物を書き出し。検証ゲート10項目合格。`npm test`: 全1147件合格（生成テストは環境変数が無いため飛ばす）、回帰なし。`npm run build`: 静的ビルド成功（差し替えた診断ページを含む）。

## スコープ外（本Issueでは実装しない）

- 生成処理の任意曲対応・汎用化（#45）。完成プロファイルをアプリへ読み込み本編で駆動する結線と視認品質の確認（#59）。多様性逓減区間の自動抽出（#42）。継続的検査での検証ゲート常時実行（#96）。投下時の音色の倍音追加の作り込み（#53）。
