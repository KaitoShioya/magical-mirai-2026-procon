# config — 定数・調整値と楽曲ロード設定

- **責務**: 定数・調整値と楽曲ロード設定。`songs.ts`（6曲のURLと音楽地図ID。本Issueで作成済み）と、`tuning.ts`（判定窓・スロット数・タップ上限などの調整値。Issue #6 で作成）。
- **禁止依存**: 描画・判定などの論理を持たない（値の定義のみ）。
- **担当Issue**: `songs.ts` は #1（最小）/ #5（拡張）、`tuning.ts` は #6
- 詳細は `docs/decisions/architecture.md` を参照する。
