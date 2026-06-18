# chart — ノーツ譜面のデータ模型

- **責務**: ノーツ譜面のデータ模型と時刻索引。得点や描画の論理は持たない。
- **禁止依存**: `profiles` を import しない。`scoring`・`rendering` に依存しない。`tools` を import しない。
- **担当Issue**: #38 / #40
- 詳細は `docs/decisions/architecture.md` を参照する。
