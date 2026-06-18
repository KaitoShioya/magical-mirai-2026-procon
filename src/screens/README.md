# screens — 画面状態の有限状態機械

- **責務**: 5画面状態（題名・準備・プレイ・結果・再挑戦）の有限状態機械。各状態の onEnter / onUpdate / onExit と遷移。
- **禁止依存**: ルータのライブラリを使わない。`tools` を import しない。判定・得点の論理は `engine`・`scoring` に委ね、ここでは持たない。
- **担当Issue**: #2
- 詳細は `docs/decisions/architecture.md` を参照する。
