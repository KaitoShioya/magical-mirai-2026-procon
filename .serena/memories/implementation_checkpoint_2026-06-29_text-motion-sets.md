# 実装チェックポイント 2026-06-29 テキストモーション差し替え可能セット（M3）

## 状態
ブランチ `feat/text-motion-sets-24-25-26-27-28-30-32`、コミット e5231ba、**PR #217**（base=main、mergeable）。
型検査3構成クリーン、単体テスト1925件すべて成立、静的ビルド成功（Node 22）。対象 Issue #24 #25 #26 #27 #28 #30 #32。
設計書 `docs/decisions/visual-expression-design.md` §2・§5・付録A に基づく。

## 完成・検証済み（PR #217 に含む）
- イージング基盤 `easing.ts`（付録A全41系統＋出入り合成＋重ね掛け＋番号と名前の解決）。
- モーションセット抽象 `motionSet.ts`（登場と退場の進行度を1要素内部で単一値へ合成）。
- 19の差し替え可能セット（`effects/*`）とカタログ `effects/motionSetCatalog.ts`。
  - 8文法の実演出: charSmash・letterSpacingSpread・circularMultiply・verticalStretchSwirl・afterimageTrail・fadeBlackout・emotionLoudness・depthFlight。
  - 追加技法: axisMove・scaleSoftSmash・squashStretch・blink・floatJitter・wordRotation・unitOpacity・initialFlash。
  - 変形3種: swirlDeform・waveDeform・vortexScatterTransition（`effects/deformVortex.ts`）。
  - 追加技法11件を `effectAssignment.ts` の EffectGrammar・EFFECT_ID・EXPECTED_TARGET_UNIT へ登録し譜面追加から到達可能化（既定規則は不変）。
- 変形塊配置の6点横断改修（DeformContribution.massPlacement→合成器→ComposedDeformState→適用層 setPosition/setScale3）。
- clip経路（AttributeContribution.clip＋ComposedGlyphState.clip＋適用層＋engine単一文字取っ手 setClipRect/clearClip＋troika型宣言＋`clipSplit.ts` 部首分解と縦横ブラインドの相補矩形計算）。
- `quantizeTime.ts`（コマ落ちの時刻量子化）。
- 単位別駆動の費用ループ機構 `unitEffectDriver.ts`（仮合成→accountBudget→planDegrade→再合成→applyComposed、合成対象の生命周期、診断）。
- 後方互換の汎用駆動: `conductor.ts` に任意依存 resolveEffect?/bloomThreshold?。供給時は読ませる行へ幾何と不透明度を汎用経路で適用、未供給は従来スマッシュ。
- 後処理: `glitchMath.ts`（横ずれの純粋計算）・`postprocessEnvelope.ts`（強度の包絡）・`postEffectShader.ts` の GLITCH_SHADER と uInvert（句読点反転）・`bloom.ts` のグリッチパスと各セッター・`constants.ts` の PERF_LEVELS.glitchEnabled・`src/app/postprocessMotionSet.ts`（色ずれ/グリッチ/句読点反転の駆動記述子）。
- 目視確認の診断ページ `motion-sets.html` と `diagnostics/motionSets.ts`（全19セットを切り替え、登場保持退場を繰り返して目視。提出ビルドは入口から除外）。

## 目視で調整した運動量（診断ページで4ラウンド調整）
判断は設計書の質的目標を画面占有率へ翻訳して行った。主な確定値（★暫定、実機で再調整可）:
- スマッシュ: 山倍率2.5、減衰を固定300ミリ秒（表示窓連動を廃止）で150ミリ秒で落ち着く。
- 直線移動: 画面外±18、登場退場各400ミリ秒（重ね掛けで中央を停止せず通過）。
- 円状増殖: 半径7・写し5・塊回転なし（写し正立で読める）。
- 残像: 一方向ドリフトで尾を後方へ、5枚・歩幅0.9。
- 奥行き: 開始 z=-30・350ミリ秒。押し潰し: 移動方向（横）へ伸ばす。変形（渦）: ねじれ0.3ラジアン（可読維持）。
- 診断ページ: word/phrase の字間を字幅相当にし（一括描画層は文字を index×字間に置くため）、単位別の短い表示窓と単調な声量ランプで提示。

## 本変更に含めない（別途・後続）
本編の通しプレイへの結線。読ませる行を合成経路で駆動する結線、`playScreen` への resolveEffect 結線（現状 charSmash のみ登録）、全画面暗転を合成最前面のオーバーレイとして描く実装、後処理の本編有効化と曲信号からの駆動。本編描画の見えを変えるため、Playwright スモークでの視覚検証と合わせて別途行う。機構（unitEffectDriver・postprocessMotionSet・conductor の汎用駆動）と各セットは本変更で完成済み。

## 検証コマンド
`npm run typecheck` と `node_modules/.bin/vitest run`（Node 22／.nvmrc）。診断ページは `npx vite` 起動後にブラウザで `localhost:<port>/motion-sets.html`（Windows では localhost を使う。vite が IPv6 の localhost に束縛され 127.0.0.1 が届かないため）。
進捗の正典は [[implementation-progress]]。
