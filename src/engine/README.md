# engine — 曲非依存の中核

- **責務**: 固定時間刻みのループ（loop）、楽曲再生位置を平滑化・単調化・ずれ補正した時計（clock）、進行中のシミュレーション状態（world）。曲に依存しない。
- **禁止依存**: `profiles` を import しない（曲固有の内容は引数または読込済みデータとして外から受け取る）。`tools` を import しない。
- **担当Issue**: #3
- 将来の内部構成: `loop` / `clock` / `world`。詳細は `docs/decisions/architecture.md`。
