# 実装チェックポイント（2026-06-20・Issue #64）

**状態: Issue #64（ミクVRMローダー＋常在配置＋出典表記）の実装を完了。ブランチ `feat/issue-64-miku-vrm` で PR #135 を作成・push 済み。型検査・単体テスト338件・スモーク・本番ビルド・実ブラウザ目視に合格。CI 通過を確認のうえマージへ進む。**
**用途**: セッション喪失時の復帰点（マイルストーンM2、描画基盤 [[implementation_checkpoint_2026-06-19_issue8]] の上に積む。反射 [[implementation_checkpoint_2026-06-20_issue9]]・ブルーム [[implementation_checkpoint_2026-06-20_issue11]] と共存）。仕様の出典は作品仕様 `docs/idea/concept-final.md` §1・§12・§13、ミク常在化の意思決定 [[concept_revision_checkpoint_2026-06-18]]、規約と素材調達 `docs/research/05-asset-procurement.md` §3・§5・`docs/concept.md`、アーキテクチャ `docs/decisions/architecture.md` §3.5・§4・§5。

## 最重要の意思決定

- **照明・中心オブジェクト・VRMローダを `src/rendering/` 内部に置く**: アーキテクチャ正典（§4）が「描画はシーン組立・描画対象クラス・ローダを持つ」と定めるため、中心キャラクターの構成要素を描画の層に置く。シーンとカメラの外部公開（#33・#59 が将来必要とする別件）は本Issueでは行わない。中心オブジェクトの状態は `RenderRoot` の内部で生成・破棄する既存の流儀（水面・暫定発光点と同じ）に合わせる。
- **段階的な表示（光柱からVRMへ）**: VRMは容量が大きく（約16メガバイト）読み込みに時間がかかり、端末によっては読み込めない。先にコード描画の光柱を中心へ立て、読み込めたら差し替えることで、待ち時間中も読み込み失敗時も中心が空にならない。Issue 本文の「困難時はコード描画のシルエットまたは光柱で代替」を、縮退表示として常時備える形で満たす。
- **出典は読み込み成否に依らず常時表示**: 正典（`docs/research/05-asset-procurement.md` §5）が指定文言の常設を求め、Issue 本文も常時表示を求める。読み込み完了を待たず `createApp` 起動時に画面下端のDOMバッジを取り付ける。包括的なクレジット区画（#77・#82）が後でこれを統合する。
- **差し替えの単一地点**: モデルの配信先・配置・スケール・向き・出典・来歴を1つの設定値 `MIKU_CHARACTER`（`src/config/character.ts`、型は `src/types/character.ts`）に集約する。差し替えはこの設定値の変更と `public/models/miku/` のファイル置換だけで完結する。型を `types`、値を `config` に分けるのは、`config` を値のみ・`rendering` を型のみの参照に保ち層の依存方向を乱さないため（`src/config/README.md`・`src/types/README.md`）。
- **後始末で画像ビットマップを明示的に閉じる**: three.js のテクスチャ破棄はGPU資源を解放するが、読み込み時に生成された画像ビットマップ（ImageBitmap）は閉じないため別途閉じないと処理系側に残る（§3.5）。マテリアルの直接プロパティと、MToon のようなシェーダ材質の uniforms の双方から、特定の地図名を列挙せず型で判定してテクスチャを集合へ集め（共有テクスチャの二重処理を避ける）、参照を辿れる間に画像ビットマップを閉じてから `VRMUtils.deepDispose` でGPU資源を解放する。
- **後始末との競合ガードと世代管理**: 読み込みの完了と後始末・再読み込みは前後しうる。後始末済みのとき、または新しい読み込みに追い越されたときは、後から届くVRMをシーンへ取り込まず解放する。破棄したはずの資源がシーンに残ることと、古い読み込みが新しい設定を上書きすることを防ぐ。

## Issue #64 本体で実装した内容

- `src/types/character.ts`（新規）: 型のみ。`CharacterCredit`（出典の必須4要素）と `CharacterModelConfig`（配信先・配置・スケール・向き・表示名・出典・来歴）。
- `src/config/character.ts`（新規・テスト付き）: 値のみ。`PCL_CREDIT`（確定済みのピアプロ・キャラクター・ライセンス文言）と `MIKU_CHARACTER`。配信先は `/models/miku/miku-magical-mirai-2026_V02.vrm`。
- `src/rendering/lighting.ts`（新規・テスト付き）: `createNightLighting`。淡い環境光（`AmbientLight`）と背後上方からのリムライト（`DirectionalLight`）の2灯を入れ物にまとめて返す。
- `src/rendering/loaders/vrmLoader.ts`（新規）: `loadVrm`。`GLTFLoader` に `VRMLoaderPlugin` を登録して読み込み、`VRMUtils.removeUnnecessaryVertices`・`combineSkeletons` で頂点と骨を整理、視錐台カリングを無効化、`VRMUtils.rotateVRM0` で VRM0.0系の前方を正規化。後始末は画像ビットマップを閉じてから `VRMUtils.deepDispose`。
- `src/rendering/entities/centerFigure.ts`（新規・テスト付き）: `createCenterFigure`。初期は光柱（縮退表示）、`swapToVrm` でVRMへ差し替える。契約は `object3d`・`update(秒)`・`status()`・`dispose()`。光柱は加算合成・深度書き込みなし・トーンマップ無効で、明滅を `update` で与える。
- `src/app/attribution.ts`（新規）: `createAttributionBadge`。出典の必須4要素を画面下端へ常時表示するDOM要素。ライセンスのアドレスへのリンクのみ入力を受け、ゲームのタップを妨げない。
- `src/rendering/renderRoot.ts`（変更）: `RenderRoot` に `update(秒)` と `mountCenterCharacter(config)` を追加。`RenderState` に `centerFigureStatus`（fallback＝光柱・loaded＝VRM・error＝失敗で光柱継続）と `centerFigureError`（短い失敗理由）を追加。生成時に照明と中心オブジェクトをシーンへ組み込み、破棄時に描画器破棄より前に解放。後始末との競合ガードと世代管理を実装。
- `src/app/index.ts`（変更）: 起動時に出典バッジを取り付け、`mountCenterCharacter(MIKU_CHARACTER)` を呼び、毎フレーム `update(realDeltaMs / 1000)` を `render` の前に呼び、後始末でバッジを破棄。
- `src/rendering/index.ts`・`src/rendering/README.md`・`src/style.css`（変更）: 公開窓口に診断状態の型を追加、責務の記述、出典バッジの様式を追加。
- `package.json`・`package-lock.json`（変更）: 依存 `@pixiv/three-vrm` を正確な版 `3.5.4` で固定（範囲指定の記号を使わず、締切前の依存更新による挙動変化を避ける）。
- `public/models/miku/miku-magical-mirai-2026_V02.vrm`（新規）: 配信用のVRM。配信ディレクトリは `public/` のみのため、ここを唯一の実体の置き場所とする。

## 採用した数値とその理由（すべて理由を先に述べる）

- 毎フレームの秒への変換 = 経過ミリ秒 ÷ 1000: three.js のVRM更新は経過時間を秒で受け取る仕様のため、1秒は1000ミリ秒であることに基づいて変換する。
- スケールの初期値 = 3.0: 中心の存在感と、灯し（半径およそ0.2）に囲まれた構図の調和を、暫定カメラ（位置 x=0,y=14,z=34・注視点 x=0,y=1,z=0）での見えで確かめる。実寸相当の1.0は画面比およそ8分の1と小さく、6.0は腕が画面幅いっぱいで他要素を圧倒するため、明瞭に見えて存在感の出る3.0を採る。最終的な寄りはカメラ軌跡（#13・#59）が担う。
- 環境光の強さ = 0.55（1未満）: 深夜の暗さを壊さず、モデルの正面が完全な黒に沈むのを防ぐ控えめな値とする。
- リムライトの強さ = 1.6、位置を背面（z<0）かつ上方（y>0）: 背後上方からの平行光でカメラ側から見て輪郭が縁取られ、暗い背景から分離する。
- 光柱の高さ = 2.6、明滅の角速度 = 2×円周率÷3（1周およそ3秒）: 原点（水面 高さ0）に立つ人の背丈に近い柱とし、底面を水面へ合わせるため高さの半分だけ上へ移す。慌ただしくない深夜の気配として約3秒周期で脈打たせる。

## レビューと検証（事実）

- 計画段階で Codex のレビューを2巡反映: 存在しない後始末ユーティリティへの依存を撤回し `VRMUtils.deepDispose` と画像ビットマップのクローズに変更、出典を読み込み成否に依らず常時表示へ、差し替えの引数を設定値に、後始末との競合ガードと世代管理を追加、診断状態を追加、廃止予定の `removeUnnecessaryJoints` を使わず `combineSkeletons` を採用、配信ファイルを `public/models/miku/` に一元化。
- `npm run typecheck`（厳格・両設定）: 型エラーなし。
- `npm run test`（vitest）: 338テスト全通過（新規18件＝設定の妥当性6・照明の組み立て4・中心オブジェクトの状態遷移と競合ガード8）。
- `npm run smoke`・`npm run smoke:glow`: 画面遷移と発光点描画のいずれも合格し退行なし。
- `npm run build:app`（本体のみ、Node 22）: 成功。配信物にVRMが `dist/models/miku/` として含まれることを確認。Node 24系は `vite build` が異常終了する既知の環境問題のため Node 22系（`.nvmrc`）で実施。
- 実ブラウザ目視（診断モード `?smoke=1`、擬似再生）: 中心オブジェクトの状態が fallback から loaded へ遷移（読み込み成功・失敗理由なし）、出典バッジが題名・プレイ・結果の全画面で常時表示されライセンスのアドレスへのリンクを含む、ミクがリムライトで縁取られ水面に反射しブルームで過剰に発光せず中心に描画されることを確認。スケールの目視比較（1.0・3.0・6.0）で3.0を採用。

## 次の主要作業

1. PR #135 のCI通過を確認しマージ（本チェックポイント push 後）。
2. ミクに依存する後続: #92（常在配置の登場タイミング・ウォームアップからプレイへの遷移時点で既在）、#93（モーション抽象層・現在は両腕を真横に伸ばしたVRMの初期姿勢で、自然な待機姿勢への変更を担う）。両者は本Issueの `mountCenterCharacter` と中心オブジェクトを土台にする。
3. 最終的なカメラの寄りは #13・#59 のカメラ軌跡が担う。中心オブジェクトのスケール初期値はそれに合わせて再調整しうる。
4. 出典の包括的なクレジット区画は #77・#82 が本バッジを統合する。マイルストーンM2の後続は #15（描画層合成）・#105（舞台土台モデル）。
