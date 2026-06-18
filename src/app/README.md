# app — アプリ統括

- **責務**: TextAlive の生成・エンジン・画面遷移を結線し、全体の生成と起動順序を司る。
- **禁止依存**: `tools` を import しない。曲固有の内容は `profiles` から直接読まず、読込済みデータとして受け取る。
- **担当Issue**: #4（TextAlive結線）/ #3（ループ結線）/ #2（画面遷移結線）
- 詳細は `docs/decisions/architecture.md` を参照する。
