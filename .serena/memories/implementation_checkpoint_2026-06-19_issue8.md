# 実装チェックポイント（2026-06-19・Issue #8）

**状態: Issue #8（three.js 描画基盤）の実装を完了。ブランチ `feat/issue-8-rendering-foundation` で PR #116 を作成・push 済み。CI（型検査・単体テスト・ビルド・3スモーク、Node 22）通過。マージへ進む。**
**用途**: セッション喪失時の復帰点（実装フェーズ・マイルストーンM2の最初の1件）。前段は [[implementation_checkpoint_2026-06-19_issue5]]、その前は [[implementation_checkpoint_2026-06-19_issue4]] と [[implementation_checkpoint_2026-06-18_issue3]] と [[implementation_checkpoint_2026-06-18_issue2]]。設計正典は [[phase2_design_checkpoint_2026-06-14]]、技術スタックとディレクトリは `docs/decisions/architecture.md`、描画方針は `docs/research/03-rendering-ui.md` と `docs/research/06-tech-stack-and-architecture.md`。

## 最重要の意思決定

- **本体統合・全画面背面に常在**: 描画基盤を本体アプリへ統合し、`index.html` の常在領域 `#stage` に canvas を載せて題名・準備・プレイ・結果の全画面の背面に深夜の湖の背景として常在させる。受け入れ基準（クリアカラー適用・リサイズで縦横比正確）は実ブラウザでの観測を要し、既存の検証基盤（本体を `?smoke=1` で開き診断グローバルを Playwright で読む方式）に最も自然に乗るため、本体へ統合した。`#stage` は `position:fixed`・`inset:0`・`z-index:0`・`pointer-events:none`、`#app` は `z-index:1` とし、背面 canvas が前面の画面UIとオーバーレイの操作を妨げない。
- **描画はビューに徹する・単一WebGL**: `rendering` は状態を読むだけで判定・得点・時刻の論理を持たず、`profiles`・`tools` を import しない（`docs/decisions/architecture.md` §5）。WebGL レンダラは1つだけ生成する（スマートフォンの WebGL 描画領域数の上限を超えないため）。
- **検証の二系統**: 寸法計算は純粋関数 `viewport.ts` に切り出し、node 環境の vitest で決定的に単体検証する。WebGL の生成は node 環境で行えないため、その配線は実ブラウザの Playwright スモーク `scripts/rendering-smoke.mjs` で検証する。診断グローバル `window.__renderState` を診断モードでのみ取り付ける（既存の `__engineState`・`__screenHistory` と同じ方式）。
- **WebGL2 の可用性を事前判定して縮退**: three.js 0.184 のレンダラは WebGL2 の文脈のみを要求し、生成失敗時に内部でエラー出力してから例外を投げる。既存スモークはコンソールのエラー出力を失敗として収集するため、生成不可の端末ではレンダラを構築する前に `isWebGL2Available` で判定し、three.js 内部のエラー出力を回避する。生成不可・失敗時は描画を無効化し、エンジン・画面・操作は動き続ける（`webglAvailable=false` で診断に表面化）。
- **層合成は Issue #15 へ先送り**: 「3次元を描く→深度情報だけ消す→正射影カメラで2次元層を最前面に重ねる」パス順は Issue #15 が担当する。本Issueでは先取りせず、物体ごとの表示層（`Object3D.layers`）を使わない方針を README に記録した。

## Issue #8 本体で実装した内容

- `src/rendering/constants.ts`（新規）: 画素密度の上限2・深夜色 0x05060a・霧の濃さ 0.012・カメラの視野角60度・近接面0.1・遠方面500。three.js を import せず、各値に採用理由を併記。
- `src/rendering/viewport.ts`（新規）: 純粋関数 `clampPixelRatio`（画素密度倍率を上限で抑える。非有限・0以下は1へ丸める）と `computeAspect`（縦横比を求める。幅または高さが非有限・0以下は1を返す）。
- `src/rendering/viewport.test.ts`（新規）: 上記2関数の単体テスト（5件）。
- `src/rendering/renderRoot.ts`（新規）: 単一 WebGL レンダラの配線 `createRenderRoot`。`render`・`resize`・`state`・`dispose` を持つ。Scene に背景色と指数霧、PerspectiveCamera、リサイズ追従、起動直後の1回描画。初期化途中の例外時は生成済みレンダラを破棄し canvas を取り外す。
- `src/rendering/index.ts`（新規）: `rendering` 層の公開窓口（`createRenderRoot`・`RenderRoot`・`RenderState`）。
- `scripts/rendering-smoke.mjs`（新規）: 描画基盤の実ブラウザ補助確認。
- `index.html`・`src/style.css`: 常在領域 `#stage` の追加と層の重なり指定。
- `src/main.ts`・`src/app/index.ts`: 描画基盤の生成・毎フレーム描画（`onFrame` で `renderRoot.render()`）・診断アクセサの取付・後始末の結線。`createApp` の引数に `stageRoot` を追加。
- `src/types/globals.d.ts`: 診断グローバル `window.__renderState` の型宣言。
- `src/rendering/README.md`: 確立した土台・公開契約・取り込み方針・層合成の担当（#15）・テスト方針・縮退を追記。
- `.github/workflows/ci.yml`: 描画基盤スモークの実行ステップを追加。

## 採用した数値とその理由（すべて理由を先に述べる）

- 画素密度の上限 = 2: 描画画素数は表示画素数×画素密度倍率で決まり、上限を設けないと高密度の端末で描画画素が過大になり毎秒60フレームを割るため、上限を2に固定する（`docs/decisions/architecture.md` §3.8）。
- 深夜色 = 0x05060a、霧の濃さ = 0.012、視野角 = 60度、近接面 = 0.1、遠方面 = 500: 描画性能の試作 `src/tools/perf/main.ts` で毎秒60フレームの成立と狙いの見えを確認済みの値であり、後続のカメラ軌跡（Issue #13）もこの視野角の試作軌跡で調整されているため、同じ値を採る。
- スモークの縦横比一致の許容 = 0.01: 縦横比は浮動小数の比であり、スクロールバー等で内寸が1画素ずれても比の差は0.01未満に収まるため、この値を一致判定の閾値とする。

## レビューと検証（事実）

- 計画段階で Codex のレビューを2巡反映: WebGL2 可用性の事前判定（three.js 内部のエラー出力回避）、リサイズ時の画素密度倍率は変化時のみ再設定（`setPixelRatio` が内部で `setSize` を呼ぶ二重リサイズの回避）、`computeAspect` の幅ガード、描画バッファ寸法を `getDrawingBufferSize` で取得、`#stage` の `pointer-events:none`、スモークの canvas 単一検証を採用。判別共用体化・層合成の先取り・補間係数の引き渡しは不要機能の先取りとして却下し、方針を README に記録。
- 実装後の Codex レビューで2点（レンダラ初期化失敗時の GPU 資源破棄漏れ、スモークのリサイズ後・描画バッファ高さ未検証）を指摘され、両方を反映。継続スレッドでの再レビューで両指摘の解消・新たな退行なし・依存規則と単一WebGLと受け入れ基準の充足維持を確認。
- `npm run typecheck`（厳格・両設定）: 型エラーなし。
- `npm run test`（vitest）: 58テスト全通過（既存53＋新規 `viewport` 5）。
- `npm run build`（3ページ構成、Node 22）: 成功。Node 24系は `vite build` が異常終了する既知の環境問題のため Node 22系（`.nvmrc`）で実施。
- プレビュー（ビルド済み成果物、Node 22）に対する3スモーク（描画基盤・画面遷移・エンジン）: すべて成功。描画基盤スモークは WebGL 文脈の生成可・クリアカラー05060a・画素密度倍率が上限内・描画バッファ寸法が表示寸法×画素密度倍率（幅と高さの両方）・カメラ縦横比が表示寸法に一致・canvas は `#stage` 内の1個だけ・リサイズで縦横比と描画バッファが追従・通常構成で診断アクセサが未公開、を確認。既存2スモークの回帰なし。
- PR #116 の CI（Verify ワークフロー、Node 22）: 型検査・単体テスト・ビルド・3スモークが通過。

## 次の主要作業

1. PR #116 のマージ（本チェックポイント push 後）。
2. マイルストーンM2の後続: #9（平面反射）・#10（発光点 InstancedMesh）・#11（ブルーム）・#13（カメラ軌跡）・#15（描画層合成 3次元＋2次元）。いずれも本Issueの `createRenderRoot`（`scene`・`camera`・`renderer` と毎フレーム描画フック）へ積み上げる。
3. マイルストーンM0残の #112（一時停止オーバーレイ・再開3-2-1カウントイン）、解析先行ゲートのマイルストーンM1（#34→#46→#96）。
