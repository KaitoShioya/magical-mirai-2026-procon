# 実装チェックポイント 2026-06-19 Issue #20（SDF動的文字エンジン本実装）

状態: ブランチ `feat/issue-20-sdf-text-engine`（`origin/main`＝Issue #8 等のマージを含む から作成）に実装完了。型検査・単体テスト196件・両モードビルドが緑。PR作成段階。

## 実装範囲（Issue #20 = M3・P0「troika最小初期化を内包するSDF文字エンジン」）
`src/typography/` を2副領域へ分割し、`kineticText/`（troika製の3次元演出文字エンジン）を実装した。`readableLyrics/`（DOM歌詞、#31）は本Issueでは作らない。

実装ファイル（`src/typography/kineticText/`）:
- `types.ts`・`index.ts` — 公開インターフェース。
- `fontRegistry.ts` — 論理名から実フォント（URLと出典）を引く登録。シーン・演出別の差し替えに対応。
- `warmup.ts` — troika `preloadFont` で距離場を読み込み時に事前生成（暖め）。
- `glyphPool.ts` — 単一文字層の再利用プール。世代番号で解放後・再利用後の古い非同期完了通知を無視する。
- `batchedTextLayer.ts` — 一括文字層（`BatchedText`、フレーズ単位）。同じ世代番号規則。
- `layerLimits.ts` — 同時上限を固定値でなく、文字開始時刻列と表示残存時間から走査算出（`computeMaxConcurrent`・`maxStartsInWindow`・`computeSingleLayerLimit`・`computeBatchedLayerLimit`）。
- `engine.ts` — 登録・暖め・両層を結線。レンダラ非依存で `scene`・`camera` を注入。配置・毎フレームの寿命処理（自動解放）・カメラ正対・破棄・統計。
- `fontCredits.ts` — 主フォントの出典定数。
- `diagnostics/main.ts`＋`stressProfile.ts` — `typography.html` の入口。実エンジンを最小シーン（#8の `constants`・`viewport` 再利用）で駆動し、実測再現（songmap実時刻列再生）と最大負荷の2プロファイルで、1フレームごとの所要時間から平均・下位5パーセンタイル・33ミリ秒超過数・初回表示遅延を `window` に公開。
- 直下: `typography.html`、`scripts/build-font-subset.mjs`（songmap `phrases[].text` から抽出→欠字検証→.woffサブセット生成）、`scripts/typography-fps.mjs`（補助スモーク）。
- 変更: `troika-three-text.d.ts`・`globals.d.ts`・`vite.config.ts`（非appモードに typography 入口追加）・`package.json`・`README.md`・`docs/decisions/architecture.md`・`src/typography/README.md`・`.gitignore`。

## 確定した設計判断（採用理由）
- 配置=`src/typography/kineticText/`: Issueラベル area:typography とM3配下の凝集を優先。エンジンはレンダラ非依存にして拡張性を確保。本編単一キャンバス（#8の `#stage`）への結線は #33/#59 の継ぎ目（本Issue範囲外）。
- フォント=Zen Kaku Gothic New Bold（SIL OFL 1.1）。正典 `docs/research/05` の3候補に限定。troika は .woff2 非対応のため .woff を採用。元フォントは非公開 `assets/fonts-source/`（.gitignore済み）、配布は `public/fonts/` のサブセット.woff＋ライセンスのみ。
- 計測=GPUのある通常起動ブラウザ/実機を正式判定（`docs/research/08` §1: ヘッドレスは非代表）。Playwrightは補助スモーク。

## 検証（証跡あり）
- 型検査緑。単体テスト196件緑。
- 実データ（`docs/analysis/takeover.songmap.json` を `phrases[].words[].chars[]` で走査。next連結は不使用）: 総1157字・一意307字・短音(150ミリ秒以下)54.5%・残存4拍で同時24・最長フレーズ33字・短時間集中 500ミリ秒12/1秒20/2秒31。これらは単体テストで固定。
- troika 0.52.4 の `Text`・`BatchedText`・`preloadFont`・`createTextDerivedMaterial` を実 import で存在確認。
- フォント: 難読漢字 `迸`(U+8FF8)・`嗤`(U+55E4) を収録。サブセット 2260KB→57KB・欠字0。
- 両モードビルド緑。`build:app` で `typography.html` 除外・フルフォント非同梱を確認。
- ヘッドレスPlaywrightで起動・エラー無し、日本語字形が豆腐なく描画。

## Codexレビュー（3回）の反映
計画3回＋実装2回のレビューを反映。実装レビューで指摘された重大2点（元フォントのPR混入＝.gitignore追加、`randomGlyphPosition` のNaNバグ＝0以上1未満へ正規化）と軽微2点（一括層テスト追加、ループ折り返しの残存文字解放）、さらに軽微2点（スモークのエラー時失敗終了、短時間集中3値のテスト追加）を解消済み。

## 未完（設計上、別途必要）
- 性能☆目標（平均55fps以上・単発落ち5回未満・初回表示遅延100ミリ秒未満）の正式判定はGPU実機での計測が必要。ヘッドレス（SwiftShader）では非代表値。
- 本編の単一描画領域への結線は #33/#59（`RenderRoot` への `scene`/`camera` 公開または `add`/`remove` の最小拡張を前提条件として明記済み）。

## 次の着手
GPU実機での性能正式判定 → 必要なら最適化反復。並行して M3 後続（#23 スマッシュ・#29 粒度切替・#33 譜割り など）と M1/M2 後続。
