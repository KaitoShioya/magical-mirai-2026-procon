# 実装チェックポイント（2026-06-23・Issue #56）

**状態: Issue #56「目的関数統合」の実装を完了。ワークツリー `worktree-issue-56-objective-function`（ブランチ `worktree-worktree-issue-56-objective-function`）で作業。コミット・PRは未作成（ユーザー指示待ち）。**
**用途**: セッション喪失時の復帰点（実装フェーズ）。前段の純粋関数群は得点合成 [[implementation_checkpoint_2026-06-22_issue48]]・多様性係数 [[implementation_checkpoint_2026-06-23_issue42]]・ゲージ投下 [[implementation_checkpoint_2026-06-23_issue54]]。下流の実機結線は後続 #59。設計正典は `docs/decisions/app-overall-decisions.md` §3.4・§3.5・§3.6、`docs/idea/concept-final.md` §8。

## 位置づけ

マイルストーンM4「コアゲームプレイ・判定・スコア・音」のP0課題。受け入れ基準「3要素ON/OFFで得点差が出る」。既に純粋関数として実装済みの素点a（#55 tapBaseScore）・多様性係数D（#42 computeDiversityCoefficient）・投下倍率M（#54 deploy）・合成集計（#55 reduceScore/summarizeScore）を、1プレイ全体で状態を保持しながら結線する曲非依存のエンジンを新設した。実機入力・音楽時計・描画・結果画面との結線は対象外（#59）。

## 確定した意思決定（ユーザー確認済み）

- **3要素の特定**: 多様性逓減(D)・投下(M)・一回性(タップ総数上限N)を個別ON/OFF。「ポートフォリオ」はNの制約下の戦略として一回性に内包（得点式 a×D×M+combo で切替可能な係数はこの3つだけ）。
- **多様性逓減の前回区間**: 楽曲解析で特定した同リズム区間どうしを、直前の同リズム区間と「同じリズム位置」で比較。同リズム区間で譜面（正解スロット）が変わっているのに操作を反復したら逓減。
- **逓減量 reductionFactor**: 本番初期値0.7（★暫定、#56所有、プレイ検証で調整）。

## 実データ検証（読み取り専用調査）

- 音楽地図 `takeover.songmap.json` の `segments` は反復区間3件すべてサビ・長さ22200ms均一・非サビ反復ゼロ。既存 `diversityZones`（主題1114.6-23314.6/変奏88800.2-111000.2/回帰165674.6-187874.6 ms）と時刻一致。`diversityZones` は単一の同リズム反復系列であり、新規解析パイプライン不要。
- 3区間で正解スロット相違は主題対変奏42/64・変奏対回帰49/64で「正解変化」条件が実データで成立。逓減は実際に発火しうる。
- 各区間1拍1ノーツで拍重複なし。拍オフセット0-63が3区間共通（変奏のみ末尾に1拍多い）。同リズム位置の対応付けは拍オフセットで一意・堅牢。

## 実装した内容

- **`src/scoring/diversityIndex.ts`（新規）**: `buildDiversityIndex(notes, zones)`。反復区間を `startTimeMs` 昇順整列し、各ノーツを半開区間 `[start,end)` で区間割当（区間外は未登録）。拍オフセット=`beatIndex - 区間内最初のノーツのbeatIndex`、正解スロット=`slotIndex-1`。`DiversityIndex{byNoteId, zoneCorrectSlots:Array<Map<beatOffset,correctSlot0>>, previousZoneIndex(p-1, p=0はundefined)}`。同リズム系列か否かは検証しない（呼び出し側責務と明記）。最小入力型 `DiversityNoteInput{id,timeMs,beatIndex,slotIndex}`・`DiversityZoneInput{startTimeMs,endTimeMs}`（roleは持たない）。
- **`src/scoring/objectiveFunction.ts`（新規）**: 純粋関数＋呼び出し側状態保持。`DEFAULT_REDUCTION_FACTOR=0.7`、`ObjectiveToggles{diversityReduction,deployment,oneShotLimit}`全true既定、`ObjectiveConfig`、`ShowcaseWindow`、`ObjectiveContext{diversityIndex,showcases,tapBudget}`、`ActiveDeploy{showcaseIndex,multiplier,startedAtMusicTimeMs,endTimeMs}`、`ObjectiveState{score,gaugeValue,tapCount,zoneOperations:Array<Map<beatOffset,operationSlot>>,activeDeploy}`、`createObjectiveState(context)`（区間数を内部導出）、`TapEvent{judgment,operationSlot0,musicTimeMs}`、`applyTap`/`applyDeploy`/`summarizeObjective`。
- **`src/scoring/index.ts`（変更）**: 新APIを再輸出。
- **`src/scoring/README.md`（変更）**: #56の#59向け結線契約を追記。
- **テスト（新規）**: `diversityIndex.test.ts`（6件）・`objectiveFunction.test.ts`（23件）。後者には投下倍率の追加観点（投下無効でも期限切れactiveDeploy消去・発動時刻前のタップは倍率なし・見せ場重み0/負/1超の防御）を含む。

## 最重要の意思決定（すべて理由を先に述べる。Codex二重レビュー5回で確定）

- **拍オフセットの基準は区間内最初のノーツ**。理由: 順序番号対応はノーツ数64対65でずれるが、拍オフセットは同リズム位置を正確に対応づける。先頭ノーツが各区間で同リズム位置に揃う前提（TAKEOVERで成立確認）。
- **一回性の計上は全タップ（床含む）**。理由: 「タップ総数上限」の字義。上限が0以下・非有限は0扱いで全タップ不算入。上限超は得点・ゲージ・計上・操作履歴すべて不変。
- **投下倍率は半開区間 `[startedAtMusicTimeMs, endTimeMs)`**。理由: 終了時刻ちょうどで倍率1.0。倍率の決定後に期限切れ消去（トグル非依存）。倍率1.0になる投下（空ゲージ・重み0）は成立させずゲージも消費しない（`activeDeploy`の存在=得点が上がる投下中を意味）。再投下は上書き。
- **状態は破壊しない**。理由: 純粋関数。`zoneOperations`は該当区間の写像だけ複製して更新。
- **逓減無効でも操作履歴は記録**。理由: ON/OFF切替で履歴が変わらないようにする。
- **前回値undefinedは別途ガードを置かない**。理由: `computeDiversityCoefficient`が1.0を返す。
- **`activeDeploy`期限切れ消去は`applyTap`実行時のみ**。下流が演出合図に使うなら現在時刻で半開区間を判定する契約をREADMEに明記。
- **依存規則**: `importBoundary.test.ts`は`scoring`配下全`.ts`を再帰収集するため新規2ファイル・`index.ts`再輸出も自動的に検査対象（テスト本体の変更不要）。

## 検証結果

- 型検査3構成（`tsconfig.json`・`tsconfig.node.json`・`tsconfig.scripts.json`）通過。
- 単体テスト全件通過（130ファイル・1599件。新規31件）。
- 未push実装のCodexレビューで「全項目適合・論理誤りなし・マージ可（妥当）」判定。指摘された非阻害の3テスト観点（上記の追加観点）を反映済み。
- 依存規則テスト（scoring が profiles・rendering・tools・three.js を非取込）維持。
- ビルド成功（チャンク容量警告は既存の情報メッセージ）。
- 依存関係はメインリポジトリ直下に `npm ci` で導入（ワークツリーは上位解決で共有）。

## 残課題（本Issueの対象外）

- 実機入力・音楽時計・描画・結果画面との結線（#59）。`createObjectiveState`→`applyTap`→`applyDeploy`→`summarizeObjective` の呼び出しと、profile値の最小入力への写し、`boundsInput` の供給を #59 が担う。
- 百分位の累積分布・ランク帯の磨き込み（#66）、ランクゲージ（#65）。
- 横展開の他曲プロファイル（#88-#91）。複数の異なるリズム反復系列を扱う場合は系列識別が必要（現設計は単一同リズム系列前提）。
- reductionFactor 0.7 の実機プレイ検証による調整。
