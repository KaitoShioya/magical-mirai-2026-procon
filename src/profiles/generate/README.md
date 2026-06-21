# profiles/generate — 曲プロファイル生成の純粋関数群（Issue #41・#37・#36・#44・#38・#43）

曲解析データ（songmap 由来の素の配列や解決済みの和音区間）から、曲プロファイルの各派生フィールドを決定論的に生成する純粋関数群を置く。
現在は見せ場マップ生成（Issue #41、`showcases` フィールド）、無和音区間の解決（Issue #37）、JUST音程7スロット生成（Issue #36、`slots` フィールド）、タップ総数上限算出（Issue #44、`tapBudget` フィールド）、オンセット選択・ノーツ生成（Issue #38、`notes` フィールドの第1段）、譜面密度設計（Issue #43、`density.ts`。密度プランは中間データで保存しない）を収める。
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

## テスト手順（実行環境 Node 22、`.nvmrc` 準拠）

```sh
npm run typecheck
npm test
```

`showcases.takeover.test.ts`・`chordToneSlots.takeover.test.ts`・`tapBudget.takeover.test.ts`・`onsetNotes.takeover.test.ts`・`density.takeover.test.ts` が `docs/analysis/takeover.songmap.json` を素読みして各Issueの達成基準を実データで表明する（`src/tools/` を import しない）。各機能の単体テストは同居の `*.test.ts`。
