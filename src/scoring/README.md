# scoring — 判定と得点

- **責務**: 判定窓、目的関数（精度×多様性係数×投下倍率＋コンボ）、ランクの百分位変換、自己最高記録（localStorage）。
- **禁止依存**: `profiles` を import しない（判定窓やJUSTのパターンは値として外から受け取る）。`rendering`・`tools` を import しない。
- **担当Issue**: #48 / #55 / #56 / #42
- 多様性係数 D の発火判定（`diversityCoefficient.ts`、Issue #42）は本層が提供し、目的関数への結線と本番の逓減量の確定は #56 が行う。
- 詳細は `docs/decisions/architecture.md` を参照する。

## タップ判定エンジン（Issue #48）の結線契約

判定は時間（ミリ秒）だけで行い、軌跡上距離は使わない（出典 `docs/research/04-ux-and-chart-design.md` §1）。公開窓口は `index.ts`。呼び出し側（#59）は次の契約を守ること。

- **スロット番号は0始まりへ統一**: 入力タップは `Reaction.slotIndex`（0始まり）をそのまま `TapSample.slot0` に渡す。ノーツの正解スロットは `profiles` の `Note.slotIndex`（1始まり）を `note.slotIndex - 1` で0始まりへ変換して `JudgmentNote.slot0` に渡す。
- **判定基準時刻は拍格子時刻**: `JudgmentNote.timeMs` には `beats[note.beatIndex].startTimeMs`（拍格子時刻）を渡す。演出実時刻 `note.timeMs` を判定へ渡してはならない（スキーマの二系統分離。将来のサブ拍演出 #39・#43 で判定がずれるのを防ぐ）。
- **音楽時刻はゲーム時計**: `FrameTimeSample.musicPositionMs` には engine のゲーム時計 `clock.gameTimeMs`（`player.timer.position` を平滑化・単調化・ずれ補正した値）を渡す（出典 `docs/decisions/architecture.md` の時刻系の決定「判定・得点・ノーツの配置はこの時計で行う」）。
- **信頼性フラグ**: `TapSample.reliableMusicTime` は `timeSource.isReady()` かつ `timeSource.isPlaying()` かつ当該フレームが再同期でない（`FrameOutcome.didResync` が偽）ときだけ真にする。偽のとき `judgeTap` は床のタップを返す。
- **最小光点の下限値は #51 が与える**: `judgeTap` は全タップに結果を返すこと（床保証）だけを担う。床のタップ（`isFloor` が真）でも、呼び出し側が元の `Reaction` を対にして渡せば下流（音 #52・光点 #51）が発音と最小光点を生成できる。
- **音程精度の0と0.2は別物**: 床のタップ（対応ノーツ無し、または信頼できないフレーム）の `pitchAccuracy` は0であり、これは「比較する正解スロットが存在しない」ことを表す。対応ノーツが有って音程スロットを外したタップの `pitchAccuracy` は床値0.2（`PITCH_MISS_FLOOR`）であり、これは「正解スロットは存在するが一致しなかった」ことを表す。#51 反応強度がこの2値を区別して光点の輝度へ写すかは #51 側で定める。
- **較正の補正値は #50 が所有**: `JudgeOptions.calibrationOffsetMs` に較正値（既定0）を渡す。

## 多様性係数（Issue #42）の #56 向け結線契約

`computeDiversityCoefficient` は1タップ分の多様性係数 D を返す純粋関数で、目的関数への結線は #56 が行う。#56 は次の契約を守ること。

- **発火対象の限定は #56 が行う**: 多様性逓減を発火させるのは反復区間（`diversityZones` の内側）のタップに限る。本関数はそのタップが区間の内側かどうかを判定しないため、区間の内外の判定と発火対象の選別は #56 側で行う。
- **前回の選び方は #56 が行う**: `previousJustSlot`・`previousOperationSlot` にどの前回区間の値を渡すか（三部形式のどの区間を「前」とするか）は #56 が `diversityZones` の役割順から決める。前回が無い初回は両者に `undefined` を渡し、本関数は 1.0 を返す。
- **スロットは0始まりへ統一**: 4つのスロットは判定エンジンと同じ基数で渡す。正解スロットは `Note.slotIndex`（1始まり）を `note.slotIndex - 1` で0始まりへ変換し、操作スロットは `Reaction.slotIndex`（0始まり）をそのまま渡す。
- **逓減量は #56 が与える**: `reductionFactor`（有効範囲 0以上1未満）の本番値は #56 が確定する。
