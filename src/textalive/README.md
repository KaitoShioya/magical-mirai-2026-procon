# textalive — TextAlive 連携

- **責務**: TextAlive Player の生成、ライフサイクル（onAppReady→onVideoReady→onTimerReady→onTimeUpdate）の配線、楽曲ロード失敗時のユーザー導線。
- **禁止依存**: `tools` を import しない。判定・得点の論理を持たない（時刻は値として供給するのみ）。
- **担当Issue**: #4
- 詳細は `docs/decisions/architecture.md` を参照する。
