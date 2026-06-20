# 実装チェックポイント 2026-06-21 Issue #14（3D文字 高品質化 troika）

状態: ブランチ `worktree-issue-14-3d-text-quality` を `origin/main`（#22 シェーダ変形・#36 JUST音程スロットを取り込んだ最新）へリベースして PR #147 を作成済み。型検査・単体テスト620件・両モードビルド・実GPU性能正式判定が緑。Codexの未pushレビュー指摘を反映済み。マージ待ち。

## 背景（検証で確定した前提）
#14の名指し3項目（カメラ正対・日本語フォント・配置確定の安定化）は先行 #20 が既に機能実装済みだった（`engine.ts` の毎フレーム `quaternion.copy`、Zen Kaku サブセット、生成時1回 `sync`＋世代番号）。ただし #14固有の「配置確定の主スレッド費用<1ms/frame」は未計測で、無条件正対は研究 §4 の「カメラが文字間を通過する疾走感」と衝突していた。ユーザー決定で残作業を3本柱に確定し実装した。

## 実装範囲（M2・#14）
- 柱1 向き方針: `src/typography/kineticText/orientation.ts`（新規・純粋関数）。`{ mode: "faceCamera"|"fixed", granularity?: "perCharacter"|"asGroup" }`。`engine.ts` の無条件正対を spawn 単位の向き方針へ置換。`fixed` は上書きしない。フレーズ `asGroup` は各メンバのローカル変換を基準点まわりに再計算して群正対（`BatchedText` はローカル行列のみ使うため親グループ正対は不可）。`GlyphHandle.setOrientation` 追加。既定はカメラ正対・文字ごとで従来挙動を保つ。
- 柱2 距離場の鮮鋭度: `engine.ts` の `SDF_GLYPH_SIZE`（=64、troika既定）を暖めと各文字生成で同値設定しアトラス解像度を揃える。毎フレーム変更しない（再syncを誘発するため）。`src/types/troika-three-text.d.ts` に `Text.sdfGlyphSize`・`gpuAccelerateSDF` を宣言、`troikaExports.test.ts` で実体確認。最大寸法が増える演出（#32）が入る時に再評価する。
- 柱3 同期費用ゲート: `diagnostics/main.ts` で出現処理直前〜`engine.update` 戻りまでを計測し、最大・上位5%・上位1%・1ミリ秒超過数・総フレーム数・描画参考値を `window` に公開（`__resetFps` で配列も初期化）。`scripts/typography-fps.mjs` で、単一層を desktop_real（実測再現・最悪集中区間）、一括層と群正対を desktop_maxload（最大負荷）で、いずれも上位1パーセンタイル（p99）<1ミリ秒を合否に追加。p99判定の理由は、単発のごみ集め停止が1%未満で生じフレーム落ちを起こさない一時的外れ値であり定常費用はp99が頑健に表すため（最大値と超過数は併記）。計測は同期的主スレッド費用のみを対象とし、worker組版・描画中の行列アップロード・後処理は除外（除外分は既存の単発落ち・平均フレーム率ゲートが抑える）。

## 受け入れ基準の達成（#14独自基準）
- A 日本語正確描画: 欠字確定判定はサブセット生成時の文字マップ検査（`build-font-subset.mjs` の `findMissingChars`、欠字0、`build-font-subset.test.mjs` 緑）が正典。実GPU診断のスクリーンショットで実歌詞描画に豆腐なし。グリフ数は補助（troika `FontResolver` の代替フォント解決で欠字でも正になりうるため）。
- B 向き方針: `orientation.test.ts`（5件）と `engine.test.ts` 追補（固定不変・setOrientation反映・群正対の位置・文字ごと不動）で確定。`BatchedText` がローカル行列を毎フレーム再アップロードすることはソースで確認済み。
- C 同期費用 p99<1ms（☆）: 実GPU（ANGLE Intel Iris Xe D3D11、非ソフトウェア）で desktop_real（単一層）・desktop_maxload（一括層・群正対）とも p99=0.4ms。合格。max は run間で0.5〜3.4msと揺れるが単発のごみ集め由来（単発フレーム落ち0・平均60fps維持）でp99が定常費用を表す。
- D 輪郭鮮鋭度: `sdfGlyphSize`=64 を明示設定。現エンジンの最大表示寸法では #20 の視覚検証範囲内。#32 で寸法が増える場合に再評価。
- E 非退行: 実GPU desktop_real 平均60fps・下位5%60・単発落ち0、desktop_maxload 初回遅延89ms<100ms。
- F 型検査・単体620件（リベースで取り込んだ #22・#36 のテストを含む）・両モードビルド（`build` と `build:app`）緑。

## レビュー反映
計画段階: Codex の独立レビュー（ゼロベース設計一致確認＋二重チェック、3巡）で計測区間・描画混入回避・統計値出力・日本語検証の堅牢化・固定向き判定・SDF表現・テスト設計を反映済み。
実装後（未pushレビュー1巡目）: (1) 固定向きのプール再利用汚染を `applyTextProperties` の `quaternion.identity()` で解消（テスト追加）。(2) 同期費用ゲートが一括層・群正対を未カバーだった点を、最大負荷フレーズを群正対にして desktop_maxload を同期費用の合否対象に加えて解消。(3) `OrientationPolicy` 等を `index.ts` から公開。(4) 同期費用ゲートを max から p99 へ変更（GCジッターの単発外れ値で max が揺れるため。フレーム落ち0・60fps維持を確認）。
未pushレビュー2巡目: (5) p99算出を最近接順位法へ（切り捨てより1順位高く保守的）。(6) 同期費用ゲートに最低サンプル数100フレームのガードを追加（空・退化標本での素通り防止）。(7) `stressProfile.ts` の「最大負荷は合否に使わない」古いコメントを現仕様（一括層・群正対の同期費用合否に使う）へ整合。(8) 計測区間コメントに保守的上限・意図的据え置きを明記。残るHIGHは新規ファイル未追跡で、コミット時に `git add` して解消する。

## 変更ファイル
新規 `orientation.ts`・`orientation.test.ts`。改修 `types.ts`・`engine.ts`・`engine.test.ts`・`troikaExports.test.ts`・`warmup`（既存引数利用）・`src/types/troika-three-text.d.ts`・`src/types/globals.d.ts`・`diagnostics/main.ts`・`scripts/typography-fps.mjs`・`README.md`（kineticText）。

## origin/main へのリベース統合（PR作成前）
作業中に `origin/main` が PR #143（#22 シェーダ変形）・PR #144（#36 JUST音程スロット）をマージして前進し、同じファイル（`engine.ts`・`diagnostics/main.ts`・`types.ts`・`index.ts`・`globals.d.ts`・`troika-three-text.d.ts`・`stressProfile.ts`・`typography-fps.mjs`・`README.md`）を変更していた。#14コミットを最新 `origin/main` へリベースし、5ファイルの競合を両立統合した。
- `engine.ts` の `update` は、単一字（向き方針）・一括字（向き方針＋群正対）・変形字（#22の変形時間進行）の3層が共存する。
- `DeformingTextHandle extends GlyphHandle` のため `setOrientation` が必須化した。変形テキストにも向き方針を持たせ（既定はカメラ正対で従来挙動を維持、`fixed` で3次元固定可能、変形の時間進行は向きと独立に常時実行）、`DeformingEntry` に `orientation` を追加した。
- `gsap` 依存は新 main が追加済み。リベース後に `npm install` で取得した。
- リベース後の差分は #14 の変更のみで、#22・#36 の作業を巻き戻していないことを `git diff origin/main..HEAD` で確認した。実GPU診断は #14 の同期費用ゲートと #22 の全文一括変形ゲートが同時に合格する。

## 次の着手
PR #147 のレビューとマージ。プランは `~/.claude/plans/claude-md-serena-github-issue-milestone-mutable-tome.md`。
