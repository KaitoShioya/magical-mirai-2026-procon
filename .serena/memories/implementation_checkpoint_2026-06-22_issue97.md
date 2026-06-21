# 実装チェックポイント（2026-06-22・Issue #97）

**状態: 描画性能ゲート（Issue #97）の実装を完了。ブランチ `worktree-issue-97-render-perf-gate`。型検査・全テスト（1143件）・開発ビルド・本番ビルド除外・実GPUでのゲートE2E実行まで確認済み。PR作成とマージはこの後。**
**用途**: セッション喪失時の復帰点（実装フェーズ）。前提のハーネス基盤は [[implementation_checkpoint_2026-06-19_issue95]]、前例の空間品質ゲートは [[implementation_checkpoint_2026-06-22_issue100]]、自動劣化制御（床定数の出所）は [[implementation_checkpoint_2026-06-21_issue18]]、中心キャラクター常在は [[implementation_checkpoint_2026-06-21_issue92]]、開発基盤の現状は [[dev_infrastructure_notes]]。

## 位置づけ
M9「品質保証（ローカル継続的検査）」のクリティカルパス（P0-critical）。VRM常在を含む計測ケースで毎秒フレーム数の平均と下位5パーセンタイルの両方が60以上かを、ローカル実GPUで手動実行して合否判定するゲート。仕様の正典は docs/research/08 の3節・6節、docs/research/03 の6節。Issue #18・#19・#85 と連携。

## 最重要の意思決定（採用理由を先に述べる・ユーザー確認済み3件を含む）
- **計測ページは新規専用ページにする（ユーザー確認済み）**。既存ページにVRM常在描画とFPS計測フックを両立するものが無いため（center-figure.htmlはミクを描くがフック無し、perf-budget/posteffectsはフック有りだがミクなし）。runbook §7 の「別情景のゲートは専用診断ページに固有フックを置く」前例（spatial.html/readability.html）に従う。
- **判定プロファイルはデスクトップ実GPUにする（ユーザー確認済み）**。モバイル相当（390×844・DPR3・6倍CPU絞り）はローカルで60未達が Issue #19 で「仕様」と確定済みのため、参考行として表示し終了コードに算入しない。モバイル実機の正式判定は Issue #85 が担う（research/03 §6 が正式判定を実機と定める）。実機実行で実際にモバイル相当は平均15.2・下位5%13、判定行のデスクトップは60.2・60で exit=0 を確認した。
- **最低フレーム下限は下位5パーセンタイル55にする（ユーザー確認済み）**。値は Issue #18 の縮退発火閾値 PERF_DOWNSHIFT_FPS（src/rendering/constants.ts、55）を流用し、操作が破綻する床として両者を連携させ二重管理を避ける。指標を下位5パーセンタイルにするのは、単一の最悪フレーム（生最低）は雑音が大きく合否を不安定にするのに対し、下位5パーセンタイルは仕様（08 §3）が合否に用いる頑健な下側指標のため。生最低は参考併記。
- **二層判定（目標は格下げ可・床は格下げ不可）**。spatial gate の前例に整合させ、既定は厳格、`--warn-only` で目標未達を警告化し終了コード0、ただし床割れは `--warn-only` でも終了コード1（research/08 §6 の格下げ不可）。不成立理由は床割れを先頭に全列挙してから1回だけ終了する。
- **計測フックは読み込み完了後にだけ公開する**。ハーネスの waitForReady が window.__fps の存在を準備完了の条件にするため、VRMと舞台土台の読み込み（いずれも Promise<boolean>）を Promise.all で待ってからフックを公開し、標本窓を必ずVRM常在状態に限る。
- **標本刻みは500ミリ秒**。計測ツール本体 src/tools/perf/main.ts:246 と同じ刻みで、12秒で24標本となり下位5パーセンタイルが生最低と分離する標本数21以上を満たす（postEffects診断の1秒刻みは踏襲しない）。

## 実装した内容
- 新規 `scripts/harness/fps-metrics.mjs`: 純粋関数 `evaluateFpsAcceptance({avgFps,p5Fps})` と `DEFAULT_FPS_THRESHOLDS`（targetAvgFps:60・targetP5Fps:60・floorP5Fps:55）。目標未達（格下げ可）と床割れ（格下げ不可）を分離して返す。Playwright非依存。
- 新規 `scripts/harness/fps-metrics.test.mjs`: vitest 6件。境界値（59.9/60、54/55）と、床値が constants.ts の PERF_DOWNSHIFT_FPS と一致することの出所検査（constants.ts を文字列読みして照合。src をモジュールimportしない方針のため）。
- 新規 `performance.html` + `src/rendering/diagnostics/performance/main.ts`: createRenderRoot でVRM常在情景を連続描画。クエリ miku/reflectMiku/bloom/refl/terrain/level（miku=0 のとき reflectMiku 無視）。読み込み完了後に __fps/__avgFps/__fpsSamples/__resetFps を500ms刻みで公開、__drawCalls/__pixelRatio を state() から公開。beforeunload で dispose 後にフック削除。
- 新規 `scripts/performance-quality.mjs`（`npm run quality:fps`）: launchGpuBrowser で実GPU起動。判定行（デスクトップVRM満載）＋参考行（モバイル相当・VRMなし・反射除外・ブルーム除外）。evaluateRunAcceptance で計測信頼性、判定行のみ evaluateFpsAcceptance で閾値判定。二層終了コード。`--warn-only`・`--allow-unknown-renderer`・`--skip-reference`・`--duration` 対応。レポートを scripts/.quality-out/performance-gate.json へ。
- 更新 `vite.config.ts`: app以外の入口へ performance.html を追加（本番ビルド --mode app では除外。確認済み）。
- 更新 `package.json`: quality:fps を追加。
- 更新 `src/types/globals.d.ts`: __drawCalls・__pixelRatio のコメントに performance.html を公開元として追記（型は不変）。
- 更新 `docs/runbooks/quality-harness.md`: §10 描画性能ゲートを追記、§7 の例示に performance.html を追加。
- 更新 `src/rendering/README.md`: 診断ページ一覧へ diagnostics/performance/ を追加。

## レビューと検証（事実）
- 計画段階で Codex と通常subagent（Planエージェント）の二重チェックレビューを実施。両者の指摘（vite除外機構・フック公開順序・mount非同期・state()安全性・矛盾クエリ・段階値域・--warn-only常用・床値drift検出・標本刻みの踏襲元・参考行のVRM有無と対象ページ・契約コメント更新・理由列挙順）をすべて実ファイルで検証して反映した。
- 型検査（npm run typecheck、strict）合格。単体テスト（vitest）全1143件合格（新規6件含む）。開発ビルド合格で dist に performance.html を生成、本番ビルド（build:app）では performance.html を除外、index.html は生成を確認。
- 実GPU（NVIDIA GeForce RTX 3050 / ANGLE Direct3D11）でゲートをE2E実行し、判定行60.2・60で成功・exit=0、モバイル相当参考行15.2・13は「参考（終了コードに影響しない）」で exit に算入されないことを確認した。

## 次の一手
- PR を push（base main、Closes #97）。
- 閾値（目標60・床55）の最終確定は Issue #104。モバイル実機の正式判定は Issue #85。VRMの造形や灯しの本実装を載せた後は閾値の再較正が要る。
