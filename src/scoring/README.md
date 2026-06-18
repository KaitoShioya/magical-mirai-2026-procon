# scoring — 判定と得点

- **責務**: 判定窓、目的関数（精度×多様性係数×投下倍率＋コンボ）、ランクの百分位変換、自己最高記録（localStorage）。
- **禁止依存**: `profiles` を import しない（判定窓やJUSTのパターンは値として外から受け取る）。`rendering`・`tools` を import しない。
- **担当Issue**: #48 / #55 / #56
- 詳細は `docs/decisions/architecture.md` を参照する。
