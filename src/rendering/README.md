# rendering — 単一WebGL描画領域のビュー

- **責務**: 状態を読んで描く「ビュー」。描画器の統括・Renderer設定・透視投影と正射影のカメラ・合成パイプライン（パス順／性能劣化制御／成果物の書出）・シーン組立（光源・水面・舞台土台）・描画対象クラス群（各 update/dispose）・ローダ。
- **禁止依存**: 判定・得点・時刻の論理を持たない（状態を読むだけ）。`profiles`・`tools` を import しない。物体ごとの表示層（`Object3D.layers`）で合成しない（明示的なパス順を使う）。
- **担当Issue**: マイルストーンM2（成果物の書出は #71、舞台土台モデルは #105）
- 将来の内部構成: 描画器統括 / Renderer / cameras / pipeline / scene / entities / loaders。詳細は `docs/decisions/architecture.md`。
