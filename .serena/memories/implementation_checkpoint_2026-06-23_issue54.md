# 実装チェックポイント（2026-06-23・Issue #54）

**状態: Issue #54（ゲージ・投下システム）の実装を完了。ブランチ `worktree-issue-54-gauge` にコミット1件（`a8c6ecf`）。push 済み、PR #185 作成済み（Closes #54）。**
**用途**: セッション喪失時の復帰点（実装フェーズ）。入力契約のタップ判定は [[implementation_checkpoint_issue48]]、見せ場重みの供給は #41、倍率の消費先は後続 #55・#56。

## 位置づけ

マイルストーンM4「コアゲームプレイ・判定・スコア・音」のクリティカルパス（優先度 P0-critical）。タップの成功でゲージを蓄積し、見せ場で投下してゲージを消費し、得点式 `タップ1回の得点 = a × D × M + combo`（`docs/decisions/app-overall-decisions.md` §3.4）の投下倍率 M を供給する曲非依存の純粋ロジック。判定そのものは行わず、判定結果 `JudgmentResult`（`src/scoring/types.ts`）の `timingJust`・`pitchJust` だけを消費する。状態は持たず、呼び出し側（#59）が現在のゲージ量を保持して本モジュールの純関数で更新する。

## スコープ確定事項

- 含む: `src/scoring/gauge.ts` のゲージ蓄積計算・投下の消費・倍率算出。受け入れ基準2項目（片JUST50回で満タン、倍率が消費割合×見せ場重みで正確）は `src/scoring/gauge.test.ts` の単体検査で担保。
- 含まない（下流Issue）: 投下の入力ジェスチャと発動の結線・見せ場時刻の判定と weight 取得は #59、倍率Mのタップ得点への適用は #55、ゲージの画面表示は #57、投下時のノーツ効果音の音色変化は #53。

## 最重要の意思決定（採用理由を先に述べる・ユーザー確認済み2件を含む）

- **投下倍率 M = 1 + (消費割合 × 見せ場重み)（ユーザー確認済み）**。§3.4 は投下倍率を「投下したとき1.0より大きくなる」と定め、Issue本文は「消費割合×見せ場重み」と定める。消費割合は[0,1]、見せ場重みは[0.4,1.0]のため積は最大1.0にしかならず、文字どおり積を倍率にすると§3.4と矛盾する。積を基準値1.0への加点項として扱うと、未投下で1.0・投下で1.0超となり両者を満たす。値域は[1.0,2.0]（最大2.0は消費割合1.0かつ見せ場重み1.0、189秒のclimax見せ場）。新しい調整定数は追加しない。
- **投下は現在ゲージを全消費し、消費割合=消費量÷満タン容量とする**。倍率が「消費した割合に応じて変わる」ためには消費量が可変でなければならない。投下を固定量子（満タンの1/5）に固定すると消費割合が常に0.2となり倍率が変動せず§3.6と矛盾する。よって投下時点のゲージ量がそのまま消費割合を決める方式が唯一整合する。プレイヤーは§8の通り投下する瞬間を選び、満タン一括で割合1.0、1/5充填なら1曲で5回投下できる。これが「満タン=投下5回分」と整合する。
- **満タン容量50・基本量1は #54 が所有し `DEFAULT_GAUGE_CONFIG` に★暫定で定義する**。`src/config/tuning.ts` 冒頭の注記が「満タンの絶対タップ数(約50)・投下回数(5)はゲージ機構(#54)と曲プロファイルに置く」と所有を定めるため、この曲依存の絶対値は tuning.ts に置かない。両JUST倍率だけは曲非依存の調整値として tuning.ts の `GAUGE_BOTH_JUST_MULTIPLIER`(=2) を借用する。満タン容量と加算量はゲージ生成の引数で外から受け取り、#59 が TAKEOVER の tapBudget・showcases から導いた値で上書きできる。
- **異常値は既存scoring慣行（`timingAccuracy.ts`・`pitchAccuracy.ts`）に準拠して扱い、設定値と実行時入力で責務を分ける（ユーザー確認済み）**。既存判定関数は非有限値を例外で止めず床側へ倒し、出力を有効範囲へ切り詰め、縮退設定に退避分岐で応じる（根拠「失敗のない床の方針のため判定を止めない」）。設定値（`baseAmount`・`bothJustMultiplier`）は既存 `JudgmentWindows` と同様に呼び出し側が妥当な値を渡す前提とし `gaugeGain` は防御的に切り詰めない。実行時入力（`currentValue`・`showcaseWeight`・`consumedRatio`）は防御的に扱う。`fullCapacity` のみ満タン判定と消費割合の分母であり、0以下・非有限だと0除算やNaN伝播で「ゲージは有限の非負量」という不変条件が壊れるため退避する（設定値信頼の構造的例外）。

## 公開した型と関数（`src/scoring/gauge.ts`、`index.ts` から再輸出）

- `GaugeConfig { fullCapacity; baseAmount; bothJustMultiplier }`、既定 `DEFAULT_GAUGE_CONFIG`（50・1・`GAUGE_BOTH_JUST_MULTIPLIER`）
- `gaugeGain(result, config)`: 1タップの加算量（片JUST=base、両JUST=base×倍率、他=0）
- `accumulateGauge(currentValue, result, config)`: 加算して [0, fullCapacity] へ切り詰めた次のゲージ量
- `deploymentMultiplier(consumedRatio, showcaseWeight)`: 2引数を [0,1] へ切り詰めてから `1 + 積`
- `deploy(currentValue, showcaseWeight, config)`: 現在量を全消費し `{ consumedAmount, consumedRatio, multiplier, remaining(常に0) }` を返す

## 検証結果

- `npm run typecheck`: 合格（tsconfig 3種・strict）
- `npm run test`: 全1353テスト合格（106ファイル。新規 gauge.test.ts 17件、依存境界 importBoundary.test.ts が gauge.ts の profiles・rendering・tools・three 非依存を自動検査）
- `npm run build`: 成功

## レビュー経緯

Codex（codex:codex-rescue）に0ベース設計・二重チェックレビュー・着手判定を4回委譲。指摘を反映し最終的に「修正必須点なし・go」を得た。主な反映: deploy と deploymentMultiplier の単一計算経路、`isFloor` と両JUST偽のテスト分離、合成シナリオ（10回蓄積→1投下を5サイクル）、「50タップ満タン＝片JUST50回」の明示、設定値異常値の責務分界。
