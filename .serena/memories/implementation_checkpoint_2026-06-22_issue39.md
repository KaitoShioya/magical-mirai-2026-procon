# 実装チェックポイント（2026-06-22・Issue #39）

**状態: Issue #39（譜面パターン適用）の実装を完了。ブランチ `worktree-issue-39-note-patterns` で PR #162 を作成・push 済み。マージ前。**
**用途**: セッション喪失時の復帰点（実装フェーズ）。入力の中間ノーツはオンセット選択 [[implementation_checkpoint_2026-06-21_issue38]]、入力のスロット区間はJUST音程7スロット生成 [[implementation_checkpoint_2026-06-21_issue36]]、出力先の型は曲プロファイルスキーマ [[implementation_checkpoint_2026-06-19_issue34]]、無和音区間の解決は [[implementation_checkpoint_2026-06-21_issue37]]。

## 位置づけ

マイルストーンM1「譜面・曲プロファイルパイプライン」の処理である。`docs/research/04-ux-and-chart-design.md` §4 が定めるノーツ生成の4段階のうち第2段（各ノーツへY軸スロットを割り当てる）と第3段（同音連打・上昇下降のパターンを当てて楽曲の感触を映す）を担う。入力はオンセット選択（#38）の中間ノーツ列、出力は曲プロファイルの `notes` の途中段で、後段のノーツ軌跡上配置（#40、`trajectoryPosition` を付与）の入力になる。受け入れ基準は「音程の動きに追従（上昇音はy↑）」。

## 配置

`src/profiles/generate/notePatterns.ts`（新規）。曲プロファイルの `notes` の一部を生成する純粋関数であり、オンセット選択（#38）と同じ作法にそろえた。

## 最重要の意思決定（すべてユーザー確定）

- **駆動信号＝声量曲線＋感情曲線の興奮度（arousal）の起伏、和音境界で run を区切る**。旋律はTAKEOVERで音高を測れた文字が全体の6パーセントにとどまり使えない（`docs/research/04` §2）。声量と arousal を正規化合成した「勢い値」（0以上1以下）が上がる箇所で slotIndex を上げ、下がる箇所で下げ、平坦で据え置く。和音が変わる境界では slotIndex を勢い値から再シードする（スロットの音高集合が変わるため、境界をまたいで上昇下降を続けると音高の意味が連続しない）。
- **同時押し（2点から3点）は本Issueでは扱わず1オンセット＝1ノーツに限定**。マージ済み #44 のタップ母数434と整合させ、同時押しの母数・予算の意味付けが固まる下流（#46・#48・#55）へ分離する。
- **slotIndex 空間のみで動作し音高の値を読まない**。#36 の並び順契約により `slots[].pitches` はMIDI昇順で slotIndex↑⟺音程↑。本モジュールは `slots` から区間の時刻境界とスロット数（`pitches.length`）だけを読み、slotIndex を増やすことが音高を上げることに自動的に対応する。画面の上下への変換は入力写像（#47）の責務。
- **スキーマ拡張は不要**。`Note` 型は既に `slotIndex`・`pattern` を持つ。`trajectoryPosition` は #40 が付与するため #39 単独の出力では完全プロファイル検査は通らない。受け入れ基準は #39 自身のテストで表明する。

## 採用した数値と判定方法とその理由（すべて理由を先に述べる）

- **勢い値の正規化式 ＝ `(loudnessWeight×正規化声量 + emotionWeight×arousal) / (loudnessWeight + emotionWeight)`**。正規化声量と arousal がともに0以上1以下で、重みの合計で割る凸結合のため、重みをどの正の値に変えても勢い値が0以上1以下に収まる。既定の重みは両方0.5（声量と感情を等価に混ぜる初期値。見せ場生成の前例に揃える）。
- **正規化声量 ＝ `min(max(生声量, 0) / maxAmplitude, 1)`**。負値（無音センチネル−1、TAKEOVERで2個実在）は最低エネルギーで0に切り上げる。上限1のクランプは必須で、TAKEOVERの声量曲線の最大値65356が最大声量51864を超え商が最大約1.26になるためである。
- **arousal は階段補間（時刻以下で最大の時刻を持つ点の値）、stepMs は読まず points の tMs を直走査**。感情点が等間隔でない楽曲でも正しく動くため。points 昇順違反は未定義動作とし並べ替えない（onsetNotes の前例）。
- **所属和音区間 ＝ 開始時刻が時刻＋許容差1ミリ秒以下の最後の区間、無ければ先頭**。許容差1ミリ秒は validateProfile・noChordResolution と同値で、境界の浮動小数点の揺れで拍を取りこぼさないため。
- **run 先頭のシード ＝ `clamp(1 + round(勢い値 × (スロット数−1)), 1, スロット数)`**。エネルギー水準[0,1]をスロット範囲へ線形写像し、高エネルギー区間ほど高いスロットから始める。
- **run 内は勢い値差で1段ずつ移動（差が flatEpsilon を超えて正なら+1、負なら−1、内側なら据え置き）、結果を範囲にクランプ**。1ノーツ1段の階段にすると有限スロット範囲内で読み取れる上昇下降になる。`flatEpsilon=0.02` は[0,1]正規化済み勢い値の不感帯（全幅の2パーセント）でサンプル切替の微小変動を方向変化と誤認しないため。
- **pattern は確定後の slotIndex 差から決める**（勢い値からではない）。天井・床のクランプで slotIndex が動かない箇所が確実に同音連打になり、表示上のY移動と pattern が一致するため。run 先頭は同じ run の直後ノーツとの差で性格付け（run長1または差0なら同音連打）、それ以外は直前との差。前後の基準が異なる。
- **退化譜面検査の変化割合の下限3割**。全ノーツが同一スロットに張り付く動かない譜面を排除する目的で、声量サンプル間隔200ミリ秒に対しオンセット間隔がサビ343・非サビ686ミリ秒のため隣接ノーツ間で声量が変わりやすく3割を十分上回ると見込む。実データの変化割合は十分高く、3種 pattern も全て出現することをテストで確認済み。

## 実装した内容

- 新規 `src/profiles/generate/notePatterns.ts`: 関数 `applyNotePatterns`・`sampleContour`、型 `NotePattern`・`NotePatternInput`・`NotePatternOptions`・`PatternedNote`、定数 `DEFAULT_NOTE_PATTERN_OPTIONS`。import は型のみ（`./onsetNotes` の `OnsetNote`、`../schema/profileSchema` の `ChordToneSlotRegion`・`LoudnessCurve`・`EmotionCurve`）。
- 新規 `src/profiles/generate/notePatterns.test.ts`: 合成データによる単体テスト20件（単調性・天井床据え置き・run区切り・フォールバック・例外5種・オプション上書き・sampleContour）。
- 新規 `src/profiles/generate/notePatterns.takeover.test.ts`: 実データ検証7件。songmap生フィールドを `Chord` 型へ変換し、無和音6区間を `treatment="scale"` で #37 解決して210区間へ統合し #36 でスロットを組む（既存 chordToneSlots.takeover.test.ts は無和音除外204区間のため、210区間統合は本テストの新規手順）。スキーマ適合は別途 minimalValidProfile から組む。
- 更新 `src/profiles/generate/README.md`: ヘッダーに #39 を追加し、責務・slotIndex空間動作・駆動信号・pattern決定と前後基準の違い・声量と感情の刻みの扱いの違い・依存規則・後段契約を追記。

## レビューと検証（事実）

- 実装前に CodeX と独立 Plan エージェントで設計プランを複数回レビュー。主な解消点: pattern をクランプ整合のため確定後 slotIndex 差から決める、全区間スロット数同一かつ1以上の入力検査、maxAmplitude≤0 を例外化、songmap生フィールドの Chord 型変換明記、スキーマ適合テストを minimalValidProfile から組む、退化検査閾値を実測前提とする、正規化声量の上限クランプの役割明記。
- `npm run typecheck`（`tsconfig.json` と `tsconfig.node.json`）: 型エラーなし。
- `npx vitest run`: 全75ファイル978件合格（新規27件を含む、既存に影響なし）。

## スコープ外（本Issueでは実装しない）

- 同時押しのノーツ展開とタップ母数・予算の再調整（#46・#48・#55）。`trajectoryPosition` の付与（#40）。曲プロファイルJSONへの書き込み（#45・#46）。多様性逓減区間（#42・#46）。16分音符量子化や休符・溜めの密度精緻化（#43）。
