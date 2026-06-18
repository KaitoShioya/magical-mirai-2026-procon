# utils — 純粋関数

- **責務**: 副作用のない純粋な補助関数。破棄の木構造走査（dispose）、数値計算、イベントの仲介など。
- **禁止依存**: 特定のサブシステム（`rendering`・`engine` 等）に依存しない。`tools` を import しない。
- **担当Issue**: 共通（各Issueが必要に応じて追加）
- 詳細は `docs/decisions/architecture.md` を参照する。
