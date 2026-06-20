# 実装チェックポイント Issue #15 描画層合成（3D＋2D）

実装完了。ブランチ `worktree-issue-15-layer-composite`。型検査・単体テスト（516件）・本番ビルド（診断ページ除外確認）・検証ビルド・全スモーク（layer/rendering/screens/engine-loop/glow/input/credits）すべて成功。

## ゴールと達成基準
単一のWebGL描画領域で「3次元の合成 → 深度のみ消去 → 正射影カメラで2次元層を最前面」のパス順を実装し、後続Issue（落下式レーン #57・左端音程帯 #58・反応位置の光点）が2次元層へ表示物を載せる土台を提供する。受け入れ基準「2D層が確実に最前面・z-fightなし」を、画素読み戻しによる実証（中央領域の全標本が赤＝最前面かつz-fightなし、外側標本が緑＝3次元の色の保持）で満たす。

## 実装内容（ファイル）
- 新規 `src/rendering/overlay.ts`: `createOverlayLayer`。正射影カメラ（`OrthographicCamera`、near=0・far=2000・カメラz=1000で z=0 の物体を可視範囲中央に置く。three.js の near は0以上が公開契約のため負値を避ける）＋専用 `Scene`＋登録口。契約は `scene`・`camera`・`addObject`・`removeObject`・`composite(renderer)`（`setRenderTarget(null)`→`clearDepth()`→`render`を集約。本番と診断で共有）・`resize`・`objectCount`・`frustum`・`dispose`（シーンからの取り外しのみ。載せた物体のGPU資源は載せた側が解放）。
- 変更 `src/rendering/viewport.ts`: 純粋関数 `computeOverlayFrustum(w,h)`（`{left:-縦横比, right:+縦横比, top:1, bottom:-1}`、`computeAspect` 再利用）と `overlayPointFromNormalized(nx,ny,aspect)`（`x=(nx-0.5)*2*aspect`、`y=(0.5-ny)*2`、非有限は原点）。
- 変更 `src/rendering/renderRoot.ts`: 構築時 `renderer.autoClear=false`。`if(renderer)` で初回描画前に `createOverlayLayer` 生成。`render()` を「合成器（または防御経路で `renderer.clear()`＋素描画）→ `overlay.composite(renderer)`」に変更。`resize()` で `overlay.resize`。公開契約に `addOverlayObject`・`removeOverlayObject`。`state()` と `RenderState` に `overlay`（物体数・視錐台、WebGL不可は null）。`dispose()` で `overlay.dispose` を描画器破棄前に。
- 新規 受け入れ診断 `src/rendering/diagnostics/layerComposite/main.ts` ＋ `layer-composite.html`: 自前描画器（`autoClear=false`）＋視野を覆う緑の平面＋本番と同じ `createBloomComposer`（ブルーム有効）＋ `createOverlayLayer` の中央を覆う純赤の物体。本番と同じ手順で5フレーム描き、生 `gl.readPixels`（左下原点・端末画素、`preserveDrawingBuffer`不要）で中央3×3点（赤期待）と外側1点（緑期待）を読み戻し `window.__layerCompositeState` で公開。`--mode app` 非配信。
- 新規 `scripts/rendering-layer-smoke.mjs` ＋ `package.json` `smoke:layer` ＋ `ci.yml`（除外確認に `dist/layer-composite.html` 追加、glowスモークの次に層合成スモーク段追加）。
- 変更 `vite.config.ts`: 検証用ビルド入力に `layerComposite: "layer-composite.html"`（`--mode app` には足さない）。
- 変更 `src/types/globals.d.ts`: `__layerCompositeState` 型を追加。`__renderState` 型を `state()` に一致させ既存欠落欄（`reflectionEnabled`・`reflectionResolution`・`bloom`・`centerFigureStatus`・`centerFigureError`）と `overlay` を補完。
- 変更 `scripts/rendering-smoke.mjs`: 本番 `renderRoot` の `state().overlay` が非nullで視錐台が規約どおり（上+1・下-1・左右±縦横比、許容差1e-6）を確認。
- 変更 `src/rendering/README.md`: 層合成の実装内容（手順・座標規約・公開契約・反射/ブルーム非包含・2次元層内重ね順は後続Issue責務・検証）を記載。

## 主要な設計判断（Codex二重レビューで確定）
- 座標規約（ユーザー決定）: 画面の高さを単一の基準軸として正規化。中央原点・縦[-1,+1]（NDC一致）・横[-縦横比,+縦横比]。両軸の単位長同一で等方、縦横比のみで決まり解像度・画素密度倍率に非依存。端末画素換算は両軸とも「描画バッファ高さ÷2」。
- 合成手順は three.js 0.184 のソースで裏取り。`RenderPass` は `autoClear` に依らず自前クリア、`Reflector` も `autoClear=false` を検知して明示クリアするため既存描画は不変。色一致は画面直接描画でも `outputColorSpace`（sRGB）変換が適用され `OutputPass` と一致（`toneMapping` は既定の無変換のまま）。スモークの画素読み戻しでも実証。
- 診断は本番と同じ合成器（`createBloomComposer`）経路を通すことで検証経路を本番と一致させる。赤の物体は不透明で合成後に上書きするため緑のブルームのにじみは中央標本を汚染しない。

## スコープ外（理由）
2次元層の中身（#57 落下式レーン・#58 音程帯・入力フィードバックの光点）と2次元層内の物体どうしの重ね順（後続Issueが `renderOrder` または `depthTest`/`depthWrite` 無効で扱う）。

## 検証で判明した運用上の注意
ワークツリーでスモーク検証する際、ポート4173に旧プレビューサーバが残っていると旧distが配信され誤った失敗になる。プレビュー起動失敗（ポート競合）を `preview.log` で確認し、占有プロセスを停止してから再起動する。

## 目視確認
開発サーバ（`npm run dev`）で次を確認した。`/layer-composite.html` は緑の背景（3次元）の上に赤い四角（2次元層）が中央に最前面で表示され、2次元層が3次元より手前・z-fightなしを目視で確認。`/?smoke=1` は従来どおりの深夜の湖の情景（反射・ブルーム・雨・中心の光の柱）が見え、2次元層が全面を覆うなどの異常がなく既存描画に回帰がないことを確認。

## レビュー
Codex（読み取り専用）に3回レビューを委譲した。1回目は基盤の妥当性確認、2回目で `OrthographicCamera` の near=-1000 が three.js 0.184 の公開契約外（near は0以上）との指摘を受け near=0・far=2000・カメラz=1000 へ修正、3回目で「このまま push して良い・要修正なし」の判定を得た。

## 提出状況
ブランチ `worktree-issue-15-layer-composite` にコミットして origin へ push 済み。Pull Request #146（base: main、本文に Closes #15）を作成済み。

## 次の作業
2次元層の土台（`addOverlayObject`／`removeOverlayObject`、座標写像 `overlayPointFromNormalized`）の上に #57・#58・入力フィードバックの光点を構築する。
