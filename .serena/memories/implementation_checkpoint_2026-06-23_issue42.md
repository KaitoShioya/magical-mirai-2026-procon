# 実装チェックポイント（2026-06-23・Issue #42）

**状態: Issue #42（多様性逓減・反復区間の自動抽出）の実装を完了。ブランチ `worktree-issue-42-diversity-zone-auto-extraction` を push し、main 宛の PR #182 を作成済み。マージ前。**
**用途**: セッション喪失時の復帰点（実装フェーズ）。手動逓減区間を与えた先行Issueは [[implementation_checkpoint_2026-06-22_issue46]]、入力のサビ区間導出は曲プロファイル生成 [[implementation_checkpoint_2026-06-21_issue40]] と同じ生成層、係数の消費（目的関数結線）は後続 #56。設計正典は `docs/decisions/app-overall-decisions.md` §3.4・§3.5。開発基盤の現状は [[dev_infrastructure_notes]]。

## 位置づけ

マイルストーンM1「譜面・曲プロファイルパイプライン」の処理である。受け入れ基準「反復区間で同操作反復時に係数が下がる」。ユーザー決定でスコープは2つ。第1は区間の自動抽出（先行 #46 の手動ハードコードの置き換え）。第2は多様性係数を返す純粋関数の新設（単体テストで「係数が下がる」を立証。目的関数への結線と本番逓減量の確定は #56 へ委譲）。

## 実装した内容

- **`src/profiles/generate/diversityZones.ts`（新規）**: `deriveDiversityZones(chorusSegments, labels?)` を追加。サビ区間（`toChorusSegments`、`{startMs,endMs}`）を時刻昇順に整列し、役割を位置で割り当てる（N=0空・N=1主題のみ・N≧2は先頭主題/末尾回帰/中間すべて変奏）。境界は `startMs/endMs` を `startTimeMs/endTimeMs` へ写す。ラベルはハイブリッドで、索引ごとの任意上書き（型 `ReadonlyArray<string | undefined>`、未指定と空文字は汎用ラベル「第N反復区間（役割）」）。ラベル数が区間数を超えると例外。区間値検査は持たせず `validateProfile` に委ねる。
- **`src/profiles/generate/buildProfile.ts`（変更）**: `diversityZones` の素通しを `deriveDiversityZones(chorusSegments, manual.diversityZoneLabels)` へ置換。`ManualProfileInputs.diversityZones: DiversityZone[]` を `diversityZoneLabels?: ReadonlyArray<string | undefined>` へ置換。未使用になった `DiversityZone` 型 import を除去。
- **`src/profiles/takeover/takeoverInputs.ts`（変更）**: `diversityZones` 配列を削除し `diversityZoneLabels`（曲固有3文言）へ移行。
- **`src/profiles/takeover/takeover.profile.json`（再生成）**: `npm run profile:gen` で再生成。差分は `diversityZones` の区間1・区間2 境界が手丸め値からsongmap生値へ変わるのみ（区間0境界・全役割・全ラベル・他フィールド不変）。§3.5「境界の時刻は反復区間そのものとする」に整合。
- **`src/scoring/diversityCoefficient.ts`（新規）**: `computeDiversityCoefficient(input, options)` を追加。`input` は `currentJustSlot`・`previousJustSlot`・`currentOperationSlot`・`previousOperationSlot`。`options.reductionFactor` は有効範囲 0以上1未満。JUST が変化したのに前と同じ操作（音程スロット）を繰り返したときだけ `reductionFactor`、それ以外は 1.0。前回がない初回は 1.0。`scoring/index.ts` で再輸出。
- **`src/scoring/README.md`（変更）**: 多様性係数の責務と #56 向け結線契約を追記。結線契約は、発火対象を反復区間内に限るのは #56、前回として比較する区間は #56 が diversityZones の役割順から選ぶ、4つのスロットは判定エンジンと同じく0始まり（正解は Note.slotIndex を1引く、操作は Reaction.slotIndex をそのまま）、逓減量の本番値は #56 が確定する、の4点。同契約は diversityCoefficient.ts のコメントにも明記。

## 最重要の意思決定（すべて理由を先に述べる）

- **抽出元はサビ区間（`isChorus`）にする**。理由: 先行 #46 の手動値がサビ区間と一致し、§3.5 が三部形式の進化をサビの対構造（24秒と189秒の Clap to the Beat）に結びつけるため。TAKEOVER は反復区間3件すべてサビで、現行3区間を正確に再現する。
- **逓減量は推測で固定せず引数化する**。理由: §3.4 は D を「1.0未満」とだけ定め具体値を持たず、`src/config/tuning.ts` 冒頭規約が「得点合成の基準値は scoring の #55・#56 が定義」「原典に確定値が無い値は推測で埋めず所有Issueが確定」と定めるため、本番値は #56 が確定する。
- **逓減量の検査は範囲比較の否定で行い別途の有限性検査を加えない**。理由: 非数は全比較が偽で範囲検査が偽となり例外、正負の無限大は片方の境界比較が偽で例外になるため、範囲比較が非有限値も漏れなく弾く。テストで非数と正の無限大を固定した。
- **操作の同一性は音程スロットで判定する**。理由: §3.4 が「X軸の色は得点に寄与しない」と定めるため。
- **対応する前回の選び方は本関数の責務にしない**。理由: 三部形式のどの区間を「前」とするかは diversityZones を参照する目的関数統合 #56 の責務であり、本関数は前回値を引数で受け取るだけにすると役割が一意になるため。

## 検証結果

- 型検査3構成（`tsconfig.json`・`tsconfig.node.json`・`tsconfig.scripts.json`）すべて通過。
- 単体テスト全件通過（107ファイル・1356件）。新規は `diversityZones.test.ts`（8件）・`diversityCoefficient.test.ts`（11件）。`takeoverInputs.test.ts` はラベル保持検査を追加しテスト名を「自動抽出された逓減区間」へ更新。`scoring/importBoundary.test.ts` で依存規則（scoring は profiles 非取込）を維持。
- ビルド成功（Node 22。チャンク容量警告は既存の情報メッセージ）。

## 残課題（本Issueの対象外）

- 多様性係数の実プレイ中の得点反映（目的関数統合 #56、得点合成 #55、M4・未着手）。本番逓減量の確定も #56。
- 横展開の他曲はサビ区間数が3以外になりうるが、役割割当規則（N=0/1/2/N≧2）で対応済み。曲固有ラベルは各曲の手動入力で与える。
