# 実装チェックポイント（2026-06-23・Issue #55）

**状態: Issue #55（スコアリング合成＋最小ランク・簡易百分位）の実装を完了。ブランチ `worktree-issue-55-scoring-composition` にコミット8件（タスク単位）＋本チェックポイント。push 済み、PR #189 作成済み（Closes #55）。**
**用途**: セッション喪失時の復帰点（実装フェーズ）。投下倍率 M の供給は [[implementation_checkpoint_2026-06-23_issue54]]、多様性係数 D の供給は [[implementation_checkpoint_2026-06-23_issue42]]、判定結果の供給は [[implementation_checkpoint_2026-06-22_issue48]]。後続の目的関数結線は #56、本編結線は #59、ランクゲージは #65、累積分布関数による百分位は #66。

## 位置づけ

マイルストーンM4「コアゲームプレイ・判定・スコア・音」のクリティカルパス（優先度 P0-critical）。タップ1回の得点 `a × D × M + combo`（`docs/decisions/app-overall-decisions.md` §3.4）の合成、総合得点 S の集計、固定閾値ランク（C・B・A・S）、簡易百分位を担う曲非依存の純粋ロジック。状態は持たず、呼び出し側（#59）が累積状態を保持して本モジュールの純関数で更新する。多様性係数 D と投下倍率 M は呼び出し側が算出して入力で渡し、本層は合成式と集計とランクだけを担う。

## スコープ確定事項

- 含む: 素点 a の合成、combo、総合得点 S の集計（合成式の確定）、固定閾値ランク、簡易百分位、理論端の算出、結果要約。受け入れ基準2項目は新規の単体検査で担保。
- 含まない（下流Issue）: 多様性逓減の区間判定と投下の発火タイミングは #56、エンジンと画面への結線は #59、知覚的に均等な色空間によるランクゲージは #65、累積分布関数による百分位の磨きと結果画面・READMEへの「実ランキングでない」旨の表示は #66。

## 最重要の意思決定（採用理由を先に述べる・ユーザー確認済み2件を含む）

- **素点 a = タイミング精度 × 0.5 ＋ 音程精度 × 0.5（等重み・和1.0）**。タイミングと音程は対称な2チャンネルで（`docs/idea/concept-final.md` §4・§6）正典に一方を優遇する記述が無いため等重み。和を1.0にすると素点 a が0以上1以下に収まり、両方が満点窓のとき最大1.0になり §3.4「両方がJUSTのとき最大」を満たす。重みは本層が所有し `src/config/tuning.ts` には置かない（同 tuning.ts 行15から17の所有規則）。
- **combo の継続条件は両方が満点窓（ユーザー確認済み）**。§3.4 は「精度の高いタップが続くほど増え、精度の低いタップで途切れる」とだけ述べ閾値を定めない。判定エンジン #48 が確定済みの満点窓判定（`timingJust` と `pitchJust`）を再利用すれば新しい閾値定数を増やさず、ゲージ蓄積 #54 の成功基準とも揃う。combo 加点は連続走長から飽和線形（`step × min(max(走長 − 1, 0), maxSteps)`、step 0.05・maxSteps 10、暫定値）で算出する。
- **combo の総得点上限割合は0.10、担保は集計時の全体再正規化（ユーザー確認済み）**。Issue #55 の技術要件「10パーセント以下」を採る（§3.4 の「十数パーセント以内」より厳しい）。§3.4 は「全体の得点に占める割合を抑える」と全体に対する制約を述べるため、確定時に `comboEffective = min(comboRaw, baseTotal × (p ÷ (1 − p)))` で頭打ちにすると `comboEffective ÷ total ≤ p` が baseTotal の大小に依らず厳密に成り立つ（導出は `comboEffective = baseTotal × p ÷ (1 − p)` のとき `comboEffective ÷ (baseTotal + comboEffective) = p`）。上限割合は本層が所有し tuning.ts には置かない（原典に確定値が無い値は推測で埋めない）。
- **簡易百分位は理論端の一様分布の線形写像、理論最小は0に固定**。`docs/research/04-ux-and-chart-design.md` §3 は「理論的な最大と最小から合成した累積分布」と定める。一様分布の累積分布は理論端だけから一意に決まり追加の仮定も実測も要さないため、実測が無い本段階で中立かつ単調な簡易版になる。理論最小は §3.4「タップしないこと自体は減点しない」より達成可能な最小総合得点が0であることから0に固定する。累積分布関数による磨きは #66 が担う。
- **ランク帯は百分位の25・50・75（等幅四分位）**。§3.4 は百分位経由で4段階に対応づけると定める。実測分布が無い本段階では等幅四分位が中立かつ単調で偏りを入れない。少数実測による非等幅への磨きは #66 が担う。
- **実行時入力は値域へ収める（既存scoring慣行に準拠）**。素点 a は0以上1以下で非有限値は0、多様性係数 D は0以上1以下で非有限値は1かつ0は最大逓減の有効値としてそのまま通す（`computeDiversityCoefficient` は0以上1未満を返し得る）、投下倍率 M は1以上2以下で1未満と非有限値は1。曲固有のタップ総数上限は理論端算出の引数で受け取り本層にハードコードしない。

## 公開した型と関数（`src/scoring/` 各モジュール、`index.ts` から再輸出）

- `tapBaseScore(judgment, weights?)`・`TAP_SCORE_WEIGHTS`（`tapBaseScore.ts`）
- `isComboHit`・`nextComboRun`・`comboPoint`・`DEFAULT_COMBO_CONFIG`・`COMBO_SHARE_MAX`（`combo.ts`）
- `reduceScore`・`finalizeScore`・`INITIAL_SCORE_STATE`・`DEFAULT_SCORE_CONFIG`・各型（`scoreAccumulator.ts`）
- `simplePercentile`・`PERCENTILE_ESTIMATE_DISCLAIMER`・`ScoreBounds`・`PercentileBasis`（`percentile.ts`）
- `theoreticalScoreBounds`・`ScoreBoundsInput`（`scoreBounds.ts`）
- `RANKS_ASCENDING`・`rankOrdinal`・`RANK_PERCENTILE_THRESHOLDS`・`rankFromPercentile`・`rankFromScore`・`Rank`（`rank.ts`）
- `summarizeScore`・`ScoreResult`（`scoreResult.ts`）

## 検証結果（すべて Node.js 22 で実行）

- `npm run typecheck`: 合格（tsconfig 3種・strict）
- `npm run test`: 全1528テスト合格（新規56件。素点8・combo11・集計12・百分位7・理論端6・ランク6・結果要約5・公開窓口1。依存境界 importBoundary.test.ts が新規ファイルの profiles・rendering・tools・three 非依存を自動検査）
- `npm run build:app`: 成功

## レビュー経緯

Codex（codex:codex-rescue）にプラン段階で0ベース設計・二重チェックレビュー・着手判定を委譲した。初回レビューで5点（D=0を有効値として扱う、範囲外入力の値域処理、結果要約と理論最大の上限割合整合、簡易百分位の非有限理論端ガード、理論最小を0固定）の修正を受けてプランへ反映した。二次レビューで4点（多様性係数のコメント値域、D=0かつ連続満点窓の最悪ケーステスト、1未満の投下倍率の単独テスト、上限割合の優先順位テスト）を反映した。三次レビューで新規所見なしの着手判定を得て実装した。実装後にもう1度、未push実装の妥当性レビューとマージ判定を委譲し「マージを止める問題なし・MERGE可」を得た。
