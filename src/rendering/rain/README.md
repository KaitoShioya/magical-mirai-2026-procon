# rain — 雨パーティクル（環境演出）の描画モジュール（Issue #12）

- **責務**: 深夜・雨の湖の世界観を作る雨パーティクルの描画ビュー。シーンへ追加する `Points` の生成・毎フレームの落下更新・資源破棄を行う（設計根拠 `docs/idea/concept-final.md` §2「雨は環境演出であり操作の判定対象ではない」）。
- **禁止依存**: 判定・得点・時刻の論理を持たない（更新はフレーム時間差ミリ秒を受け取るだけ）。`profiles`・`tools` を import しない。
- **three.js の取り込み**: 必要部品のみを名前付きで取り込む（`import { Points, BufferGeometry, BufferAttribute, PointsMaterial } from "three"`）。
- **試作からの昇格**: 値は試作 `src/tools/perf/main.ts`（雨は104〜129行・208〜215行）から逐語的に引き継ぐ。粒数800・色0x6a7ba0・大きさ0.07・不透明度0.5・深度書き込み無効・落下毎秒26ワールド単位・初期Y0以上40未満・巻き戻し加算40・X/Z中心±45。
- **試作との挙動差（後続実装者向け）**: 試作は粒数0のとき `Points` を生成しない（null 扱い）が、本モジュールは粒数0でも頂点数0の `Points` を返す。three.js は頂点数0を何も描画しないため視覚的な消滅は満たしつつ、呼び出し側の null 判定を不要にして契約を一様に保つ。
- **公開契約**: `createRainSystem(options?)` は `RainSystem`（`object: Points` / `update(deltaMs)` / `dispose()`）を返す。後続Issue（#15層合成・#59通し統合）が `scene.add(rain.object)` で本編へ載せ、毎フレーム `rain.update(deltaMs)` を呼ぶ。`dispose()` は冪等であり二回以上呼んでも安全（`renderRoot.ts` と同方式）。
- **入力の防御**: 粒数は `normalizeCount`（負・非整数は0以上整数へ畳み、非数・無限大は既定へ戻す）、時間差は `normalizeDeltaMs`（0以下・非数・無限大は0、正の有限値は上限100ミリ秒）で正規化する。上限100ミリ秒の根拠は `constants.ts` に記す。
- **テスト方針**: 純粋関数（`normalizeCount`・`normalizeDeltaMs`・`initRainPositions`・`stepRainColumn`）を Vitest（node 環境）で単体検証する（`rain.test.ts`）。`Points`・`PointsMaterial` など three.js オブジェクトの生成（不透明度0.5・深度書き込み無効・透明描画有効を含む）は node 環境で生成できないため、単体テストの対象にせず診断ページ `rain.html` の目視とコードレビューで確認する。
- **診断ページ**: `rain.html`（入口）と `diagnostics/main.ts`。クエリ `rain` で粒数、`dpr` で画素密度上限を切り替え、雨単体の連続落下と粒数0の消滅を目視確認する。本番ビルド（`vite build --mode app`）では配信しない。
