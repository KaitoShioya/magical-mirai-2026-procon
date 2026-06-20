# kineticText — troika製の3次元演出文字エンジン（Issue #20）

troika-three-text を最小初期化で内包し、TAKEOVERの最大文字密度でも描画性能が保てる、後続演出（#21〜#30・#32）の土台となるSDF文字エンジン。

## 公開API（`index.ts`）
- `createKineticTextEngine(deps, internals?)` — フォント登録・暖め・単一文字層・一括文字層を結線したエンジンを作る。`deps` に `scene`・`camera`・`fonts`・`limits` を注入する。可読性の最小表示寸法を扱うときは `viewportPixelHeight`（画面の縦デバイス画素数を返す関数）と `bloomThreshold`（発光抑制の上限、既定0.5）を、可読性下地を有効化するときは `readabilityNeedsBacking` を併せて注入する。`warmUp`・`spawnGlyph`・`spawnPhrase`・`update`・`dispose`・`stats` を持つ。
- `createFontRegistry()` — 論理名から実フォント（URLと出典）を引く登録の仕組み。シーン・演出別の差し替えを担う。`FontEntry.fallbackName` で未収録文字を回す代替フォントの論理名を指定できる。
- `warmUpFont(fontUrl, characters, sdfGlyphSize?)` — 距離場を読み込み時に事前生成（暖め）する。
- `computeMaxConcurrent` / `computeSingleLayerLimit` / `computeBatchedLayerLimit` — 同時上限の算出（文字開始時刻列と表示残存時間から走査）。
- 可読性の計算（純粋関数、Issue #31）: `relativeLuminanceFromSrgbHex` / `contrastRatio` / `clampLuminanceSrgbHex`（発光抑制）/ `minWorldFontSize`・`projectedPixelHeight`（最小表示寸法）/ `resolveReadabilityStyle`（確定可読性指定の生成）/ `DEFAULT_READABILITY_OPTIONS`。#131 はこれらを取り込んで合成の各段で適用する。
- `ZEN_KAKU_GOTHIC_NEW_CREDIT` — 主フォントの出典情報。

## 二層構造（出典 `docs/research/01-kinetic-typography.md` §2・§7）
- 単一文字層（`glyphPool` + 個別 `Text`）: 1文字ごとに独立して動かす。要求は1文字単位（`spawnGlyph`）。
- 一括文字層（`batchedTextLayer` + `BatchedText`）: 多数を1回の描画命令でまとめる。要求はフレーズ単位（`spawnPhrase`）。

両層とも、非同期の配置確定（`sync`）の取り違えを防ぐため世代番号を持ち、解放後・再利用後の古い完了通知を無視する。

## 可読性処理（Issue #31）
読ませる役の文字（`spawnGlyph`・`spawnPhrase` の `readability` を与えた要求）を、発光・ブルーム後処理を含む最終描画画素で背景から分離して読める状態にする。計算は純粋関数の `readability.ts` に、troika への反映は薄い `readabilityRenderer.ts` に分け、#131 は計算部分だけを取り込める。
- 既定スタイルは「明るい塗り＋全周を囲む暗い縁取り＋影」。明るい塗りが暗い背景に、暗い縁取りと影が明るい背景とブルームのにじみにコントラストを与える。発光抑制（`maxBrightLuminance`）の対象は塗りに限り、縁取りと影は暗い分離側で対象に含めない。
- 縁取りは troika の stroke、影は troika の outline のずれとぼかしで描く。使う前に実体での反映可否を実行時に判定し（`detectReadabilityCapability`）、縁取りと影モード／縁取りのみモード／縁取りと下地モードのいずれかへ確定する。
- 最小表示寸法は大きさを決める段で毎フレームの下限として満たす。#131 がある場合は #131 のみが適用し、無い現段階はエンジンのみが適用する（二重適用の衝突を避ける）。
- 未収録文字は、暖めで渡された文字集合への所属で判定し、集合の外は代替フォント（未登録なら troika 既定フォント）へ回す。代替の発生件数とフォント読込失敗件数は `stats` で取得できる。

## 禁止依存
判定・得点・時刻の論理を持たない。`profiles`・`tools` を import しない。three.js は名前付きでのみ取り込む。

## 受け入れ診断（`diagnostics/`）
- `typography.html` の入口 `diagnostics/main.ts` が、最小シーン（#8 の定数・純粋関数を再利用）でエンジンを駆動し、`docs/analysis/takeover.songmap.json` の文字開始時刻を再生（実測再現プロファイル）して性能を計測する。1フレームごとの所要時間から平均・下位5パーセンタイル・33ミリ秒超過数・初回表示遅延を `window` に公開する。
- `readability.html` の入口 `diagnostics/readability.ts` が、可読性モジュールを本物のまま用いて読ませる役の文字を不利な背景の代表集合（暗い背景・明るい背景・暗から明への階調背景・ブルームで強くにじむ明るい発光塊・高周波の模様の背景）の上に描き、発光・ブルーム後処理を通した最終出力段の後の画素から、コントラスト比を計測して `window.__readability` に公開する。`scripts/readability-contrast.mjs` が 4.5:1 以上を判定する（実行例: 開発サーバ起動後に `BASE=http://127.0.0.1:4173 node scripts/readability-contrast.mjs`）。
  - 合否は「文字領域内の明るい塗り（高位百分位）と暗い縁取り（低位百分位）のコントラスト比」（`fillBorderContrast`）で判定する。これは設計の合意「塗りを全周で囲む暗い縁取りに対する塗りのコントラストで背景非依存に読める」に基づく。受け入れ基準の文言「任意背景に対し4.5:1」を、塗りを囲む縁取りが背景非依存のコントラストを与えるという解釈で運用する。塗りと背景・縁取りと背景のコントラスト（`fillVsBackground`・`borderVsBackground`）は合否に使わず参考として併報する。理由は、明るい背景では塗りが背景と同程度の明るさになり得るが、塗りを囲む暗い縁取りが分離を担うため、塗りと背景の直接比較では可読性を正しく表せないからである。

正式な合否はGPUを使う通常起動ブラウザまたは実機で記録する（ヘッドレスは非代表。`docs/research/08-quality-assurance.md` §1）。計測値は同一の実行環境での反復で安定するが、GPUやブラウザが異なると最終画素は厳密には一致しないため、環境をまたいだ厳密一致は保証しない。

## フォント素材
主フォントは Zen Kaku Gothic New Bold（SIL Open Font License 1.1）。`assets/fonts-source/`（非公開）の元フォントから `scripts/build-font-subset.mjs` が歌詞の文字へサブセット化し、`public/fonts/zen-kaku-gothic-new-subset.woff` を生成する。出力形式が .woff なのは troika-three-text が .woff2 非対応で、対応形式のうち .woff が最も圧縮が効くため。
