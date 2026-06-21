# 実装チェックポイント Issue #18 60fps性能バジェット自動劣化制御

実装完了。ブランチ `worktree-issue-18-perf-budget`、Pull Request #154（base: main、Closes #18）。型検査・単体テスト（727件、うち本Issueの判定器テスト11件）・通常ビルド（診断ページ含む）・本番ビルド（診断ページ `perf-budget.html` 除外確認）・実ブラウザスモーク11本（perf・rendering・layer・glow・screens・input・credits・typography-deform・engine-loop・camera-trajectory・readability）すべて成功。実GPU（NVIDIA GeForce RTX 3050）で反射性能ゲート合格と本編アプリの平均55以上を確認。ユーザー目視で各劣化段階の見え方・色味の保持・本編の回帰なしを確認。

## ゴールと達成基準
実行中にFPSを監視し、目標60フレーム毎秒を維持するよう画素密度倍率（DPR）とブルームを段階的に下げ、回復したら戻す制御を、振動なく段階変更を稀に保って行う。受け入れ基準「実機平均55以上維持・低下が滑らか」を、判定器の決定的単体テスト（振動しない・段飛ばしなし・滞留遵守）と、描画器が段階を実際に適用することの診断スモークで満たす。実機平均55以上の現地計測と正式ゲートは Issue #19・#97 へ委譲し二重化しない。

## 確定した前提（ユーザー意思決定）
- 縮退対象は DPR とブルームのみ。反射の実行時縮退は除外（起動時 `refl` のまま、実行時反射縮退は #97 へ委譲）。理由＝アーキ §3.8 の縮退順序が画素密度→後処理で反射を名指しせず、反射の実行時変更は `water` 再生成を伴い「滑らか」と矛盾。
- 制御は目標60を狙い維持下限を55とする（#18基準55、連携ゲート#97基準60の差を踏まえる）。

## 実装内容（ファイル）
- 新規 `src/rendering/performanceBudget.ts`: 純粋判定器 `createPerfBudget`（three.js・window 非依存）。`recordFrame(実経過ms)→{level,changed}`・`notifyApplied(実効変化)`・`state()`・`reset()`。2秒の時間窓（段階リングバッファ・容量1024・毎フレームのメモリ確保なし）で平均/最低FPSを求め、ヒステリシス（下降55・復帰58・不感帯3）と非対称滞留（下降3秒・復帰8秒）で段階を1段ずつ決める。経過は0以下/非有限を無視し過大は100msで頭打ち。`reset` は標本のみ初期化し段階は保持。
- 新規 `src/rendering/performanceBudget.test.ts`: 11件。下降・段階進行（0→1→2→3飛ばさず最大で停止）・復帰（3→2→1→0）・不感帯不変・滞留遵守・復帰滞留＞下降滞留・実効変化なしの短縮・過大経過の頭打ち・reset・平均最低FPS。
- 変更 `src/rendering/constants.ts`: FPS閾値（目標60・下降55・上昇58・窓2000・下降滞留3000・復帰滞留8000・頭打ち100）と段階ラダー `PERF_LEVELS`（4段階）・`PERF_MAX_LEVEL`・型 `PerfLevelSetting`。各値の採用理由をコメントに先述。所有は tuning.ts が #18 と定める。
- 変更 `src/rendering/bloom.ts`: `setResolutionScale(scale)`・`setEnabled(enabled)`（変化有無を返す）を追加。倍率を閉包変数 `currentBloomScale` 化し最後の表示寸法を記憶。`BloomState.resolutionScale` を追加。`setResolutionScale` は `composer.setSize` を呼ばず `applyBloomResolution` で再適用（半解像度の最後適用順を不変に保つ）。無効化はパスのみ無効で最終出力パスを通し色管理維持。
- 変更 `src/rendering/renderRoot.ts`: 動的DPR上限 `dynamicPixelRatioCap`・現在表示寸法・段階 `degradationLevel` の閉包変数。実効DPR＝`clampPixelRatio(端末倍率, min(MAX_PIXEL_RATIO, 動的上限))` を構築時とリサイズで使用。`applyPerformanceLevel(level)`（同段階は無処理、固定順 DPR→ブルーム解像度→ブルーム有効、4項目の変化有無を返す）。`renderer.info.autoReset=false`＋`render` 先頭で `renderer.info.reset()`（合成各パス＋2次元層を合算した1フレームの描画命令数を計測）。`RenderState` に `degradationLevel`・`drawCalls`。型 `PerformanceLevelApplyResult`。
- 変更 `src/app/index.ts`: `createPerfBudget` を診断有無に依らず常時生成。`onFrame` で `recordFrame`→段階変化時のみ `applyPerformanceLevel`→`notifyApplied`。`onResume`（タブ復帰）で `reset`。診断モードのみ `window.__fps/__avgFps/__fpsSamples/__resetFps`（試作と同じ500ms区間・上限120）・`__drawCalls/__perfLevel/__perfLevelHistory` を公開し dispose で削除。
- 新規 受け入れ診断 `src/rendering/diagnostics/perfBudget/main.ts`＋`perf-budget.html`: 計測モード（クエリなし）は `createRenderRoot` で段階0〜3を適用し各段階で数フレーム描き、適用後状態と段階適用直後フレーム時間を `window.__perfApplied` で公開。閲覧モード（`?view=1`）は湖のシーンを連続描画しキー0〜3で段階を切り替え、目視で各段階の画素密度・ブルーム・色味の保持を比較できる。`--mode app` 非配信。
- 新規 `scripts/rendering-perf-smoke.mjs`＋`package.json` `smoke:perf`: 端末画素密度倍率2で、段階1のDPR低下・段階2のブルーム0.25・段階3のブルーム無効と最終出力パス維持・全段階の描画命令数100未満・要求段階一致を検査。加えて段階1→2→3の各遷移でちょうど1つのレバー（画素密度倍率・ブルーム解像度・ブルーム有効）だけが変わることを表明し、再確保を最小化する機構（＝低下が滑らか）を決定的に検証する。さらに段階適用直後の1フレーム所要時間が上限200ミリ秒未満（段階適用が過度に重い処理になる回帰の検出。実測は最大およそ3ミリ秒）であることを検査する。
- 変更 `scripts/rendering-smoke.mjs`: 本編アプリ経路（`?smoke=1`）で `drawCalls` 指標が配線され現行シーン（VRMなし）の描画命令数が100未満であること、および劣化段階が配線されていることを表明。
- 変更 `src/rendering/index.ts`（`createPerfBudget`・型を公開）・`src/types/globals.d.ts`（`__renderState` に `degradationLevel`/`drawCalls`/`bloom.resolutionScale`、`__perfLevel`/`__perfLevelHistory`/`__perfApplied` 追加）・`vite.config.ts`（検証ビルドに `perfBudget`）・`src/rendering/README.md`（#18 節）。

## 主要な設計判断（Codex二重レビューで反映）
- `applyPerformanceLevel` は真偽1個でなく4項目（DPR・ブルーム解像度・ブルーム有効・いずれか）を返す。段階1→2のDPR不変・ブルーム変化を誤判定しないため。
- `recordFrame` は段階変化フラグを返し、呼び出し側は変化時のみ適用（毎フレーム適用の誤りを防ぐ）。
- 復帰滞留（8秒）を下降滞留（3秒）より長く非対称化し、再劣化の往復を抑える。
- 段階→設定表は適用側 `renderRoot`、判定は純粋 `performanceBudget` に分離。FPS閾値・ラダー値は `constants` に集約。
- 描画命令数は `info.autoReset=false`＋手動 `reset` で1フレーム合算を計測（スモークで段階0〜2が21・段階3が8と確認、ブルームパス除去が反映されることを実証）。
- 段階3のブルーム解像度倍率を段階2と同じ0.25に保ち、段階2→3で有効だけを切り替え無駄な再確保を避ける。

## 検証で確認した事実
- 単体テスト11件・全727件・型検査・通常/本番ビルド成功。
- perfスモーク（端末倍率2）: 段階1で画素密度倍率2→1、段階2でブルーム解像度0.25、段階3でブルーム無効・最終出力パス有効、描画命令 L0–2=21・L3=8（いずれも100未満）。
- 既存スモーク（rendering・layer・glow・screens・input・credits・typography-deform・engine-loop・camera-trajectory・readability）回帰なし。通常構成で診断アクセサ未公開を確認（本番では FPS 計測フックを露出しない）。

## 実GPUでの性能検証
実GPU（NVIDIA GeForce RTX 3050・ANGLE/Direct3D11、ソフトウェア描画でないことをハーネスが確認）で次を確認した。反射性能ゲート `reflection-fps.mjs` は反射512・256の双方が平均60・下位5パーセンタイル60で合格。本編アプリ `?smoke=1` をモバイル基準プロファイル（390×844・デバイス画素倍率3・処理6倍スロットル）で12秒計測し、平均59.2・下位5パーセンタイル56（下限55以上）・ページ例外0・定常の劣化段階0・描画命令21。起動直後（アプリ時刻2.0秒）に一度だけ段階1へ低下し復帰滞留どおり10.0秒に段階0へ復帰（1段のみ・振動なし）。これは読み込み・初期化中の一時的なフレーム低下への反応で、定常は段階0・約60フレーム毎秒。capable端末で起動直後の約8秒だけ画素密度が下がる挙動は閾値が☆暫定（実機調整前提）であり、必要なら本編プレイ開始時に制御器を初期化して起動時の一時低下を判定対象から外す調整が可能（要ユーザー判断）。

## 目視確認
開発サーバで次を確認した（ユーザー目視）。閲覧モード `perf-budget.html?view=1`（キー0〜3で段階切替）で、各劣化段階の見え方（画素密度の精細さ・ブルームのにじみの強さ）は全段階とも許容範囲。段階3（ブルーム無効）でシーンの色味は段階0と比べて保たれている（発光のにじみが消えるだけで全体の色・明るさは同等＝最終出力パスの色管理が効いている）。本編アプリ `?smoke=1` の湖のシーン（反射・ブルーム・中心の光柱）は回帰なく正常に描画される。

## スコープ外（理由）
反射解像度の実行時縮退（#97）。描画物体の間引き（§3.8第3段）。実機平均55以上の現地計測（#19・#97）。ブルーム無効化前の強度フェード（強度の実行時設定APIが要るため後続）。

## レビュー
Codex（読み取り専用）にプラン段階で「0ベース案＋二重チェックレビュー」を委譲。P0（適用結果の詳細化・段階変化時のみ適用・スモークの描画命令検査）とP1（復帰滞留の非対称化・タブ復帰のreset・適用順固定）を反映済み。実装後にCodexへ未push実装の妥当性レビューを再委譲し、致命的問題なし。指摘P1（滑らかさがスモークでログ止まり・描画命令<100がVRMなし診断のみ）に対し次を追加した。`rendering-perf-smoke.mjs` へ「各遷移で1レバーだけ変化」の決定的検証と、段階適用直後フレーム時間の上限200ミリ秒の回帰検出（性能の合否＝実機平均フレーム率ではなく、段階適用が過度に重い処理になっていないことの検出。実測最大の数十倍を上限とし偽陽性を避ける）を追加。`rendering-smoke.mjs` へ本編アプリ経路の描画命令<100と劣化段階配線の検証を追加。「滑らか」の本質的機構（1レバー変化・振動なし・滞留）は決定的に検証済み。指摘P2（タブ復帰の体感）と実機平均55・VRM常在込みの描画命令計測は実機確認事項として #19・#97 へ委譲。

## 提出状況
ブランチ `worktree-issue-18-perf-budget` にコミットして origin へ push 済み。Pull Request #154（base: main、本文に Closes #18）を作成済み。

## 次の作業
実機（実GPU・モバイル基準プロファイル）で本編アプリ `?smoke=1` の平均55以上・段階安定を計測する軽量確認（#19）、および VRM 常在を含む正式な描画性能ゲート（#97）。`applyPerformanceLevel` の段階ラダーは実機計測で各段階の効き（DPR低下とブルーム縮小のFPS改善量）を確認して必要なら閾値・滞留を調整する。
