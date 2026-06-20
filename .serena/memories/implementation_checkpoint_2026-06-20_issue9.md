# 実装チェックポイント（2026-06-20・Issue #9）

**状態: Issue #9（平面反射レンダラ）の実装を完了。ブランチ `feat/issue-9-planar-reflection` で PR #123 を作成・push 済み。型検査・単体テスト204件・ビルド・機能スモーク・性能ゲート（実GPU）すべて通過。マージへ進む。**
**用途**: セッション喪失時の復帰点（実装フェーズ・マイルストーンM2の2件目、描画基盤 #8 の直接の後続）。前段は [[implementation_checkpoint_2026-06-19_issue8]]。設計正典は [[phase2_design_checkpoint_2026-06-14]]、技術スタックとディレクトリは `docs/decisions/architecture.md`、描画方針は `docs/research/03-rendering-ui.md`。

## 最重要の意思決定

- **反射は rendering 層の内部に閉じる**: 反射水面は描画対象として `src/rendering/water.ts` に置き、描画基盤 `createRenderRoot` が組み立てる。描画層は状態を読んで描くビューであり判定・得点・時刻の論理を持たず、`profiles`・`tools` を import しない依存規則を守る。three.js は名前付き取り込みのみを使う（容量を抑えるため。試作 `src/tools/perf/main.ts` は名前空間取り込みだが検証用ツールのため本番規約の対象外）。
- **Reflector を使い、描画呼び出しは変えない**: `three/examples/jsm/objects/Reflector.js` の `Reflector` を使う。`Reflector` は自身がシーンに属し描画前の処理で鏡像位置のカメラから反射像を別の描画ターゲットへ描くため、描画基盤の `renderer.render(scene, camera)` は変更不要。Reflector は描画中に自分を不可視にして無限の再帰を避け、シーン中の発光点・将来のミク（#92）・地形（#105）・雨を自動で映す。
- **起動時パラメータ refl で制御**: `refl=0` で無効（不透明な水面）、`refl=256`・`refl=512` で有効解像度。解釈は純粋関数 `src/rendering/reflection.ts` に切り出し node 環境の単体テストで検証する。読取は本体入口 `src/main.ts` が既存規約（`URLSearchParams`）で行い描画基盤へ素通しする。本番ビルドでも有効（実機での反射の手動調整、自動縮退 #97 導入前の退避手段）。
- **発光点とカメラ視点は暫定物を #9 に置く**: 受け入れ基準「発光点が水面に映る」を本Issue単体で確認するため、決定的・左右非対称・高さ違いの固定配置の暫定発光点（`src/rendering/placeholderGlow.ts`）を置く。配置を決定的にするのは撮影画像で鏡像反転を再現可能に判定するため。湖面を画面に収めるための暫定カメラ視点（`renderRoot.ts` の局所定数、水面より上に固定。カメラが水面より下だと Reflector は反射を描かないため）も置く。暫定発光点は #10、暫定カメラ視点は #13 で本実装へ置換する。
- **性能の判定対象は試作ページ、本編統合後は #97**: 本編アプリはブルーム（#11）・発光点本実装（#10）・雨・カメラ軌跡（#13）が未統合で反射対象がほぼ無い空のシーンのため代表性を欠く。試作 `prototype.html` は代表的な負荷を備え、その反射の構成は本編 `water.ts` へ移した構成と同一であるため、性能の合格はこれを基準とする。本編統合後の反射性能の再計測と本編へのフレーム計測の仕組みの追加は #97 へ委譲。

## Issue #9 本体で実装した内容

- `src/rendering/water.ts`（新規）: 反射水面。`createWater({ reflectionResolution })` が `Water` インターフェース（`object3d`・`reflective`・`reflectionResolution`・`dispose`）を返し呼び出し側を Reflector の具象型に依存させない。解像度0より大で `Reflector`、0で不透明 `Mesh`。平面は一辺400、`rotateX(-Math.PI/2)` で水平化し高さ0。後始末は反射経路で `Reflector.dispose()`（描画ターゲットとマテリアルのみ解放のため）に加えジオメトリを解放、無効経路でジオメトリとマテリアルを解放。
- `src/rendering/placeholderGlow.ts`（新規・暫定、#10で置換）: 決定的・非対称の固定配置の発光点 `InstancedMesh`。`setMatrixAt` 後に `instanceMatrix.needsUpdate`、`setColorAt` 後に `instanceColor.needsUpdate` を設定。
- `src/rendering/reflection.ts`（新規）: `resolveReflectionResolution`。未指定・空文字・空白・非数・範囲外は既定512、明示0で無効、256/512で可変。
- `src/rendering/reflection.test.ts`（新規）: 上記の全分岐と、重複指定で `URLSearchParams.get` が最初の値を採る結合の単体テスト。
- `src/rendering/constants.ts`（変更）: 水面の一辺400・水面色 0x0a0c12・既定反射解像度512・受け付ける解像度集合 `[0,256,512]` を追加。
- `src/rendering/renderRoot.ts`（変更）: `createRenderRoot(container, options?{reflectionResolution?})` 既定512。描画器生成成功時のみ反射水面と暫定発光点を生成しシーンへ追加、暫定カメラ視点を設定。診断状態に `reflectionEnabled`・`reflectionResolution` を追加（描画器が無いとき偽・0を構造的に保証）。後始末で反射水面と暫定発光点を描画器破棄より前に解放、冪等。
- `src/rendering/index.ts`（変更）: `resolveReflectionResolution` を再輸出。
- `src/app/index.ts`・`src/main.ts`（変更）: `refl` を解釈して描画基盤へ素通し。
- `scripts/rendering-smoke.mjs`（変更）: 反射の有効・解像度の診断確認を追加。
- `scripts/reflection-fps.mjs`（新規）: 試作ページを実GPUで計測する性能ゲート。
- `src/rendering/README.md`（変更）・`package.json`（変更、`reflection:fps` 追加）。

## 採用した数値とその理由（すべて理由を先に述べる）

- 水面の一辺 = 400、水面色 = 0x0a0c12: 試作で狙いの見えと毎秒60フレームの成立を確認済みの値であり、反射面の寸法と基調色をこれに合わせる。
- 既定反射解像度 = 512、受け付ける集合 = 0・256・512: 受け入れ基準が256と512の双方を要求し0で無効と規定するため、この3値のみを受け付け、既定は高品質側の512とする。
- 「最低」を下位5パーセンタイルで判定: 生の最小値は単発の谷（ごみ集めや基本ソフトの割り込み）に過敏で再現性が低い。計測ハーネスは計測時間12秒・500ミリ秒区間で標本21以上を確保し下位5パーセンタイルが最小値と一致しないよう設計しており、研究文書 第6節も平均と下位5パーセンタイルの両方で下限を満たすと規定するため、下位5パーセンタイルを採り生の最小値は参考表示とする。
- 性能計測の画素密度倍率 = 1: 受け入れ基準の「画素密度上限2」はアプリ側の画素密度の上限を指し、標準的な1920×1080のデスクトップ表示は端末の画素密度が1で実効1920×1080（上限2は拘束しない）になる。既存のデスクトップ計測 `scripts/prototype-fps.mjs` も画素密度倍率を1としている。

## レビューと検証（事実）

- 計画段階で Codex のレビューを3巡反映: 視覚検証の再現性（暫定発光点を決定的・非対称配置にしスクリーンショットを保存）、両経路の資源解放の明示、色空間・霧・描画前クリアの断定を実機確認事項へ格下げ、縮退時の状態整合の構造的保証、性能の境界（試作基準・本編は #97）の明文化、refl の境界値（空文字を既定へ、明示0のみ無効）、取り込み規約の適合を採用。
- 実装後の Codex レビューで「妥当（マージ可）」の判定。軽微な2点（`setMatrixAt` 後の `instanceMatrix.needsUpdate` 未設定、重複指定の仕様テスト未収録）を指摘され、両方を反映。
- `npm run typecheck`（厳格・両設定）: 型エラーなし。
- `npm run test`（vitest）: 204テスト全通過（既存＋反射解像度の解釈8件と重複指定の結合1件）。
- `npm run build`（Node 22）: 成功。Node 24系は `vite build` が異常終了する既知の環境問題のため Node 22系で実施。
- 機能スモーク `scripts/rendering-smoke.mjs`（プレビュー、ソフトウェア描画でも成立）: 反射診断4ケース（未指定で有効512、256で有効256、0で無効0、範囲外で有効512）通過。
- 性能ゲート `scripts/reflection-fps.mjs`（実GPU、ANGLE 経由の Direct3D11、Intel Iris Xe）: 解像度1920×1080・反射解像度256と512のいずれも平均と下位5パーセンタイルがともに毎秒60フレームで合格（基準は平均55以上かつ下位5パーセンタイル45以上）。当初 画素密度倍率2（4K相当）では反射の有無に関わらず一律約32フレームで画素数律速だったため、基準の表す環境（実効1920×1080）へ是正。
- 鏡像反転と映り込み: 保存画像で目視確認。試作は水面下に文字の上下反転像と発光点反射、`refl=0` で消失。本編は `refl=512` で発光点の反射が出現、`refl=0` で水面は残り反射のみ消失。
- 委譲事項を GitHub Issue #10・#11・#13・#15・#92・#97・#105 と `src/rendering/README.md` に明記。

## 次の主要作業

1. PR #123 のマージ（本チェックポイント push 後、ゴール基準の再レビューを経て）。
2. マイルストーンM2の後続: #10（発光点 InstancedMesh、本Issueの暫定発光点を置換）・#11（ブルーム）・#13（カメラ軌跡、本Issueの暫定カメラ視点を置換）・#15（描画層合成）・#105（舞台土台モデル、本Issueの水面ジオメトリを名前識別メッシュへ差し替え）・#92（ミク常在、反射対象の除外方針）。
3. 本編統合後の反射性能の再計測と本編へのフレーム計測の仕組みの追加（#97 描画性能ゲート）。
