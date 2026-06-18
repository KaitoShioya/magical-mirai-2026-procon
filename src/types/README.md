# types — 共有型・環境型の宣言

- **責務**: 共有する型と環境の型宣言。本Issueで `vite-env.d.ts`（注入する環境値）・`globals.d.ts`（開発ツールが公開する window のグローバル）・`troika-three-text.d.ts`（型を同梱しないライブラリの宣言）を作成済み。
- **方針**: ドメインの型（ノーツ・曲プロファイル等）は各担当Issue（#34・#38 等）が定義し、本Issueでは先取りしない。
- **担当Issue**: #1（環境型）/ 以降は各担当
- 詳細は `docs/decisions/architecture.md` を参照する。
