# scoring — 判定と得点

- **責務**: 判定窓、目的関数（精度×多様性係数×投下倍率＋コンボ）、ランクの百分位変換、自己最高記録（localStorage）。
- **禁止依存**: `profiles` を import しない（判定窓やJUSTのパターンは値として外から受け取る）。`rendering`・`tools` を import しない。
- **担当Issue**: #48 / #42 / #50 / #51 / #55 / #56
- 多様性係数 D の発火判定（`diversityCoefficient.ts`、Issue #42）は本層が提供し、目的関数への結線と本番の逓減量の確定は #56 が行う。
- 詳細は `docs/decisions/architecture.md` を参照する。

## タップ判定エンジン（Issue #48）の結線契約

判定は時間（ミリ秒）だけで行い、軌跡上距離は使わない（出典 `docs/research/04-ux-and-chart-design.md` §1）。公開窓口は `index.ts`。呼び出し側（#59）は次の契約を守ること。

- **スロット番号は0始まりへ統一**: 入力タップは `Reaction.slotIndex`（0始まり）をそのまま `TapSample.slot0` に渡す。ノーツの正解スロットは `profiles` の `Note.slotIndex`（1始まり）を `note.slotIndex - 1` で0始まりへ変換して `JudgmentNote.slot0` に渡す。
- **判定基準時刻は拍格子時刻**: `JudgmentNote.timeMs` には `beats[note.beatIndex].startTimeMs`（拍格子時刻）を渡す。演出実時刻 `note.timeMs` を判定へ渡してはならない（スキーマの二系統分離。将来のサブ拍演出 #39・#43 で判定がずれるのを防ぐ）。
- **音楽時刻はゲーム時計**: `FrameTimeSample.musicPositionMs` には engine のゲーム時計 `clock.gameTimeMs`（`player.timer.position` を平滑化・単調化・ずれ補正した値）を渡す（出典 `docs/decisions/architecture.md` の時刻系の決定「判定・得点・ノーツの配置はこの時計で行う」）。
- **信頼性フラグ**: `TapSample.reliableMusicTime` は `timeSource.isReady()` かつ `timeSource.isPlaying()` かつ当該フレームが再同期でない（`FrameOutcome.didResync` が偽）ときだけ真にする。偽のとき `judgeTap` は床のタップを返す。
- **可視下限は描画層が与え、#51 は0以上1以下の反応強度を与える**: `judgeTap` は全タップに結果を返すこと（床保証）だけを担う。床のタップ（`isFloor` が真）でも、呼び出し側が元の `Reaction` を対にして渡せば下流（音 #52・光点）が発音と光点を生成できる。光点が完全消失しない可視下限は描画層の写像が与え、その具体的な数値は描画層の定数が所有元であるため本ファイルには書かない。
- **音程精度の0と0.2は別物**: 床のタップ（対応ノーツ無し、または信頼できないフレーム）の `pitchAccuracy` は0であり、これは「比較する正解スロットが存在しない」ことを表す。対応ノーツが有って音程スロットを外したタップの `pitchAccuracy` は床値0.2（`PITCH_MISS_FLOOR`）であり、これは「正解スロットは存在するが一致しなかった」ことを表す。#51 反応強度はこの2値をそのまま区別して明るさへ写す。
- **較正の補正値は #50 が所有**: `JudgeOptions.calibrationOffsetMs` に較正値（既定0）を渡す。較正値の測定・保存・読み出しは #50 の `calibrationStore.ts`（`loadCalibrationOffsetMs` で読み出し、`saveCalibrationOffsetMs` で保存）。本編プレイの結線 #59 はプレイ開始時に `loadCalibrationOffsetMs()` を1回呼び、戻り値を `JudgeOptions.calibrationOffsetMs` へ渡す。プレイ中に較正値は変わらないため動的な再読み込みは不要。

## 反応強度（Issue #51）の契約

判定結果を、光点（蝶・ひまわり）の大きさと明るさを駆動する0以上1以下の強度の組へ写す純粋関数。公開窓口は `index.ts`（`reactionStrength` 関数と `ReactionStrength` 型）。

- **出力は2チャンネル独立**: `size`（大きさを駆動する0以上1以下の強度）はタイミング精度のみに由来し、`brightness`（明るさを駆動する0以上1以下の強度）は音程精度のみに由来する（出典 `docs/idea/concept-final.md` §6「タイミング精度→大きさ、音程精度→輝度」）。スコアへ寄与する単一の総合値はここでは作らない（#55・#56 が各精度とJUSTを直接消費する）。
- **写像は恒等**: 精度をそのまま強度として通す（丸めと非有限値の防御のみ施す）。受け入れ基準「精度が高いほど光点が大きく明るい」を単調増加で満たし、新しい閾値や係数を持ち込まない。
- **音程精度の3状態をそのまま区別**: 床のタップ（音程精度0）→明るさ強度0、音程を外したタップ（音程精度0.2）→明るさ強度0.2、音程完全一致（音程精度1.0）→明るさ強度1.0。床が最も暗く、外し音がやや明るく、完全一致が最も明るい階調になる。
- **非有限値は0へ倒す**: `timingAccuracy` と同じ規約で判定を止めない。有限値だけを下流へ流し、下流の例外を未然に防ぐ。
- **実寸への変換は描画層が担う**: `size`・`brightness` は実寸の大きさ・輝度ではない。描画層の `reactionToScale`・`reactionToBrightness` がこの強度を実際の表示範囲へ変換する。呼び出し側（#59）は `reactionStrength` の出力を描画層の写像へ渡して蝶・ひまわりを駆動する。

## 多様性係数（Issue #42）の #56 向け結線契約

`computeDiversityCoefficient` は1タップ分の多様性係数 D を返す純粋関数で、目的関数への結線は #56 が行う。#56 は次の契約を守ること。

- **発火対象の限定は #56 が行う**: 多様性逓減を発火させるのは反復区間（`diversityZones` の内側）のタップに限る。本関数はそのタップが区間の内側かどうかを判定しないため、区間の内外の判定と発火対象の選別は #56 側で行う。
- **前回の選び方は #56 が行う**: `previousJustSlot`・`previousOperationSlot` にどの前回区間の値を渡すか（三部形式のどの区間を「前」とするか）は #56 が `diversityZones` の役割順から決める。前回が無い初回は両者に `undefined` を渡し、本関数は 1.0 を返す。
- **スロットは0始まりへ統一**: 4つのスロットは判定エンジンと同じ基数で渡す。正解スロットは `Note.slotIndex`（1始まり）を `note.slotIndex - 1` で0始まりへ変換し、操作スロットは `Reaction.slotIndex`（0始まり）をそのまま渡す。
- **逓減量は #56 が与える**: `reductionFactor`（有効範囲 0以上1未満）の本番値は #56 が確定する。
