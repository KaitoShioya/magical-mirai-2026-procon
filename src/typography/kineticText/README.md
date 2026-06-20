# kineticText — troika製の3次元演出文字エンジン（Issue #20・高品質化 #14）

troika-three-text を最小初期化で内包し、TAKEOVERの最大文字密度でも描画性能が保てる、後続演出（#21〜#30・#32）の土台となるSDF文字エンジン。高品質化（#14）で、向き方針・距離場の鮮鋭度設定・同期費用の計測ゲートを加えた。

## 公開API（`index.ts`）
- `createKineticTextEngine(deps, internals?)` — フォント登録・暖め・単一文字層・一括文字層を結線したエンジンを作る。`deps` に `scene`・`camera`・`fonts`・`limits` を注入する。可読性の最小表示寸法を扱うときは `viewportPixelHeight`（画面の縦デバイス画素数を返す関数）と `bloomThreshold`（発光抑制の上限、既定0.5）を、可読性下地を有効化するときは `readabilityNeedsBacking` を併せて注入する。`warmUp`・`spawnGlyph`・`spawnPhrase`・`update`・`dispose`・`stats` を持つ。
- `createGlyphAnimation(handle, spec, internals?)` — 1文字のアニメーション（Issue #21）を作る。`spawnGlyph` が返した取っ手を、位置・回転・大きさ・不透明度の4系統で時間に沿って動かす（後述）。
- `createFontRegistry()` — 論理名から実フォント（URLと出典）を引く登録の仕組み。シーン・演出別の差し替えを担う。`FontEntry.fallbackName` で未収録文字を回す代替フォントの論理名を指定できる。
- `warmUpFont(fontUrl, characters, sdfGlyphSize?)` — 距離場を読み込み時に事前生成（暖め）する。
- `computeMaxConcurrent` / `computeSingleLayerLimit` / `computeBatchedLayerLimit` — 同時上限の算出（文字開始時刻列と表示残存時間から走査）。
- 可読性の計算（純粋関数、Issue #31）: `relativeLuminanceFromSrgbHex` / `contrastRatio` / `clampLuminanceSrgbHex`（発光抑制）/ `minWorldFontSize`・`projectedPixelHeight`（最小表示寸法）/ `resolveReadabilityStyle`（確定可読性指定の生成）/ `DEFAULT_READABILITY_OPTIONS`。#131 はこれらを取り込んで合成の各段で適用する。
- `ZEN_KAKU_GOTHIC_NEW_CREDIT` — 主フォントの出典情報。

## インスタンス分割文字制御 `glyphAnimation`（Issue #21、出典 `docs/research/01-kinetic-typography.md` §2・§8）
1文字を1描画単位として、位置・回転・大きさ・不透明度の4系統を時間に沿って動かす独立部品。アニメーション手段はGSAPを使う。GSAPは画面に表示する素材ではなくコードのライブラリであり、three.js・troika-three-text と同列に扱う。

- **同期方式**: GSAPのタイムラインを自走させず、毎フレーム与えられる再生位置 `gameTimeMs` へ移動（シーク）して値を取り出す。これにより利用者がシークしても巻き戻しても破綻しない。時刻の単位は、GSAPが秒・本プロジェクトがミリ秒のため、ミリ秒の値を1000で割って秒へ変換して渡す。
- **エンジン非改変**: 文字エンジン本体は改変せず、エンジンが返す `GlyphHandle` の設定メソッド経由でのみ動かす（エンジンは演出意図を持たない契約）。
- **仕様 `GlyphAnimationSpec`**: 先頭になる絶対再生位置 `startTimeMs`、全体の長さ `durationMs`、各系統（`position`・`rotation`・`scale`・`opacity`）の節目（キーフレーム）列。各節目は相対時刻 `atMs`（0以上 `durationMs` 以下、昇順）・値・変化の緩急の名前 `ease`（GSAPのイージング名。例: `"none"` は等速、`"power2.out"` は減速、`"back.out"` は行き過ぎて戻る、`"power1.inOut"` は緩急両端）を持つ。範囲外の再生位置では端の値に留まる（クランプ）。
- **正対と回転の適用順序**: エンジンは毎フレーム文字をカメラへ正対させる。回転を指定したアニメーションは、`applyAt` をエンジン更新の後に呼ぶことで正対より後に向きを上書きする。回転を指定しないアニメーションは `setRotation` を呼ばないため正対が保たれる。
- **終了処理**: `finish` はタイムラインを破棄し続けて文字を解放する一括処理（終了後の後始末に使う既定）。`dispose` はタイムラインだけを破棄する。いずれも冪等で、呼び出し順に関わらず二重解放しない。
- **進行状態**: `phaseAt` が開始前・進行中・終了後を返す。呼び出し側はこれで終了後を判定して `finish` する。

## 二層構造（出典 `docs/research/01-kinetic-typography.md` §2・§7）
- 単一文字層（`glyphPool` + 個別 `Text`）: 1文字ごとに独立して動かす。要求は1文字単位（`spawnGlyph`）。
- 一括文字層（`batchedTextLayer` + `BatchedText`）: 多数を1回の描画命令でまとめる。要求はフレーズ単位（`spawnPhrase`）。

両層とも、非同期の配置確定（`sync`）の取り違えを防ぐため世代番号を持ち、解放後・再利用後の古い完了通知を無視する。

## 可読性処理（Issue #31）
読ませる役の文字（`spawnGlyph`・`spawnPhrase` の `readability` を与えた要求）を、発光・ブルーム後処理を含む最終描画画素で背景から分離して読める状態にする。計算は純粋関数の `readability.ts` に、troika への反映は薄い `readabilityRenderer.ts` に分け、#131 は計算部分だけを取り込める。
- 既定スタイルは「明るい塗り＋全周を囲む暗い縁取り＋影」。明るい塗りが暗い背景に、暗い縁取りと影が明るい背景とブルームのにじみにコントラストを与える。発光抑制（`maxBrightLuminance`）の対象は塗りに限り、縁取りと影は暗い分離側で対象に含めない。
- 縁取りは troika の stroke、影は troika の outline のずれとぼかしで描く。使う前に実体での反映可否を実行時に判定し（`detectReadabilityCapability`）、縁取りと影モード／縁取りのみモード／縁取りと下地モードのいずれかへ確定する。
- 最小表示寸法は大きさを決める段で毎フレームの下限として満たす。#131 がある場合は #131 のみが適用し、無い現段階はエンジンのみが適用する（二重適用の衝突を避ける）。
- 未収録文字は、暖めで渡された文字集合への所属で判定し、集合の外は代替フォント（未登録なら troika 既定フォント）へ回す。代替の発生件数とフォント読込失敗件数は `stats` で取得できる。

## 表示粒度切替コントローラ `granularity`（Issue #29、出典 `docs/idea/concept-final.md` §11・`docs/research/01-kinetic-typography.md` §9）
歌詞の発声属性に応じて、文字・単語・フレーズ・画面全体の4段の表示粒度を時間軸で切り替える曲非依存の純粋ロジック。描画は行わず、`GlyphHandle` を操作しない。出力（表示粒度プラン）は演出割付規則（#132）と曲固有譜面（#33）が消費し、表示同期ゲート（#99）が検査の対象とする。

- **責務の境界**: 「どの単位で出すか（粒度）」と「なぜそう判定したか（判定理由 `reason`）」までを決める。具体的な演出効果（縦伸ばし・円状回転・段階的構築・強調など）への写像は #132 が行う。本モジュールは演出効果の名前を出力に持たない。
- **公開API**: `buildGranularityPlan(input)` が表示粒度プランを一度計算し、`granularityAt(plan, positionMs)` が再生位置のセグメントを二分探索で返し、`findGranularityPlanIssues(plan, input)` が構造の不整合一覧を例外を投げずに返す。
- **入力 `GranularityInput`**: 歌詞タイムライン（#133）・ビート開始時刻の配列・声量曲線（刻み幅・値・最大声量）・区間境界の配列・曲の終了時刻。曲固有の絶対値は持たず、判定の閾値は `src/config/tuning.ts` の曲非依存の定数を使う。
- **決定性**: 読み込み時に確定済みデータだけから計算し、再生中の瞬時値には依存しない。粒度切替はビート格子へ吸着し、曲全体を隙間も重複も無く被覆する。
- **セグメントの時刻の意味**: セグメントの時刻範囲は表示の切替のタイミング（ビート吸着後）であり、歌詞の発声時刻とは一致しない。発声の実時刻は `unitRefs` が指す歌詞単位を歌詞タイムラインで引く。
- **長尺の扱いの分担**: 文字数が一画面可読数を超えるフレーズのうち、文字密度が高いものはフレーズ粒度の流し込み（判定理由 `longDense`）として分割せず1セグメントで出し、画面に収める流し込みの描画は #132 が行う。文字密度が低いものはフレーズ粒度のチャンク分割（判定理由 `longSparse`、`phraseChunk` 付き）で可読なまとまりへ区切る。
- **歌詞型の取り込み**: `LyricsTimeline` ほかの型は純粋モジュール `src/textalive/lyricsTimeline.ts` から型のみ直接取り込む。公開窓口 `src/textalive/index.ts` 経由にしない（公開窓口は textalive パッケージに依存する再生実装を再輸出するため）。
- **本編結線（#59）の入口**: `onVideoReady` の後に `buildLyricsTimeline(player.video)` で歌詞タイムラインを作り、曲プロファイルのビート・声量曲線・区間・曲の終了時刻から `GranularityInput` を組み立て、`buildGranularityPlan` を一度呼んで粒度プランを得る。毎フレームは `granularityAt(plan, 再生位置)` で現在のセグメントを引く。配線そのものは #59 の責務であり、本モジュールは配線コードを持たない。

## 向き方針（#14、`orientation.ts`）
文字の向きを spawn 単位で指定する。`{ mode: "faceCamera" | "fixed", granularity?: "perCharacter" | "asGroup" }`。`faceCamera` はカメラ正対、`fixed` は設定済み回転を保持する（カメラが3次元配置の文字の間を通過する演出のため）。フレーズの `asGroup` は、各メンバのローカル変換を基準点まわりに再計算し、フレーズを1枚の読める面として群正対させる（`BatchedText` はメンバのローカル行列のみ使うため、親グループでの群正対は不可）。`GlyphHandle.setOrientation` で後から切り替えられる。既定はカメラ正対・文字ごとで、従来挙動を保つ。割付（どの粒度・拍でどの向きを当てるか）は後続 #132/#33 の責務で、本エンジンは機構のみを提供する。

## 距離場の鮮鋭度（#14）
`engine.ts` の `SDF_GLYPH_SIZE` を暖めと各文字生成で同じ値に設定し、距離場アトラスの解像度を揃える。角・細線の鮮鋭度はこの値に依存し、メモリと生成時間は値の2乗で増える。実行時に変更すると再配置確定（再 `sync`）を誘発するため、毎フレーム変更はしない。

## 禁止依存
判定・得点・時刻の論理を持たない。`profiles`・`tools` を import しない。three.js は名前付きでのみ取り込む。

## 受け入れ診断（`diagnostics/`）
- `typography.html` の入口 `diagnostics/main.ts` が、最小シーン（#8 の定数・純粋関数を再利用）でエンジンを駆動し、`docs/analysis/takeover.songmap.json` の文字開始時刻を再生（実測再現プロファイル）して性能を計測する。1フレームごとの所要時間から平均・下位5パーセンタイル・33ミリ秒超過数・初回表示遅延を `window` に公開する。
- `readability.html` の入口 `diagnostics/readability.ts` が、可読性モジュールを本物のまま用いて読ませる役の文字を不利な背景の代表集合（暗い背景・明るい背景・暗から明への階調背景・ブルームで強くにじむ明るい発光塊・高周波の模様の背景）の上に描き、発光・ブルーム後処理を通した最終出力段の後の画素から、コントラスト比を計測して `window.__readability` に公開する。`scripts/readability-contrast.mjs` が 4.5:1 以上を判定する（実行例: 開発サーバ起動後に `BASE=http://127.0.0.1:4173 node scripts/readability-contrast.mjs`）。
  - 合否は「文字領域内の明るい塗り（高位百分位）と暗い縁取り（低位百分位）のコントラスト比」（`fillBorderContrast`）で判定する。これは設計の合意「塗りを全周で囲む暗い縁取りに対する塗りのコントラストで背景非依存に読める」に基づく。受け入れ基準の文言「任意背景に対し4.5:1」を、塗りを囲む縁取りが背景非依存のコントラストを与えるという解釈で運用する。塗りと背景・縁取りと背景のコントラスト（`fillVsBackground`・`borderVsBackground`）は合否に使わず参考として併報する。理由は、明るい背景では塗りが背景と同程度の明るさになり得るが、塗りを囲む暗い縁取りが分離を担うため、塗りと背景の直接比較では可読性を正しく表せないからである。

正式な合否はGPUを使う通常起動ブラウザまたは実機で記録する（ヘッドレスは非代表。`docs/research/08-quality-assurance.md` §1）。計測値は同一の実行環境での反復で安定するが、GPUやブラウザが異なると最終画素は厳密には一致しないため、環境をまたいだ厳密一致は保証しない。

問い合わせ値 `anim=1` を付けると、出現する各文字に4系統のアニメーション（Issue #21）を付けて駆動する。毎フレームの処理順は、終了後アニメーションの解放（出現の前に行い文字プール枠を空ける）→出現→エンジン更新→アニメーション反映、である。文字プール上限超過で出現が無操作になった回数を `window.__animNoopCount` に公開し、0でなければ計測した負荷が意図した同時数を代表しない。性能スモークは `scripts/typography-instances-fps.mjs`（`npm run typography:instances:fps`）で、実GPU・実測再現・最悪集中区間・アニメーション付きにおいて平均55フレーム以上・単発落ち5回未満・無操作0を判定する。Issue #20 の `typography-fps.mjs`（アニメーションなし）は別スクリプトとして保つ。

高品質化（#14）で、同期発火・向き更新の主スレッド費用を計測する。出現処理の直前から `engine.update` の戻りまでを挟み、その1フレーム所要時間の最大・上位5パーセンタイル・上位1パーセンタイル・1ミリ秒超過数・総フレーム数を `window` に公開する。`scripts/typography-fps.mjs` が、単一層を desktop_real（実測再現・最悪集中区間）で、一括層と群正対を desktop_maxload（最大負荷）で、いずれも上位1パーセンタイル（p99）が1ミリ秒未満であることを合否に加える。p99 で判定するのは、単発のごみ集め停止が1%未満の頻度で生じフレーム落ち（33ミリ秒超）を起こさない一時的外れ値であり、定常の毎フレーム費用はp99が頑健に表すためである。最大値と超過数は外れ値把握のため併記する。worker 組版は主スレッドに乗らず、描画中の行列データテクスチャ書き込みと後処理は本区間に含めない（除外分は単発フレーム落ちと平均フレーム率のゲートが抑える）。描画の所要時間は参考値として別に公開する。

## フォント素材
主フォントは Zen Kaku Gothic New Bold（SIL Open Font License 1.1）。`assets/fonts-source/`（非公開）の元フォントから `scripts/build-font-subset.mjs` が歌詞の文字へサブセット化し、`public/fonts/zen-kaku-gothic-new-subset.woff` を生成する。出力形式が .woff なのは troika-three-text が .woff2 非対応で、対応形式のうち .woff が最も圧縮が効くため。
