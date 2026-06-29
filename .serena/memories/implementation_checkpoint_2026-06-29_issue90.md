# 実装チェックポイント 2026-06-29 Issue #90 こたえて横展開

## 成果
課題曲「こたえて」（キー kotaete、作者 imie、曲長252660ミリ秒）を、TAKEOVER と同じく題名画面から選んで通しプレイできる実装済み曲にした。TAKEOVER の再生は維持。コーラス補正（Issue #90）を含む。ブランチ worktree-kotaete-yokoten-90、PR #222（base main、Closes #90）。

## 重要な設計判断
- **再読込方式（多曲選択）**: 1ページ読込＝1曲。別曲選択は URL 引数 song を差し替えてページ再読込し起動時に構成する。並行する Issue #91 と同じ方式・同じ関数名（resolveImplementedSong・getSongBundle・selectSong・__currentSongKey）に整合させ、曲登録を足し合わせる加算的マージを可能にした。共有インフラ（chordPitch・songs.ts・main.ts・app/index.ts・profiles/index.ts・generate-profile・profile-schema・smoke）は #88/#89/#91 と重複改変のため統合順序の調整が必要。
- **コーラス補正は実行時のキネティックタイポにのみ適用**: 3段落目コーラスは2段落目発声中の重唱で文字タイミングが1ミリ秒に潰れる。補正後は他フレーズと時間重複し、時刻昇順・非重複を要する曲プロファイルの lyricChars と両立しない。かつ lyricChars は実行時に消費されない。よって補正は src/utils/chorusCorrection.ts の applyChorusCorrectionToLyricVideo で再生中の歌詞へ適用し、buildProfile には入れない。対象フレーズは全文一致＋単語数・文字数一致で特定し、補正後に単語・フレーズ時刻を子から再計算する。app/index.ts では try/catch で防御的に適用し、構造相違時は補正なし歌詞へ退避する。
- **こたえて固有の生成パイプライン対処（共通コード拡張、TAKEOVER 不変）**: (1)見せ場個数を曲別指定（showcaseCount=9。サビ区間9で既定6は失敗）、(2)拡張和音を基本品質へ写像（音高は実行時未使用ゆえ sus2/sus4→major・sus2(#7)→majorSeventh で足る。#91整合）、(3)サビ反復が不均一な曲向けに共有テンプレート無効化（chorusSharedTemplate=false。こたえてのサビ拍数は32/33で揃わずサビ間多様性逓減は発火しないが配分・一回性・ゲージ投下・ランクは機能）、(4)感情値の[0,1]丸め（覚醒度最小 -0.021）、(5)末尾コード区間を曲長まで延長（末尾が曲長31ミリ秒手前で被覆検証に落ちる）。
- **JUST音程（和音スロットの音高）は現スキーマに合わせ維持**: 現操作モデル（水滴音統一・横方向7レーン・判定はレーン一致）で実行時未使用の死蔵だが、撤去は #91 のプロジェクト全体改修の対象で本ブランチ外。
- **曲別手動入力の確定値と根拠**: 調=ト長調（tonicPitchClass=7。終止 D→G・最頻G・最終和音G）、climaxAnchorMs=223600（最終サビ区間内の声量最大、見せ場のclimax選定が最終サビになるよう区間内へ）、camera=曲構造に合わせた手設計6点（速度正を kotaeteInputs.test.ts が固定）、色・操作音=TAKEOVER 流用（世界観共通）。生成結果はノーツ256・見せ場9・タップ上限262/437(比率0.60)・テンポ143。

## 検証
型検査3構成・全1865テスト・提出ビルド(build:app)・両曲の画面遷移スモークと通しプレイスモーク（?smoke=1擬似再生）すべて合格。実音源での目視確認も合格（こたえて選択・再生開始、コーラス区間の補正表示、歌詞同期とカメラ移動、タップの水滴音とレーン反応と採点、結果画面と灯し演出と撮影モード、TAKEOVER回帰）。Codex の妥当性レビューは2巡で「push可（条件なし）」。

## 主な新規・編集
新規: docs/analysis/kotaete.songmap.json、src/profiles/index.ts(+test。getSongBundle/SongBundle)、src/profiles/kotaete/{kotaeteInputs.ts(+test)、kotaete.profile.json、profile.ts、typographyChart.ts、chorusTimings.ts、kotaeteProfile.gate.test.ts}、src/utils/chorusCorrection.ts(+test)。
編集: src/utils/chordPitch.ts(+test。拡張和音写像)、src/config/songs.ts(resolveImplementedSong・kotaete実装済み)(+test)、src/main.ts、src/app/index.ts、src/profiles/generate/{buildProfile.ts(showcaseCount・chorusSharedTemplate・末尾コード延長)、onsetNotes.ts、songmapAdapters.ts(感情値丸め)}、src/screens/{types.ts、titleScreen.ts}、src/types/globals.d.ts、src/textalive/{musicMap.ts、textAlivePlayback.ts}、scripts/{generate-profile.ts、harness/profile-schema.mjs(+test)、screens-smoke.mjs、play-smoke.mjs}。

## 環境メモ
ワークツリーは node_modules をメインへのジャンクション・.env をコピーして機能させた。音楽地図ダンプはメイン側の開発サーバ経由で取得し出力はワークツリーへ。実音源目視はプレビュー（localhost:4193）で実施。
