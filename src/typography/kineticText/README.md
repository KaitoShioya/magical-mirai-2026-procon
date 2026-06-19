# kineticText — troika製の3次元演出文字エンジン（Issue #20）

troika-three-text を最小初期化で内包し、TAKEOVERの最大文字密度でも描画性能が保てる、後続演出（#21〜#30・#32）の土台となるSDF文字エンジン。

## 公開API（`index.ts`）
- `createKineticTextEngine(deps, internals?)` — フォント登録・暖め・単一文字層・一括文字層を結線したエンジンを作る。`deps` に `scene`・`camera`・`fonts`・`limits` を注入する。`warmUp`・`spawnGlyph`・`spawnPhrase`・`update`・`dispose`・`stats` を持つ。
- `createFontRegistry()` — 論理名から実フォント（URLと出典）を引く登録の仕組み。シーン・演出別の差し替えを担う。
- `warmUpFont(fontUrl, characters, sdfGlyphSize?)` — 距離場を読み込み時に事前生成（暖め）する。
- `computeMaxConcurrent` / `computeSingleLayerLimit` / `computeBatchedLayerLimit` — 同時上限の算出（文字開始時刻列と表示残存時間から走査）。
- `ZEN_KAKU_GOTHIC_NEW_CREDIT` — 主フォントの出典情報。

## 二層構造（出典 `docs/research/01-kinetic-typography.md` §2・§7）
- 単一文字層（`glyphPool` + 個別 `Text`）: 1文字ごとに独立して動かす。要求は1文字単位（`spawnGlyph`）。
- 一括文字層（`batchedTextLayer` + `BatchedText`）: 多数を1回の描画命令でまとめる。要求はフレーズ単位（`spawnPhrase`）。

両層とも、非同期の配置確定（`sync`）の取り違えを防ぐため世代番号を持ち、解放後・再利用後の古い完了通知を無視する。

## 禁止依存
判定・得点・時刻の論理を持たない。`profiles`・`tools` を import しない。three.js は名前付きでのみ取り込む。

## 受け入れ診断（`diagnostics/`）
`typography.html` の入口 `diagnostics/main.ts` が、最小シーン（#8 の定数・純粋関数を再利用）でエンジンを駆動し、`docs/analysis/takeover.songmap.json` の文字開始時刻を再生（実測再現プロファイル）して性能を計測する。1フレームごとの所要時間から平均・下位5パーセンタイル・33ミリ秒超過数・初回表示遅延を `window` に公開する。正式な合否はGPUを使う通常起動ブラウザまたは実機で記録する（ヘッドレスは非代表。`docs/research/08-quality-assurance.md` §1）。

## フォント素材
主フォントは Zen Kaku Gothic New Bold（SIL Open Font License 1.1）。`assets/fonts-source/`（非公開）の元フォントから `scripts/build-font-subset.mjs` が歌詞の文字へサブセット化し、`public/fonts/zen-kaku-gothic-new-subset.woff` を生成する。出力形式が .woff なのは troika-three-text が .woff2 非対応で、対応形式のうち .woff が最も圧縮が効くため。
