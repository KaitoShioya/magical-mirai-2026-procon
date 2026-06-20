# kineticText — troika製の3次元演出文字エンジン（Issue #20・高品質化 #14）

troika-three-text を最小初期化で内包し、TAKEOVERの最大文字密度でも描画性能が保てる、後続演出（#21〜#30・#32）の土台となるSDF文字エンジン。高品質化（#14）で、向き方針・距離場の鮮鋭度設定・同期費用の計測ゲートを加えた。

## 公開API（`index.ts`）
- `createKineticTextEngine(deps, internals?)` — フォント登録・暖め・単一文字層・一括文字層を結線したエンジンを作る。`deps` に `scene`・`camera`・`fonts`・`limits` を注入する。`warmUp`・`spawnGlyph`・`spawnPhrase`・`update`・`dispose`・`stats` を持つ。
- `createGlyphAnimation(handle, spec, internals?)` — 1文字のアニメーション（Issue #21）を作る。`spawnGlyph` が返した取っ手を、位置・回転・大きさ・不透明度の4系統で時間に沿って動かす（後述）。
- `createFontRegistry()` — 論理名から実フォント（URLと出典）を引く登録の仕組み。シーン・演出別の差し替えを担う。
- `warmUpFont(fontUrl, characters, sdfGlyphSize?)` — 距離場を読み込み時に事前生成（暖め）する。
- `computeMaxConcurrent` / `computeSingleLayerLimit` / `computeBatchedLayerLimit` — 同時上限の算出（文字開始時刻列と表示残存時間から走査）。
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

## 向き方針（#14、`orientation.ts`）
文字の向きを spawn 単位で指定する。`{ mode: "faceCamera" | "fixed", granularity?: "perCharacter" | "asGroup" }`。`faceCamera` はカメラ正対、`fixed` は設定済み回転を保持する（カメラが3次元配置の文字の間を通過する演出のため）。フレーズの `asGroup` は、各メンバのローカル変換を基準点まわりに再計算し、フレーズを1枚の読める面として群正対させる（`BatchedText` はメンバのローカル行列のみ使うため、親グループでの群正対は不可）。`GlyphHandle.setOrientation` で後から切り替えられる。既定はカメラ正対・文字ごとで、従来挙動を保つ。割付（どの粒度・拍でどの向きを当てるか）は後続 #132/#33 の責務で、本エンジンは機構のみを提供する。

## 距離場の鮮鋭度（#14）
`engine.ts` の `SDF_GLYPH_SIZE` を暖めと各文字生成で同じ値に設定し、距離場アトラスの解像度を揃える。角・細線の鮮鋭度はこの値に依存し、メモリと生成時間は値の2乗で増える。実行時に変更すると再配置確定（再 `sync`）を誘発するため、毎フレーム変更はしない。

## 禁止依存
判定・得点・時刻の論理を持たない。`profiles`・`tools` を import しない。three.js は名前付きでのみ取り込む。

## 受け入れ診断（`diagnostics/`）
`typography.html` の入口 `diagnostics/main.ts` が、最小シーン（#8 の定数・純粋関数を再利用）でエンジンを駆動し、`docs/analysis/takeover.songmap.json` の文字開始時刻を再生（実測再現プロファイル）して性能を計測する。1フレームごとの所要時間から平均・下位5パーセンタイル・33ミリ秒超過数・初回表示遅延を `window` に公開する。正式な合否はGPUを使う通常起動ブラウザまたは実機で記録する（ヘッドレスは非代表。`docs/research/08-quality-assurance.md` §1）。

問い合わせ値 `anim=1` を付けると、出現する各文字に4系統のアニメーション（Issue #21）を付けて駆動する。毎フレームの処理順は、終了後アニメーションの解放（出現の前に行い文字プール枠を空ける）→出現→エンジン更新→アニメーション反映、である。文字プール上限超過で出現が無操作になった回数を `window.__animNoopCount` に公開し、0でなければ計測した負荷が意図した同時数を代表しない。性能スモークは `scripts/typography-instances-fps.mjs`（`npm run typography:instances:fps`）で、実GPU・実測再現・最悪集中区間・アニメーション付きにおいて平均55フレーム以上・単発落ち5回未満・無操作0を判定する。Issue #20 の `typography-fps.mjs`（アニメーションなし）は別スクリプトとして保つ。

高品質化（#14）で、同期発火・向き更新の主スレッド費用を計測する。出現処理の直前から `engine.update` の戻りまでを挟み、その1フレーム所要時間の最大・上位5パーセンタイル・上位1パーセンタイル・1ミリ秒超過数・総フレーム数を `window` に公開する。`scripts/typography-fps.mjs` が、単一層を desktop_real（実測再現・最悪集中区間）で、一括層と群正対を desktop_maxload（最大負荷）で、いずれも上位1パーセンタイル（p99）が1ミリ秒未満であることを合否に加える。p99 で判定するのは、単発のごみ集め停止が1%未満の頻度で生じフレーム落ち（33ミリ秒超）を起こさない一時的外れ値であり、定常の毎フレーム費用はp99が頑健に表すためである。最大値と超過数は外れ値把握のため併記する。worker 組版は主スレッドに乗らず、描画中の行列データテクスチャ書き込みと後処理は本区間に含めない（除外分は単発フレーム落ちと平均フレーム率のゲートが抑える）。描画の所要時間は参考値として別に公開する。

## フォント素材
主フォントは Zen Kaku Gothic New Bold（SIL Open Font License 1.1）。`assets/fonts-source/`（非公開）の元フォントから `scripts/build-font-subset.mjs` が歌詞の文字へサブセット化し、`public/fonts/zen-kaku-gothic-new-subset.woff` を生成する。出力形式が .woff なのは troika-three-text が .woff2 非対応で、対応形式のうち .woff が最も圧縮が効くため。
