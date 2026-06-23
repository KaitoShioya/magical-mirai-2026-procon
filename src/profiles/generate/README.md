# profiles/generate — 曲プロファイル生成の純粋関数群（Issue #41・#37・#36・#44・#38・#43・#39）

曲解析データ（songmap 由来の素の配列や解決済みの和音区間）から、曲プロファイルの各派生フィールドを決定論的に生成する純粋関数群を置く。
現在は見せ場マップ生成（Issue #41、`showcases` フィールド）、無和音区間の解決（Issue #37）、JUST音程7スロット生成（Issue #36、`slots` フィールド）、タップ総数上限算出（Issue #44、`tapBudget` フィールド）、オンセット選択・ノーツ生成（Issue #38、`notes` フィールドの第1段）、譜面パターン適用（Issue #39、`notePatterns.ts`。`notes` の `slotIndex`・`pattern` を付与）、譜面密度設計（Issue #43、`density.ts`。密度プランは中間データで保存しない）を収める。
いずれも曲プロファイルJSONへの書き込みは行わない（それは #45・#46 の責務）。

## 見せ場マップ自動生成（Issue #41）

- **責務**: 曲解析データ（songmap 由来の素の配列）から、曲プロファイルの派生フィールドを決定論的に生成する純粋関数群。現在は見せ場マップ生成（Issue #41。出力は `SongProfile.showcases`）と無和音区間の解決（Issue #37）を持つ。曲プロファイルJSONへの書き込みは行わない（それは #45・#46 の責務）。
- **入力源**: TextAlive 音楽地図ダンプ（`docs/analysis/<key>.songmap.json`）。声量＝amplitudeCurve、歌詞密度の素＝歌詞各文字の開始時刻、反復区間＝isChorus、拍＝beats。songmap から `ShowcaseInput` への変換は呼び出し側（本Issueはテスト、横展開時は #45 の生成スクリプト）が行い、生成関数は songmap の形に依存しない。
- **依存の向き**: `engine` 等の中核から import されない。`tools` を import しない。本ディレクトリ内は一方向で、`types.ts` は他に依存せず（`Showcase` 型だけスキーマから取り込む）、`showcaseSignals.ts` を最下層のビン幾何ヘルパー（`binCenterMs` 等）として `showcasePeaks.ts`・`showcaseWeights.ts` が参照し、`showcases.ts` が全層を結線する（循環なし）。
- **担当Issue**: #41。後続の #45（生成スクリプト）・#46（TAKEOVERプロファイル生成）が本関数と検証観点を再利用する。

## 公開関数（`showcases.ts`）

- `generateShowcases(input, options?) => Showcase[]` — 見せ場6箇所を生成する。戻り値は時刻昇順・`index` 0始まり連番で、純粋に保つため信頼比などの診断値やスキーマ外フィールドは足さない。
- `selectNonChorusPeaks(input, options?) => NonChorusPeak[]` — 非chorus見せ場のピークと各信頼比（ピーク位置の合成値÷全体最大）を返す。信頼比は `Showcase[]` に載らないため、信頼比を検査する側はこの関数を直接呼ぶ。

## 無和音区間の解決（Issue #37、`noChordResolution.ts`）

- **責務**: コード進行（`Chord[]`）の無和音区間（和音名が `"N"`）を、解決後の実在和音名と埋め方の種別へ解決する。本作の協和は「Y軸スロットにその時刻の和音の構成音を割り当て、どのスロットを叩いても協和する」ことで成立し（`docs/research/07-feasibility-and-parameters.md` §1.1・§1.3）、和音が全域を覆うことが前提のため、和音が無い区間を埋めて協和の保証を全域へ広げる（§1.2）。
- **公開関数**: `resolveNoChordRegions(chords, ncRanges, musicalKey) => NoChordResolution[]` — 各無和音区間の解決結果を和音索引の昇順で返す。`treatment="previous"` は直前の無和音でない区間の和音名、`treatment="scale"` は調の主和音記号（ファ短調なら `"Fm"`）を解決名とする。件数不一致・対応づけの欠落や曖昧・previous の前提不成立・解決名の変換不能は文脈付きの例外で失敗させる。
- **責務境界**: 本関数は解決後の和音名と種別までを返す。解決名から音高を作り、安全付加音（短調は♭7度と11度）を加えた7スロットへ正規化するのは **Issue #36** の責務である。#36 は `NoChordResolution.treatment` が `"scale"` の区間ではFマイナーペンタトニック（ファ・ラ♭・シ♭・ド・ミ♭）を作り、単なるFm三和音へ縮退させてはならない。`treatment` をTAKEOVERプロファイルへ記述し本関数を呼んで `slots` を埋めるのは **Issue #46** の責務である。
- **#36 への申し送り**: #36 着手時は `treatment` を音高生成の入力に含め、`"scale"` 専用のテストを設けること。理由は、この文章による契約だけでは `treatment` の見落とし（`"scale"` 区間のFm三和音への縮退）を型で防げないためである。

## オプション既定値（`types.ts` の `DEFAULT_SHOWCASE_OPTIONS`）

`count=6` / `climaxAnchorMs=189000`（TAKEOVER専用。横展開時は #45 が曲別に渡す）/ `gridMs=1000` / `smoothHalfBins=2` / `amplitudeWeight=0.5` / `densityWeight=0.5` / `minSpacingMs=20000` / `climaxGuardMs=8000` / `peakConfidenceRatio=0.6`（信頼比の診断用の目安下限。選定を止めるゲートではなく、生成ロジックは本値を参照しない。信頼比を見る呼び出し側が使う）/ `windowHalfBeats=16` / `windowHalfMsFallback=5500` / `climaxWeight=1.0` / `nonClimaxWeightFloor=0.4` / `nonClimaxWeightCeil=0.9` / `minWindowMs=2000` / `compositeEqualEpsilon=1e-9`。各値の採用理由は各モジュールの関数コメントに先に明記してある。

## 不変条件（戦略B＝構造保証）

- 見せ場はちょうど `count` 個（既定6）。chorus 反復区間は必ず見せ場になり、その境界は生成処理で動かさない。
- `isClimax` が真の見せ場はちょうど1つで、その `weight` は1.0かつ全見せ場の中で厳密に最大。climax の窓は `climaxAnchorMs`（189秒）地点を覆う（曲長以内のとき終端を延長）。
- 非chorus見せ場は chorus 区間外かつ climax ガード帯外で、互いに `minSpacingMs` 以上離れる。
- chorus 区間数が `count` を超える曲、または非chorusの相異なる適格ピークが不足する曲はエラーで失敗する（黙って契約を崩さない）。
- 入口でオプションと chorus 区間を検査する。個数が1未満・重みの下限が上限を超える・各幅や距離が不正な値、および開始が終了以上の chorus 区間はエラーで失敗させる（誤った設定や不正な区間から検証を通らない見せ場を出さないため）。

## JUST音程7スロット自動生成（Issue #36）

- **責務**: その瞬間の和音から、画面Y軸スロットに割り当てる音高（MIDIノート番号）の並びを決定論的に生成する純粋関数群（`chordToneSlots.ts`）。出力は `SongProfile.slots`（`ChordToneSlotRegion[]`）。
- **入力源**: Issue #37 で無和音区間を解決した実在の和音名。前段 Issue #35（`src/utils/chordPitch.ts`）が和音名を根音と品質へ分解する。
- **依存の向き**: `engine` 等の中核から import されない。`tools` を import しない。`../../utils/chordPitch`（#35）・`../schema/profileSchema`（`ChordToneSlotRegion` 型）・`../../config/tuning`（スロット数定数）だけを取り込む。
- **担当Issue**: #36。後続の #37（無和音区間処理）・#45（生成スクリプト）・#46（TAKEOVERプロファイル生成）が本関数を再利用する。

### 公開関数（`chordToneSlots.ts`）

- `generateSlotPitches(parsed, options?) => number[]` — 構造化済み和音からスロット音高の並びを返す中核関数。
- `chordNameToSlotPitches(name, options?) => number[]` — 和音名から直接スロット音高を返す便宜関数（無和音「N」で例外）。
- `generateChordToneSlots(regions, options?) => ChordToneSlotRegion[]` — 解決済み和音区間の配列から `slots` 配列を作る配列版。

### 並び順の契約と方針

- 出力配列は**MIDIノート番号の昇順**であり、画面Y軸のスロットの並び順そのものではない。画面の上下と音の高低の対応付けは判定・入力層（#48・#49）と入力写像（#47 `coordinateMapping.ts`、スロット番号0が画面最上部）の責務である。配列の並びと画面の並びを取り違えると音程の上下が反転するため、出力はMIDI昇順という意味に固定する。
- 分数和音の低音はスロットの音高に用いない。根音と品質だけを使うため、分数和音は基底和音と同じスロットになる（例: `F/A` は `F` と同じ）。
- 「協和」は本作のゲーム上の定義（和音構成音、または和音構成音と半音衝突しない安全な付加音であり、和音に収まること）であり、音響学の厳密な協和とは別である。
- スロット数は既定7（範囲5〜9、`src/config/tuning.ts`）。安全付加音の区分は長調系=9度と6度、短調系=♭7度と11度で、重複と半音隣接（12を法とする循環距離）を避けて採用する。増三和音はスロット数9では候補不足の例外になる。

## 譜面密度設計（Issue #43、`density.ts`）

- **責務**: 楽曲解析データ（拍・サビ区間・歌詞文字の開始時刻・見せ場・クライマックス代表時刻）から、曲全体を時間方向に切れ目なく覆う密度プランを決定論的に生成する。密度プランは中間データで曲プロファイルには保存しない（スキーマに密度フィールドは無い）。下流の Issue #38（オンセット間引き）と Issue #44（タップ総数上限）が消費する。設計根拠は `docs/research/04-ux-and-chart-design.md` 第4節と `docs/research/07-feasibility-and-parameters.md` 第2.1節・第2.6節。
- **区間モデル**: サビ＝1拍1回、非サビ基本＝2拍1回、休符＝置かない、溜め＝見せ場区間の直前1小節の非サビ助走。分類の優先順位はサビ＞休符＞溜め＞基本。物語弧の表現はこの密度の対比と休符・溜めで充足する。
- **境界と計数の分離**: 区間境界は音楽地図の時刻（サビ区間の開始・終端など）を正とし、拍がどの区間に属するかは拍の開始時刻で許容差なしの厳密な右半開比較で判定する。これにより各サビ64拍・骨格434が保たれる（第2サビ開始の生値は88800.20000000001で、直前拍88800.2は非サビになる）。
- **計数の2系統**: 骨格ノーツ数は分類別の合計式（サビ密度・基本密度のみ）で数え、Issue #44 の `tapBudget.fullPossible` の入力になる。実効目標ノーツ数は分類済み拍列を時間順に歩く整数累積（サビ4・基本2・溜め1・休符0、4到達で1ノーツ、端数を持ち越す）で数え、区間別割当も同時に得る。TAKEOVERは骨格434・実効387（休符84拍・溜め20拍の削減）。
- **量子化**: 最小間隔は、クライマックス見せ場の窓とサビの重なる区間で86ミリ秒（16分音符＝60000÷175÷4）、その他は171ミリ秒（8分音符）。同一スロットの連打の最小間隔は171ミリ秒。
- **依存の向き**: `tools`・TextAlive を import しない。`../schema/profileSchema`（`Showcase`・`LyricDensityWindow` 型）と `./types`（`ChorusSegment`）だけを取り込む。
- **担当Issue**: #43。後続の #38（ノーツ生成）・#44（タップ上限）・#45（生成スクリプト）が本関数を再利用する。
- 暫定値（密度・休符閾値・溜め長と密度・核半幅。`DEFAULT_DENSITY_OPTIONS`）を変えると区間別割当 `byRegion` の整数値が変わり、テストの期待値が追従する。

### 公開関数（`density.ts`）

- `generateDensityPlan(input, options?) => DensityPlan` — 区間列・分類済み拍列・歌詞密度・選択強調信号を持つ密度プランを返す。
- `countTargetNotes(plan) => NoteCountSummary` — 骨格・実効・分類別・区間別の目標ノーツ数を返す。引数は密度プランだけに限り、不整合な組を渡せないようにする。
- `lyricDensityWindows(onsetsMs, durationMs, windowMs) => LyricDensityWindow[]` — 窓ごとの文字毎秒。戻り型は既存スキーマの `LyricDensityWindow` の配列（`SongProfile.lyricDensity.windows` と同形）で、下流 #46 が `lyricDensity` フィールドの生成へ直接再利用できる。休符判定に使う全窓の中央値はこの戻り値に含めず、`generateDensityPlan` が窓の `charsPerSecond` から計算して密度プランの `lyricDensity` へ入れる（中央値は曲プロファイルの保存項目でないため、再利用する窓配列と分ける）。

## オンセット選択・ノーツ生成（Issue #38、`onsetNotes.ts`）

- **責務**: 拍格子（`beats`）とサビ区間（`chorusSegments`）から、サビは毎拍・サビ以外は2拍に1回の頻度でノーツを選び、間引いて中間ノーツの配列を返す。`docs/research/04-ux-and-chart-design.md` §4 のノーツ生成の第1段にあたる。出力は最終 `SongProfile.notes` の第1段で、`slotIndex`・`pattern`（#39）と `trajectoryPosition`（#40）は後段が付与するため中間型 `OnsetNote` には持たせない。
- **抽出源の限定**: §4 は抽出源として拍・アクセント・和音変化・声量と感情の山を挙げるが、本作の密度規則（基本2拍に1回、サビ毎拍）は拍を単位に定義され、その見積もり（フルに可能なタップ434）も拍由来である（`docs/research/07-feasibility-and-parameters.md` §2.1・§2.6）。よって第1段の抽出源を拍格子に限定し、アクセント・和音変化・声量と感情の山は #39・#43 に委ねる（ユーザー承認済み）。
- **公開関数**: `generateOnsetNotes(input, options?) => OnsetNote[]` — 中間ノーツを入力の拍順（昇順入力なら時刻昇順）で返す。種別ごとに独立した計数器を曲全体で累積し（リセットしない）、計数器が間引き間隔で割り切れる拍を選ぶため、サビ先頭拍を必ず選び、出力は拍の並びだけで決まる決定論になる。サビ判定は右半開区間（`startMs` 以上 `endMs` 未満）で行う。間引き間隔は1以上の整数で、満たさなければ例外で失敗させる。
- **オプション既定値（`DEFAULT_ONSET_OPTIONS`）**: `chorusBeatStride=1`（サビ毎拍）/ `nonChorusBeatStride=2`（サビ以外2拍に1回）/ `idPrefix="note-"`。密度の谷の休符・見せ場前の溜めは #43 が間引き間隔の上書きで精緻化する。
- **依存の向き**: `engine` 等の中核から import されない。`tools`・`rendering`・three.js を import しない。`./types`（共通型 `ChorusSegment`）だけを取り込み、最終 `Note` 型にも依存しない。
- **後段との契約**: 後段（#39・#40・#45・#46）が `OnsetNote` から最終 `Note` を作るときは、`id`・`timeMs`・`beatIndex` だけを引き継ぎ、`slotIndex`（#39）・`pattern`（#39）・`trajectoryPosition`（#40）を付与する。中間メタデータの `sectionKind` は最終 `Note` の項目ではないため最終出力に含めない。引き継ぎはオブジェクト全体の展開（スプレッド）ではなく項目を明示して写す。理由を先に述べる。全体展開だと `sectionKind` が最終ノーツへ余剰項目として残り、スキーマ外の項目が曲プロファイルJSONへ混入するためである。
- **担当Issue**: #38。後続の #39（slotIndex・pattern 付与）・#40（trajectoryPosition 付与）・#45（生成スクリプト）・#46（TAKEOVERプロファイル生成）が本関数の出力を入力に使う。

## ノーツ軌跡上配置（Issue #40、`noteTrajectory.ts`）

- **責務**: 各ノーツを、その時刻のカメラ軌跡上の位置（カメラ位置そのもの）へ配置し、ノーツ識別子と位置の対を返す。出力は最終 `SongProfile.notes` の `trajectoryPosition`（`Vec3`）項目で、`docs/idea/concept-final.md` §4・§7、`docs/research/04-ux-and-chart-design.md` §4 に基づく。配置の真下が楽曲終了後のひまわり位置になるが、その真下への投影は本モジュールの対象外（#60・#62・#63）。判定で使う軌跡上距離・速さは保存せず、`camera` と `timeMs` から #48 が実行時に導出する。
- **公開関数**: `placeNotesOnTrajectory(notes, trajectory) => NoteTrajectoryPlacement[]` — 入力 `notes`（`{ id, timeMs }` の最小型 `TrajectoryNoteInput` の配列）の各要素について `trajectory.poseAt(timeMs).position` を求め、`{ id, trajectoryPosition }` を入力順に返す。判定（#48・#49）が使うのと同一の軌跡補間器の戻り値を保存形へ写すため、配置は判定と同じ軌跡上に乗る。座標は代入のみで写し算術を行わない。空配列入力は空配列を返す。
- **引数の軌跡型**: `trajectory` は `startTimeMs`・`endTimeMs`・`poseAt(timeMs): { position: Vec3 }` の3つだけを持つ最小の構造型 `TrajectorySampler`。`src/utils/cameraTrajectory.ts` の `CameraTrajectory` はこの形を構造的に満たすため、`createCameraTrajectory(profile.camera)` の戻り値をそのまま渡せる。最小構造型にする理由を先に述べる。`cameraTrajectory.ts` は three.js を実行時に取り込み `CameraTrajectory` は本Issueが使わない `speedAt`・`distanceAt`・`timeAtDistance` も含むため、最小構造型を自前定義すると、本モジュールは `cameraTrajectory.ts` を型としても取り込まず three.js への依存も持たず不要機能へ結合しない。
- **異常の扱い**: 軌跡側の契約違反（時刻範囲が非有限・`startTimeMs < endTimeMs` を満たさず長さが正でない・`poseAt` の算出座標が非有限）と、入力ノーツの異常（識別子が空・時刻が非有限・時刻が `[startTimeMs, endTimeMs]` の外）を、識別子・入力配列内の番号・問題の値・許容範囲を含む文脈付きの例外で失敗させる。時刻範囲の検査を厳密（`startTimeMs < endTimeMs`）にする理由を先に述べる。現実に渡る軌跡は `createCameraTrajectory` の戻り値で、同関数は2点以上かつ厳密増加するキーフレームを要求し戻り値は常に `startTimeMs < endTimeMs` を満たすため、時刻範囲が0の縮退軌跡（全ノーツが同一点へ潰れ固定位置を壊す）を実補間器の契約に揃えて拒否する。
- **依存の向き**: `engine` 等の中核から import されない。`tools`・`rendering`・three.js を import しない。`src/utils/cameraTrajectory.ts` を型としても取り込まない。`../schema/profileSchema` から `Vec3` だけを型として取り込む。
- **後段との契約**: 軌跡補間器の構築（`createCameraTrajectory`）は呼び出し側（#45・#46・テスト）が行う。#45・#46 は本関数の出力 `{ id, trajectoryPosition }` を、#39 が付与する `{ id, slotIndex, pattern }` と `id` で結合し、`OnsetNote` から引き継ぐ `id`・`timeMs`・`beatIndex` と合わせて最終 `Note` を組み立てる。
- **テスト方針**: 実カメラキーフレームは #46 まで存在しないため `*.takeover.test.ts` は作らず、合成キーフレームから `createCameraTrajectory` で軌跡補間器を作り `TrajectorySampler` として渡し、「補間器を正しく消費して保存形へ写す」ことのみを検査する。補間器そのものの補間精度は #13 の `src/utils/cameraTrajectory.test.ts` の責務とし再検査しない。
- **担当Issue**: #40。後続の #45（生成スクリプト）・#46（TAKEOVERプロファイル生成）が本関数の出力を最終 `Note` の組み立てに使う。

## タップ総数上限算出（Issue #44、`tapBudget.ts`）

- **責務**: 曲解析データ（拍の開始時刻の並びとサビ区間）から、一回性を成立させる `tapBudget`（出力は `SongProfile.tapBudget`）を決定論的に算出する。`tapBudget` はフルに可能なタップの総数 `fullPossible`（母数）とタップ総数上限 `limit` の2値を持つ。曲プロファイルJSONへの書き込みは行わない（それは #45・#46 の責務）。
- **入力源**: TextAlive 音楽地図ダンプ（`docs/analysis/<key>.songmap.json`）。拍＝beats の開始時刻、サビ区間＝isChorus の区間。songmap から `TapBudgetInput` への変換は呼び出し側（本Issueはテスト、横展開時は #45 の生成スクリプト）が行う。
- **公開関数**:
  - `estimateFullPossibleTaps(input, options?) => number` — 母数を算出する。各拍がいずれかのサビ区間に入るかを真偽で1回だけ数え、サビの拍数×サビ密度と非サビの拍数×非サビ密度を合計し最近接整数へ丸める。
  - `calculateTapBudget(fullPossible, options?) => TapBudget` — 母数から上限を算出する。上限＝最近接整数の `母数 × 比率`。比率の既定は `TAP_LIMIT_RATIO_DEFAULT`、範囲は `TAP_LIMIT_RATIO_MIN`〜`MAX`。
  - `generateTapBudget(input, options?) => TapBudget` — 上記2関数の合成。#45・#46 はこの関数1つで曲の `tapBudget` を得る。本Issueの主たる成果物。
- **密度モデルの範囲（#43・#38 との責務境界）**: 本モジュールの密度は母数の見積もりに用いる粗いモデルであり、サビと非サビの2値だけを持つ（`docs/research/07-feasibility-and-parameters.md` §2.1）。密度の谷（休符）・見せ場前の溜め・16分音符の量子化といった細かい配置密度（§2.6）は、実際のノーツ数を母数より少なくする要素であり、譜面密度設計（Issue #43）とノーツ生成（Issue #38）の責務である。本モジュールはそれらを扱わない。
- **入力契約**: `beatsMs` は厳密昇順（結果として重複なし）。`chorusSegments` の各区間は開始が終端より小さく有限であり、区間どうしの並び順と重なりは許容する（各拍を真偽で1回だけ数えるため二重計上が起きない）。違反は文脈付きの例外で失敗させる。
- **依存の向き**: `engine` 等の中核から import されない。`tools` を import しない。`../../config/tuning`（比率定数）と `../schema/profileSchema`（`TapBudget` 型）だけを取り込む。
- **担当Issue**: #44。後続の #45（生成スクリプト）・#46（TAKEOVERプロファイル生成）・#55（スコアリング合成）が本関数と算出値を再利用する。

## 譜面パターン適用（Issue #39、`notePatterns.ts`）

- **責務**: オンセット選択（#38）の中間ノーツ列に、Y軸スロット番号 `slotIndex` と譜面パターン名 `pattern` を付ける。`docs/research/04-ux-and-chart-design.md` §4 のノーツ生成の第2段（各ノーツへY軸スロットを割り当てる）と第3段（同音連打・上昇下降のパターンを当てて楽曲の感触を映す）にあたる。出力は最終 `SongProfile.notes` の途中段で、カメラ軌跡上の位置（`trajectoryPosition`）は #40 が後段で付与する。
- **slotIndex 空間のみで動作**: #36 の並び順契約により `slots[].pitches` はMIDIノート番号の昇順で、`slotIndex` が大きいほど音高が高い。本モジュールは音高の値を読まず、`slots` から各区間の時刻境界とスロット数（`pitches.length`）だけを読む。`slotIndex` を増やすことが音高を上げることに自動的に対応する。画面の上下と音の高低の対応は入力写像（#47）の責務である。
- **駆動信号（勢い値）**: 旋律はTAKEOVERで信頼性が低く使えないため（§2）、声量曲線と感情曲線の興奮度（arousal）を正規化合成した「勢い値」（0以上1以下）を各ノーツに割り当てる。勢い値が上がる箇所では `slotIndex` を上げ（上昇）、下がる箇所では下げ（下降）、平坦な箇所では据え置く（同音連打）。和音が変わる境界では `slotIndex` を勢い値から再シードする（スロットの音高集合が変わるため）。
- **同時押し（2点から3点）は本モジュールでは扱わない**: 1オンセットを1ノーツに保ち、タップ総数の母数（#44）と整合させる。同時押しは下流（#46・#48・#55）へ分離する。
- **公開関数**:
  - `applyNotePatterns(input, options?) => PatternedNote[]` — 中間ノーツ `PatternedNote`（`id`・`timeMs`・`beatIndex`・`slotIndex`・`pattern`）を返す。本Issueの主たる成果物。
  - `sampleContour(timeMs, loudness, emotion, options) => number` — 単一時刻の勢い値を返す。受け入れ基準を実データで検証するため公開する。
- **`pattern` の決め方と前後基準の違い**: `pattern`（`"ascending"`・`"descending"`・`"sameTone"`）は確定後の `slotIndex` の差から決める。天井や床のクランプで `slotIndex` が動かない箇所が確実に同音連打になり、表示上のY移動と `pattern` が一致するためである。run の先頭ノーツは同じ run の直後ノーツとの差で性格付け（run の長さが1または差が0なら同音連打）、それ以外のノーツは直前ノーツとの差で決める。前後の基準が異なる点に注意する。
- **声量曲線と感情曲線の刻みの扱いの違い**: 声量曲線は等間隔前提で `stepMs` を使ってサンプル添字を求め、感情曲線は `points` の `tMs` を時刻昇順前提で直接走査して `stepMs` を読まない（感情点が等間隔でない楽曲でも階段補間が正しく動くため）。
- **後段との契約**: #40 は `PatternedNote` の `id`・`timeMs`・`beatIndex`・`slotIndex`・`pattern` を引き継ぎ、`trajectoryPosition` を付与して最終 `Note` にする。
- **依存の向き**: `engine` 等の中核から import されない。`tools`・`rendering`・three.js を import しない。`./onsetNotes`（`OnsetNote` 型）と `../schema/profileSchema`（`ChordToneSlotRegion`・`LoudnessCurve`・`EmotionCurve` 型）だけを取り込み、最終 `Note` 型にも依存しない。
- **オプション既定値（`DEFAULT_NOTE_PATTERN_OPTIONS`）**: `loudnessWeight=0.5`・`emotionWeight=0.5`（声量と感情を等価に混ぜる初期値。見せ場生成の前例に揃える）/ `flatEpsilon=0.02`（同音連打とみなす勢い値差の不感帯。全幅の2パーセント）。実データの事実として、TAKEOVERは arousal の変動幅が狭く勢い値の方向はほぼ声量曲線が決める。重みは曲非依存の既定値であり、arousal の変動幅が大きい他の課題曲では感情成分が方向に寄与する。
- **担当Issue**: #39。後続の #40（`trajectoryPosition` 付与）・#45（生成スクリプト）・#46（TAKEOVERプロファイル生成）が本関数の出力を入力に使う。

## 灯し緩和配置（Issue #62、`lanternPlacement.ts`）

- **責務**: カメラ軌跡上のノーツ素案位置（各ノーツの `trajectoryPosition`）にボロノイ緩和（格子離散化による近似Lloyd）を少数回かけ、灯し分布の近すぎる点の塊と空きすぎた局所を均す。`docs/idea/concept-final.md` §5 の配置理論にあたる。曲プロファイルJSONには保存しない（緩和は実行時にしか確定しない水面領域に依存するため、本編前の読み込み時に1回計算する）。
- **水平面のみ・高さ不変**: 緩和は水平面（x と z）だけで行い、高さ（y）は素案のまま返す（§5・§6。ひまわりは真下湖面、蝶は空間上で、水平位置を共有し高さだけを各灯しが持つ）。
- **領域は同型の平の数値で受ける**: 描画層の `WaterRegion` 型を import せず、同じ4項目（width・depth・centerX・centerZ）を持つ `LakeRegion` を受ける（依存規則 §5）。
- **公開関数**:
  - `relaxLanternPlacement(seeds, region, options?) => LanternPlacement[]` — 緩和後の `{ id, position }` を入力順で返す。本Issueの主たる成果物。
  - `computeLanternMeasurementSpec(seeds, region, options?) => LanternMeasurementSpec` — 被覆領域・実効格子刻み・活性格子点を緩和前の入力点から1回求める。緩和の格子割当と緩和前後の被覆距離測定で共用する。
  - `measureLanternDistribution(points, spec) => LanternDistributionMetrics` — 最近傍距離（最小・中央値・最大・変動係数）と被覆距離（95パーセンタイル・最大）を返す。
  - `representativeLakeRadius(region) => number` — 湖の代表半径（水面矩形の内接円半径＝短辺の半分。`docs/research/04` §77 の初期定義）。
  - `isCentroidWithinLakeAllowance(points, region, fraction?) => boolean` — 重心が領域中心から代表半径の指定割合（既定0.2）以内かを判定する。
  - `findNearestLanternIndex(points, query) => number` — 空間分割の最近傍探索の正しさを単体検証するために公開する。
- **受入条件の検査（曲非依存）**: 受入条件1（空白も塊も無い）は、緩和前後で最近傍距離の変動係数と被覆距離の95パーセンタイルが「緩和後 <= 緩和前 + `METRIC_TOLERANCE`（1e-9）」を満たすことで判定する。最近傍距離の最大値と被覆距離の最大値は外縁の孤立点に支配される診断値で合否に用いない。受入条件2（重心）は、緩和が重心を保存すること（基準量＝最近傍距離の中央値以内）と `isCentroidWithinLakeAllowance` が真であることで判定する。重心の絶対距離の最終ゲートは実行時に本物の水面領域を用いる #101 が担う。
- **作業領域と活性格子点**: 作業領域は点群の外接矩形を基準量の半分だけ広げ湖面矩形で切った範囲。格子は各灯しの活性半径（基準量の `ACTIVE_RADIUS_FACTOR`＝3倍）以内の格子点（活性格子点）だけを用いる。これにより、曲線状に密集した灯しの大半が空である外接矩形の遠方を割当・測定の対象から外し、緩和は局所の塊と空きだけを均す（大域の構造的な空き＝個性を埋めない）。各格子点の最近傍の灯しは一様空間分割で近傍の区画だけを走査して求め（リング探索の上限は構築時に求めた灯しの区画範囲で一定時間で与える）、処理量は活性格子点数とその近傍の灯し数に比例する。読み込み時に1回だけ実行する。
- **拘束の優先順位**: 緩和の各点には「湖面矩形内」を最優先、次に「総移動量上限（素案位置からの総移動量、既定は基準量）」、最後に「重心保存」の順で拘束を適用する。最終に重心を緩和前へ戻す平行移動を行い、総移動量上限・湖面矩形内を再適用する。
- **退化・異常入力**: 0個は空配列、1個は不変。2点以上で同一水平位置の組が1組でもあれば例外（格子割当では完全同一点を分離できないため）。各 seed の水平位置が湖面矩形内であることを必須とする（湖面の外の素案は拘束を両立できず、ひまわりが湖面に浮かぶ仕様にも反するため）。
- **緩和回数の範囲**: 緩和回数は2回以上4回以下の整数に限る（`RELAX_ITERATIONS_MIN`〜`RELAX_ITERATIONS_MAX`）。理由は concept-final §5 が、完全収束で個性が消えることを避けるため少数回（2回から4回）で止めると定めるためで、範囲外（1回や5回以上）は公開オプションでも例外で拒否する。
- **依存の向き**: `engine` 等の中核から import されない。`tools`・`rendering`・three.js を import しない。`../schema/profileSchema`（`Vec3` 型）だけを取り込む。
- **後続Issueへの引き継ぎ契約**:
  - 呼び出し主体は統括層（`src/app` または `src/screens`）とする。`src/rendering` から本モジュールを直接 import しない（rendering は状態を読むだけで論理を持たない）。統括層が緩和後位置を作り描画へはデータとして渡す。
  - 呼び出しは `relaxLanternPlacement(profile.notes.map(n => ({ id: n.id, position: n.trajectoryPosition })), waterRegion)` を読み込み時または楽曲終了時に1回。
  - ひまわり（#60）は緩和後の水平座標に水面高さ `waterRegion.y` を合成して `SunflowerSetInput.position` を作る。蝶（#61）は緩和後の3次元位置をそのまま使う。現状の蝶描画は演奏中の寿命付き発生用で持続配置を持たないため、楽曲終了後の持続配置用の蝶描画は #63・#71 が新たに用意する。
  - 反応強度（大きさ・輝度）は演奏結果（#51・#55）から識別子で結合する。位置（#62）と強度は識別子で対応付ける。
  - 品質ゲート #101 は、緩和前の入力点から `computeLanternMeasurementSpec` で測定設定を求め、その設定で緩和後位置を `measureLanternDistribution` と `isCentroidWithinLakeAllowance` で検査する。
- **担当Issue**: #62。

## テスト手順（実行環境 Node 22、`.nvmrc` 準拠）

```sh
npm run typecheck
npm test
```

`showcases.takeover.test.ts`・`chordToneSlots.takeover.test.ts`・`tapBudget.takeover.test.ts`・`onsetNotes.takeover.test.ts`・`density.takeover.test.ts`・`notePatterns.takeover.test.ts` が `docs/analysis/takeover.songmap.json` を素読みして各Issueの達成基準を実データで表明する（`src/tools/` を import しない）。`lanternPlacement.takeover.test.ts` はコミット済み `../takeover/takeover.profile.json` の各ノーツの `trajectoryPosition`（434件）を素読みし、緩和の受入条件を実データで表明する（代理の水面寸法400はテスト内に明記し `src/rendering/constants.ts` を import しない）。各機能の単体テストは同居の `*.test.ts`。
