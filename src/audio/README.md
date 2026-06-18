# audio — 操作音

- **責務**: Web Audio による操作音。コードトーン格子（その瞬間の和音の構成音をY軸へ割り当てる）と、`AudioContext.currentTime` を使う先読みスケジューラ。
- **禁止依存**: ゲームの時計（再生位置）と音声出力の時計（`AudioContext.currentTime`）を混同しない。`profiles`・`tools` を import しない。
- **担当Issue**: #52
- 詳細は `docs/decisions/architecture.md` を参照する。
