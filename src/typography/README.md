# typography — キネティック・タイポグラフィ

文字に関わる層を `kineticText/` に集約する。演出の文字も読ませる歌詞も、すべてこのエンジンが描く。

## 構成
- `kineticText/` — troika-three-text による3次元の演出文字エンジン。湖面・音符と同じWebGL描画空間に文字を描く。読ませるための歌詞も同じエンジンが描き、別レイヤーや文書要素では描かない。可読性は、発光を抑え、縁取りと影で背景から分離し、十分な表示寸法を確保することでこのエンジンの中で担保する。担当Issue #20（基盤）と後続 #21〜#33。可読性処理は #31。

## 禁止依存
- 判定・得点・時刻の論理を持たない（時刻は数値で受け取る）。`profiles`・`tools` を import しない（出典 `docs/decisions/architecture.md` §5）。
- `kineticText` は描画器（Renderer）を持たず、外から `THREE.Scene` とカメラを注入して使う。本編の単一WebGL描画領域（`rendering` の `RenderRoot`）へ文字を載せる結線は、本編結線の担当Issue（#33・#59）で行う。

## 受け入れ診断の配置（開発ツール配置規約の例外）
`kineticText` の受け入れ診断は `kineticText/diagnostics/`（このサブシステム配下）に置く。開発ツールは通常 `src/tools/` に置くが、`tools` は共有設定（config）以外を import できない（依存規則 §5）一方、診断はエンジン本体を駆動する必要があるため、エンジンと同じ副領域に置く。性能を測る `typography.html` と、可読性のコントラスト比を測る `readability.html`（#31）があり、いずれの入口も本番ビルド（`vite build --mode app`）では配信しない。

- 担当: マイルストーンM3
- 詳細は `docs/decisions/architecture.md` を参照する。
