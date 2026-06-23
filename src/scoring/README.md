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

## 得点合成・ランク（Issue #55）の結線契約

タップ1回の得点 `a × D × M + combo` の合成、総合得点 S、固定閾値ランク C/B/A/S、簡易百分位を担う。公開窓口は `index.ts`。呼び出し側（#56・#59）は次の契約を守ること。

- **素点 a は本層が合成する**: `tapBaseScore(judgment)` がタイミング精度と音程精度から素点 a（0以上1以下）を作る。重みは等重み（各0.5）で本層が所有し tuning.ts に置かない。
- **多様性係数 D と投下倍率 M は呼び出し側が渡す**: `reduceScore` の入力 `{ a, diversity, multiplier, result }` の diversity（D）は `computeDiversityCoefficient`（#42）、multiplier（M）は `deploymentMultiplier`（#54）の戻り値を呼び出し側が算出して渡す。本層は合成式と集計だけを担い、D の発火区間（diversityZones）と M の投下タイミングは #56 が決める。D は0以上1以下で、0は最大逓減の有効値として得点を0にする。M は1以上2以下で、1未満は1へ倒れる。
- **combo は両JUSTで継続・全体で再正規化**: combo は両JUST（タイミングと音程の両方が満点窓）のタップだけ連続走長を伸ばす。`finalizeScore` が combo 総和を `baseTotal × (p ÷ (1 − p))`（既定では上限割合 p は0.10のため `baseTotal × (0.10 ÷ 0.90)`）で頭打ちにし、combo が総得点に占める割合を上限割合以下に厳密に抑える。上限割合 p は `COMBO_SHARE_MAX`（既定0.10）として本層が所有する（tuning.ts に置かない）。
- **ランク帯は百分位で切る**: `rankFromPercentile` が百分位を等幅四分位（25・50・75）で C/B/A/S に分ける（§3.4 の百分位経由に従う）。#66 は百分位を内蔵水準カーブ（累積分布関数）で磨いたが、`rankFromPercentile` の閾値と帯分けの関数の形は変えていない。百分位空間で等幅の帯は、水準カーブが非線形のため得点空間では非等幅になる。
- **百分位は推定（#66 で内蔵水準カーブへ磨き済み）**: 表示する百分位は `percentileFromLevelCurve`（`levelCurve.ts`、内蔵水準カーブによる累積分布関数）で算出し、`percentileBasis` は "builtin-level-curve"。`summarizeScore` と `rankFromScore` はこの関数を使う。`simplePercentile`（"fixed-uniform"）は #55 の参照実装かつ縮退の参照として残す。実際のオンライン順位ではない旨（`PERCENTILE_ESTIMATE_DISCLAIMER`）の Result 画面・README への表示は #66 で実施済み。内蔵カーブの内部アンカーは理論由来の★暫定で、#59 完成後のプレイ検証の実測で差し替える（端点は理論固定）。
- **表示語は上位率に統一**: 内部の百分位は高得点ほど大きい。「上位何パーセント相当」を表示するときは `topPercentFromPercentile`（上位率＝100−百分位）を使い、百分位の値をそのまま「上位◯パーセント」と表記しない（意味の反転を防ぐ）。後続の Result 画面（#74）・成果物PNG（#69）はこの関数を使う。
- **曲非依存**: `theoreticalScoreBounds` は曲固有の絶対値（タップ総数上限 N）を引数 `tapBudget` で受ける。#59 が曲プロファイル（#46）の値を渡す。本層に260・434・見せ場数をハードコードしない。理論最小 Smin は0固定（§3.4「タップしないこと自体は減点しない」より達成可能な最小は0）。
