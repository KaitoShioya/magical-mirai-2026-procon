# tools — 開発ツール（アプリの利用者体験には含めない）

- **責務**: 開発用のツール。`analysis/`（楽曲データ解析。`analysis.html` の入口）と `perf/`（描画性能検証。`prototype.html` の入口）。本Issueで現行試作から移行済み。ビルド成果物には出力されるが本体から参照されない。提出時に公開するか否かは Issue #7 で確定する。
- **依存の向き**: 本体中核（`app`・`engine` 等）は `tools` を import しない。`tools` は `config/songs.ts` などの共有設定のみ import してよい。依存の向きを本体から開発ツールへ流さない。
- **守る契約**: `analysis` は `window.__songMap`・`document.title="DUMP_READY"`・`#status` を維持（`scripts/dump-songmap.mjs`）。`perf` は `window.__fps`/`__avgFps`/`__fpsSamples`/`__resetFps` とクエリノブを維持（`scripts/prototype-fps.mjs` と品質検査ハーネス `scripts/harness`）。`__fpsSamples` は区間ごとの生標本を複製して返し、ハーネスが下位パーセンタイル算出に用いる。
- **担当Issue**: #1
- 詳細は `docs/decisions/architecture.md` を参照する。
