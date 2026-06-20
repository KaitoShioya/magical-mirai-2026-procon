# 実装チェックポイント 2026-06-19 Issue #20（SDF動的文字エンジン本実装）

状態: ブランチ `feat/issue-20-sdf-text-engine`（`origin/main`＝Issue #8 等のマージを含む から作成）に実装完了。PR #119。型検査・単体テスト196件・両モードビルド・実GPU性能正式判定が緑。受け入れ基準を満たしマージ待ち。

## 実装範囲（Issue #20 = M3・P0「troika最小初期化を内包するSDF文字エンジン」）
`src/typography/` を `kineticText/`（troika製の3次元演出文字エンジン）として実装した。
（2026-06-20 仕様変更で更新: 当時は `readableLyrics/`（DOM歌詞、#31）を別副領域に作らないと記したが、その後DOM主役歌詞層を廃止し、歌詞はキネティックタイポグラフィのみで表示・可読性も文字エンジン自体で担保する方針へ変更した。#31は「可読性処理」へ修正済み。詳細は [[spec_change_checkpoint_2026-06-20_typography]]。）

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

## Codexレビューの反映（計画3回＋実装3回）
- 計画レビュー3回: 配置・フォント・woff2非対応・二層分離・同時上限の式化・ストレス2分割・計測のGPU正式判定化などを反映。
- 実装レビュー1回目: 重大2点（元フォントのPR混入＝.gitignore追加、`randomGlyphPosition` のNaNバグ＝0以上1未満へ正規化）と軽微2点（一括層テスト追加、ループ折り返しの残存文字解放）を解消。
- 実装レビュー2回目: 軽微2点（スモークのエラー時失敗終了、短時間集中3値=500ミリ秒12/1秒20/2秒31のテスト追加＝`maxStartsInWindow`）を解消。
- 実装レビュー3回目（本PRレビュー）: 重大なし・マージ条件付き可。指摘B（合格ログの判定対象が不明確）と指摘A（再生開始時刻の範囲外指定）を解消。指摘C/D（`src/tools` が config 以外を import・`import * as THREE`）は本PRが新規導入した違反でなく、依存規則の趣旨（本体中核が tools を import しないこと）と名前付き取り込み規則（提出本体の容量対策で開発ツールは対象外）に照らし非該当のため本PRでは変更しない。

## 性能の正式判定（実GPUで実施・合格）
`scripts/typography-fps.mjs` を #95 ハーネスと同方式（Chromium 新ヘッドレス＋ANGLE D3D11）で実GPU描画して計測。描画系統名は「ANGLE (Intel, Intel(R) Iris(R) Xe Graphics, Direct3D11)」で非ソフトウェアを確認。
- 平均と単発落ちの判定（実測再現・最悪集中区間 start=58000、12秒）: 平均60fps・下位5パーセンタイル59fps・単発フレーム落ち(33ミリ秒超)0回。☆目標（平均55以上・単発落ち5回未満）を満たす。
- 初回表示遅延の判定（最大負荷＝連続出現でワーカー稼働、実プレイの密な歌詞区間に相当）: 52〜62ms。☆目標100ms未満を満たす。
- 補足: troika のワーカーは単独 sync を後続作業まで遅らせるバッチ挙動があり、時間的に孤立した出現（孤立プローブ）では初回遅延が大きく出る（73〜120ms、曲頭の長い空白後は約1.4秒）。実プレイは歌詞が連続するため代表条件は連続出現側。初回遅延☆は#104で最終確定。
- 計測の前提として診断に2つの暖めを入れた: preloadFontの距離場事前生成に加え、隠し文字を数フレーム描く描画パイプライン暖め（初回syncとシェーダコンパイルの一度きり費用を計測前に支払う）。これで初回遅延が416ms→数十msに低下。

## 未完（設計上、別途必要）
- 本編の単一描画領域への結線は #33/#59（`RenderRoot` への `scene`/`camera` 公開または `add`/`remove` の最小拡張を前提条件として明記済み）。
- 初回表示遅延☆の最終閾値確定は#104。実機（スマホ）での性能確認は#85/#97。

## 次の着手
M3 後続（#23 スマッシュ・#29 粒度切替・#33 譜割り など。いずれも `src/typography/kineticText/` のエンジン上に構築）。本編結線の前提として #33/#59 着手前に「エンジンを本編描画領域へ追加できる最小確認」を必須とする（`RenderRoot` への scene/camera 公開か add/remove 追加）。初回表示遅延☆の最終閾値は #104、実機性能は #85/#97。並行して M1/M2 後続。
