# 実装チェックポイント（2026-06-21・Issue #22）

**状態: Issue #22（シェーダ注入による全文一括変形）の実装を完了。ブランチ `worktree-issue-22-shader-deform` で PR #143 を作成・push 済み。マージ前。**
**用途**: セッション喪失時の復帰点（実装フェーズ）。直接の前提は完了済みのSDF文字エンジン基盤 #20、設計正典は [[phase2_design_checkpoint_2026-06-14]]、開発基盤の現状は [[dev_infrastructure_notes]]。

## 位置づけ

マイルストーンM3「キネティックタイポグラフィエンジン」の主要機能（優先度 P1-high）。troika-three-text の文字マテリアルの頂点シェーダに変形を差し込み、1つの変形単位（呼び出し側が渡した文字内容＝1つの troika Text）の中の全グリフを1回の描画命令のまま渦・波打ちで変形させる仕組みを文字エンジンに追加する。下流の演出文法④縦伸ばし・渦 #26、演出合成エンジン #131、TAKEOVERタイポ譜面 #33 がこの仕組みを土台にする。本編結線 #59・#33 は後続が担う。

## スコープ確定事項（ユーザー決定）

- **残像は #22 から除外し #27 へ委譲**。理由を先に述べる: 残像（トレイル）は「過去フレームの位置の複製重ね」または「前フレーム描画結果の減衰重ね」を要し（研究文書 docs/research/01-kinetic-typography.md 第3節の技法表が明記）、どちらも複数フレームの状態保持または描画結果の再利用を必要とする。頂点シェーダの変形は単一フレームの頂点座標を変形するだけで、過去フレームの保持も新規描画パスの生成もできないため、頂点変形だけでは残像を実現できない。よって #22 は渦・波打ちのみ実装した。
- **変形の対象粒度は固定しない**。1つの変形単位に何文字をまとめるかは最終的な演出表現の都合で変わり楽曲区間でも変化するため、#22 は「呼び出し側が1つの文字内容として渡したものを1回の描画命令で変形する機構」に徹し、粒度の判断は後続の演出・曲プロファイル層に委ねる。同時に複数の変形単位を出すと描画命令はその個数になる（設計どおり）。受け入れ基準「全文一括変形が1回の描画命令」は「1回の spawnDeformingText で渡した1単位内の全グリフが1回の描画命令で描かれ一斉変形する」意味と確定した。

## 最重要の意思決定（troika ソースで確認した事実に基づく）

- **自前変形は troika 文字マテリアルの「基材」側に置き、その出力＝矩形展開後の配置済みグリフ座標を変形する**。troika の文字マテリアルの頂点変形は単位四角形 position.xy(0..1) を各文字の矩形へ展開する（`node_modules/troika-three-text/src/TextDerivedMaterial.js:43` の `position.xy = mix(bounds.xy, bounds.zw, ...)`）。曲率 uTroikaCurveRadius は既定0、向き uTroikaOrient は本プロジェクトでオブジェクト単位の正対（engine の quaternion 複写）を使うため実質単位行列。よって展開後の position は文字ローカル座標で、ここを変形すれば渦・波打ちになる。派生の頂点変形の実行順は「最も外側が先・基材が最後」（`node_modules/troika-three-text/src/BatchedText.js:360-457` の挟み込み構造）。`text.material = 自前の基材` を代入すると troika が `createTextDerivedMaterial` で上に被せる（`Text.js:524-528`）ため、自前変形が最後＝展開後に実行される。
- **各文字の矩形 aTroikaGlyphBounds は「取り込み層」を外側に足して受け渡す**。GLSL は識別子を使用前に宣言する必要があり、派生の宣言は内側の層が先・外側の層が後に並ぶ。aTroikaGlyphBounds は troika（外側）が宣言するため、基材側（内側）の層から直接参照すると「未宣言」になる（実機 ANGLE D3D11 で `ERROR: 'aTroikaGlyphBounds' : undeclared identifier` を確認）。基材側で重ねて宣言すると troika の宣言と二重になり非可搬。そこで troika 文字マテリアルのさらに外側に取り込み層を足し、そこで aTroikaGlyphBounds から各文字の中心を共有グローバル変数 gDeformGlyphCenter へ書き、基材側の層がそれを読む。共有グローバルは基材側の宣言（最初に並ぶ）で宣言するため両層から参照できる。実行順は「取り込み層（中心を書く）→ troika（展開）→ 基材側（中心を読んで変形）」。取り込み層は `Text` のサブクラス `DeformingTextMesh` が `createDerivedMaterial` を上書きして足す。これは troika 自身が BatchedText で使う挟み込みと同じ作法。
- **変形の時間進行はゲーム時刻で駆動する**。楽曲同期にはゲーム時刻が正典であり、troika-three-utils 内蔵の timeUniform は `Date.now()` 由来（`node_modules/troika-three-utils/src/DerivedMaterial.js:130-134`）で楽曲同期に使えない。独自ユニフォーム uDeformTimeSec を engine の update で毎フレーム `gameTimeMs / 1000` に設定する。
- **入力は既存 spawnPhrase を流用せず新APIを追加**。spawnPhrase は1文字ずつ Text を作り BatchedText に入れるが、BatchedText は各メンバの material を無視し自身の material を全メンバに使う（`BatchedText.js:46`）ため、メンバ単位の独自変形を載せられない。よって変形は単一 Text 化する `spawnDeformingText` を追加した（既存 spawnGlyph・spawnPhrase は変更しない）。
- **基材は troika 既定に揃える**。troika 既定マテリアルは `MeshBasicMaterial({ color:0xffffff, side:DoubleSide, transparent:true })`（`Text.js:16-20`）。自前基材も同じにする。色と不透明度は troika が text.color・text.fillOpacity からユニフォームへ流すため基材で二重設定しない（createTextDerivedMaterial が transparent と forceSinglePass を強制）。
- **資源解放は text.dispose() と基材 dispose の2つ**。Text.dispose() はジオメトリのみ破棄（`Text.js:499-501`）。派生マテリアルは基材の破棄時に troika のリスナで自動破棄され（`Text.js:530-533`）、DerivedMaterial.dispose は基材も破棄する（`DerivedMaterial.js:273-282`）。よって解放は text.dispose()（ジオメトリ）と部品 dispose（基材→troika 文字マテリアル・取り込み層へ連鎖）で過不足ない。release は集合所属を確認してから処理し冪等。
- **頂点変形は当たり判定・寿命・カリングに影響させない**。入力は2D画面座標で当たり判定し3次元交差判定もカメラ行列も使わない（src/input/README.md、#47）ため変形は判定に無影響。寿命はゲーム時刻と期限の比較で形状非依存。カリングは頂点変形がCPUの境界に反映されないため、変形単位の Text は `frustumCulled = false` にして誤った描画除外を防ぐ。

## 採用した数値・式とその理由（すべて理由を先に述べる）

- 渦の角度 `angle = uDeformStrength * sin(uDeformTimeSec * uDeformSpeed + r * uDeformSpatialFreq + uDeformPhaseOffset)`、r は変形中心 uDeformOrigin からの距離: 各文字の自転ではなく中心から放射状にねじれる「渦」にするため距離 r に角度を依存させる。中心の既定は (0,0)＝中央寄せ単位の局所原点。
- 波打ち `position.y += uDeformStrength * sin(uDeformTimeSec * uDeformSpeed + gDeformGlyphCenter.x * uDeformSpatialFreq + uDeformPhaseOffset)`: 各文字の中心の横位置に応じて縦に周期変位し、文字ごとに位相がずれるうねりにする。各文字の矩形（取り込み層が書いた中心）を使う。
- 時間を秒で持つ（uDeformTimeSec、換算は gameTimeMs / 1000）: 三角関数の位相を秒で扱うとGLSL内の単位換算を無くせて読みやすいため。
- 性能の合否の硬い下限は Issue #20 確立値（平均55フレーム毎秒以上・単発フレーム落ち5回未満・初回表示遅延100ミリ秒未満、`scripts/typography-fps.mjs:19-25`）を流用: 同じ部分系で別の数値を使うと比較できないため。Issue本文の「60フレーム毎秒」は品質保証文書 docs/research/08-quality-assurance.md が「平均と下位5パーセンタイル両方で毎秒60」を警告水準の目標と位置づけるのに対応し、達成度として表示する（硬い下限は☆値）。
- スモークの描画命令数の許容余裕は2: 発光を切った診断シーンの描画命令数は「枠組みの定数 + 変形単位の数」になる。1単位＝1つの Text＝1回の描画命令（縁取りなしで追加描画なし）であり、枠組み（描画パスと画面消去）の分を小さな余裕として許す。

## 実機検証の結論（対象環境、結論のみ）

実機GPU（ANGLE Intel Iris Xe Direct3D11）で計測。
- 型検査（npm run typecheck）合格。単体テスト（npm test）524件すべて合格（うちキネティックタイポ51件、新規 deformMaterial 8件・engine.deform 8件）。静的ビルド（npm run build、Node 22）合格。
- 実レンダリング検査（scripts/typography-deform-smoke.mjs）合格: 渦・波打ち両シェーダが実機でコンパイル成功（先行暖機で両種を確実にコンパイル）、ページ例外0、各変形単位が1回の描画命令（描画命令2 ≦ 変形単位1 + 余裕2）。
- 性能（scripts/typography-fps.mjs、最悪集中区間58秒〜）合格: desktop_deform 平均60・下位5%60・単発落ち0、desktop_deform_initlatency 初回遅延42ミリ秒（先行暖機後）、mobile_deform 参考も平均60。変形あり平均60＝変形なし平均60で頂点変形の追加負荷の差0（性能退行なし）。

## 実装した内容

- 新規 `src/typography/kineticText/deformMaterial.ts`: 種類 `DeformKind`、基材マテリアル生成 `createDeformMaterial`（ユニフォーム uDeformTimeSec・Strength・Speed・SpatialFreq・PhaseOffset・Origin と setTimeSec・setParams・dispose）、基材側変形GLSL組み立て `buildBaseDeformTransform`、取り込み層GLSL定数 `CAPTURE_DEFORM_TRANSFORM`、取り込み層を足す `DeformingTextMesh`（Text サブクラス）、変形部品生成 `createDeformingTextUnit`。three・troika-three-text・troika-three-utils を名前付きで取り込む。
- 新規 `src/types/troika-three-utils.d.ts`: createDerivedMaterial と DerivedMaterial・DerivedMaterialOptions の最小宣言（実体存在は troikaExports.test.ts で実行時確認）。
- 更新 `src/types/troika-three-text.d.ts`: Text に letterSpacing と createDerivedMaterial を追加。
- 更新 `src/typography/kineticText/types.ts`: DeformKind・DeformParams・DeformingTextSpawnRequest・DeformingTextHandle を追加、EngineStats に activeDeformingTexts、KineticTextEngine に spawnDeformingText。
- 更新 `src/typography/kineticText/engine.ts`: spawnDeformingText・releaseDeforming・update での時間進行・dispose・stats を追加。内部差し替え口 createDeformingTextUnit を追加（単体テスト用）。
- 更新 `src/typography/kineticText/index.ts`: 追加した公開関数・型を再公開。
- 新規 `src/typography/kineticText/diagnostics/deformWarmup.ts`: 渦・波打ち両シェーダの先行暖機（画面外・不透明度0の単位を出し12フレーム描画後に解放）。
- 更新 `src/typography/kineticText/diagnostics/stressProfile.ts`: extractPhrases（フレーズ単位のテキストと開始時刻）・buildDeformProfile（フレーズを変形単位として渦・波打ち交互に出す計画）を追加。
- 更新 `src/typography/kineticText/diagnostics/main.ts`: profile=deform 分岐、先行暖機、profile に応じた初回遅延プローブ、window.__drawCalls・__activeDeformUnits の公開、HUDに変形数と描画命令数。
- 更新 `src/types/globals.d.ts`: __drawCalls・__activeDeformUnits を宣言。
- 更新 `scripts/typography-fps.mjs`: desktop_deform（合否）・mobile_deform（参考）・desktop_deform_initlatency（合否）を追加、変形あり/なしの平均差分をログ。run が計測値を返すよう変更。
- 新規 `scripts/typography-deform-smoke.mjs`: profile=deform の実レンダリング検査（ページ例外0・実機GPU・シェーダコンパイル誤りなし・各変形単位が1回の描画命令）。package.json に smoke:typography 登録。
- 更新 `package.json`・`package-lock.json`: troika-three-utils を直接依存に追加（推移的依存だが直接 import するため宣言）。

新規・更新した単体テスト: `deformMaterial.test.ts`（ユニフォームと setTimeSec・setParams、buildBaseDeformTransform と CAPTURE_DEFORM_TRANSFORM のGLSL差分）、`engine.deform.test.ts`（単一 Text 生成・frustumCulled 無効・sync・古い完了通知の無視・時間の秒換算・カメラ正対・自動解放・release の冪等）、`troikaExports.test.ts`（troika-three-utils の createDerivedMaterial の実体確認を追加）。役割分担: 単体テストは呼び出し順・ユニフォーム値・冪等性を、実シェーダ派生とGPU描画はスモークと性能計測が担う。

## レビューと検証（事実）

- 計画段階で Codex のレビューを2回反復。残像のスコープ外・粒度を固定しない方針、渦を中心からの半径依存回転に、ユニフォーム名の明確化、基材の描画状態を troika 既定に踏襲、dispose 経路の実確認、実レンダリングsmokeの追加、先行暖機と初回遅延の分離計測、mobile 計測の追加、release の冪等化、テストの役割分担の明記を反映した。
- 実装中に、波打ちが aTroikaGlyphBounds を基材側で参照して実機コンパイルに失敗することを smoke で検出し、取り込み層＋共有グローバルの挟み込み（troika の BatchedText と同じ作法）へ修正した。

## 実装後の Codex レビューと反映（妥当な指摘の解消）

実装後に Codex の妥当性レビューを受け、「マージ可」評価のうえで挙がった指摘を妥当性で選別して解消した。
- 解消（中程度）: createDeformingTextUnit の dispose がジオメトリを破棄しない問題を、dispose をジオメトリ破棄と基材破棄の一元化＋冪等化で解消し、engine の releaseDeforming も部品 dispose 一本に集約した（直接利用でのジオメトリ取り残しを防ぐ）。
- 解消（中程度）: troika 内部前提（派生順・属性名 aTroikaGlyphBounds・取り込み層の上書き）への依存に対し、troika-three-text と troika-three-utils を厳密固定（0.52.4、キャレット無し）にした。理由を先に述べる: 取り込み層方式は troika の文書化されていない内部挙動に依存し、パッチ更新で型検査に出ない破壊が起こり得るため、意図しない更新を止める。順序崩れの実機検知は smoke:typography（コンパイル失敗を検出する。実装中の波打ち失敗を実際に捕捉済み）が担う。
- 解消（中程度）: 各文字の中心が効いていること（取り込み層が troika 文字マテリアルを包んでいること）を単体テストで構造検証（派生の1つ内側が isTroikaTextMaterial を持つ＝取り込み層が troika の上に乗っている）。取り込み層が外れる回帰を捉える。GPU を要する実画素差分でなく構造で確かめる理由は、実シェーダのコンパイルと描画は smoke が担うためである。
- 解消（軽微）: 低レベルの createDeformMaterial・buildBaseDeformTransform を公開窓口（index）から外し、主APIを createDeformingTextUnit に一本化（単独利用での劣化を防ぐ）。両関数は内部とテストから直接の取り込みに留め、低レベル関数に単独利用の注意を明記。
- スコープ外として据え置き（理由を明記）: 同時変形数の上限管理とパラメータの範囲制限は、エンジンが演出意図を持たない依存規則（architecture §5）により演出・曲プロファイル層（#131・#46）の責務であり #22 では扱わない。診断の活動中変形数は window.__activeDeformUnits と stats().activeDeformingTexts で監視可能にしてある。

再検証（実機GPU・上記反映後）: 型検査クリーン、単体テスト527件合格、ビルド(Node 22)合格、実レンダリングsmoke合格（描画命令2 ≦ 変形単位1 + 余裕2、ページ例外0）。

## 次の一手

- PR #143（base main、Closes #22）を作成・push 済み。CI とゴール基準の確認後にマージする。
- 後続: #26（渦演出はこの機構を使う・受け入れ基準は渦角速度≤10°/frame）、#131（演出合成エンジンがこの変形を演出要素として合成）、#33（TAKEOVER 譜面で最終検証）。本編結線 #59 で実際の歌詞へ接続。
- 留意: 診断シーンの空の一括層が三角形カウンタを Infinity にする既存のクセがあり（変形とは無関係）、smoke は三角形数ではなく描画命令数と変形単位数の関係で「描かれたこと」を判定する。
