# profiles — 曲ごとの内容

- **責務**: 曲ごとの内容（譜面・効果音・カメラ軌跡・灯しとJUSTのパターン・見せ場マップ）。読込時に検証する定義（schema）と1曲目の内容（takeover）を内部に置く。これは設定ではなく内容であり、欠落時は明確に失敗させる。
- **依存の向き**: `profiles` は `engine` 等の中核から import されない（中核は曲固有の内容を引数または読込済みデータとして受け取る）。`profiles` 自身は中核を import しない。
- **担当Issue**: 定義 schema は #34、1曲目 takeover は #46
- 将来の内部構成: `schema` / `takeover`。詳細は `docs/decisions/architecture.md`。
