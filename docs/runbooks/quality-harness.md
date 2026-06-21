# Runbook: 品質検査ハーネス（ローカル継続的検査の基盤）

品質ゲート（Issue #97〜#103）が共通利用する基盤。ローカルのGPU環境で描画・撮影・指標抽出を行い、クラウド（GPU無しのCI）ではファイル存在とJSONスキーマだけを検査する。仕様の正典は `docs/research/08-quality-assurance.md` の1節。本基盤は閾値判定をしない（合否は各ゲートと Issue #104 が担う）。下位5パーセンタイルは算出値であって合否ではない。実体は `scripts/harness/` と入口 `scripts/quality-harness.mjs`。

---

## 1. 構成

- `scripts/quality-harness.mjs` — コマンド入口。起動引数 `--mode` を解釈し、ローカルなら `run-local.mjs`、クラウドなら `run-cloud.mjs` を動的に読み込む。動的読み込みにより、クラウド経路はブラウザ起動部品（Playwright）の読み込みに到達しない。
- `scripts/harness/config.mjs` — 接続先・出力先・起動経路既定・ANGLE既定・GPU起動引数・計測時間既定・端末プロファイル。
- `scripts/harness/mode.mjs` — モード判定（純粋）。
- `scripts/harness/metrics.mjs` — 純粋関数（パーセンタイル算出・標本要約・ソフトウェア描画判定）と描画系統名の読み取り。Playwrightを読み込まない。
- `scripts/harness/schema-check.mjs` — ファイル存在確認とJSONスキーマ適合判定（ajv）と検査の登録簿。
- `scripts/harness/report.mjs` — レポートのJSON整形と書き出し（ブラウザ起動部品を読み込まない）。
- `scripts/harness/browser.mjs` / `page.mjs` / `run-local.mjs` — ブラウザ起動・ページ操作・ローカル実行。
- `scripts/harness/run-cloud.mjs` — クラウド実行（スキーマ検査のみ）。

## 2. 事前準備

初回は次でChromiumを取得する。起動経路 `chromium` はこの取得済みChromiumで動き、別バイナリの取得は要らない。

```sh
npx playwright install chromium
```

## 3. ローカル実行手順

別端末で開発サーバを起動してから、品質ハーネスを実行する。出力は `scripts/.quality-out/`（`.gitignore` 済み）。

```sh
npm run dev   # 5173番で起動（別端末で起動したまま）
```

```sh
# PowerShell
$env:BASE='http://localhost:5173'; npm run quality
# Unix系シェル
BASE=http://localhost:5173 npm run quality
```

任意ノブ（起動引数）:
- `--channel=chromium|chrome|msedge` — 起動経路。既定 `chromium`。
- `--angle=d3d11` — ANGLEバックエンド。既定 `d3d11`。
- `--duration=12000` — 計測時間（ミリ秒）。既定12000。
- `--allow-unknown-renderer` — 描画系統名が取得できない環境を調べるときだけ使う（後述）。

## 4. GPU有効化の採用理由

クラウドにはGPUが無く、ヘッドレスのブラウザは既定でソフトウェア描画にフォールバックするため、毎秒フレーム数と見た目の計測値が実機の性能を表さない（`docs/research/08` の1節）。Windows 11では仮想ディスプレイ方式が使えないため、起動経路 `chromium`（Playwright公式が「新しいヘッドレスモード」と呼ぶGPU適性のある経路）でANGLEのDirect3D 11経路を指定する。

実GPUが効いているかの判定は、起動設定でなく描画系統名の実測を唯一の根拠とする。WebGLの拡張 `WEBGL_debug_renderer_info` の非マスク描画系統名を読み、ソフトウェア描画を示す語（`SwiftShader`・`llvmpipe`・`Software Rasterizer`・`Microsoft Basic Render Driver`・`WARP`）を含む場合、または描画系統名が取得できない場合は、ローカル実行を失敗させる。手元での追加確認として `chrome://gpu` の「ハードウェア高速化」表示を併用できる。

## 5. 実GPUが得られない場合の対処

- 起動経路ノブ `--channel` で導入済みの Chrome（`chrome`）や Edge（`msedge`）へ切り替える。これらはシステムに該当ブラウザが導入されていないと起動に失敗するため、導入の有無を確認する。
- それでもソフトウェア描画になる場合は、レポートの `renderer` に描画系統名が残るので原因を追える。
- 描画系統名が取得できない環境を調べるときに限り `--allow-unknown-renderer` で続行できる。その実行の計測値はレポートで `trusted` が偽になる（`trusted` は `rendererInfoAvailable` が真、かつ `softwareRendering` が偽のときだけ真）。描画系統名が取得できて、かつソフトウェア描画のときは、このノブを与えても合格させない。

## 6. クラウド（CI）との違い

クラウド（CI）は `--mode=cloud` でファイル存在とJSONスキーマだけを検査し、描画・撮影・フレーム計測を一切しない。`package.json` の `quality:cloud` が `node scripts/quality-harness.mjs --mode=cloud` を呼ぶ。Issue #95時点は検査の登録が無いため登録0件で合格する。Issue #96 が曲プロファイルの検査を `registerSchema` で登録した時点で実検査が効く。スキーマ検査機構（ajv）の正しさは `npm run test`（vitest）の単体テストで担保する。

## 7. 拡張指針

- 新しいゲートは `scripts/harness` の必要なモジュールを直接読み込む（再エクスポートの入口は設けない。純粋関数の単体テストやクラウド経路が不要にブラウザ起動部品へ到達するのを防ぐため）。
- 新しい計測フックは `src/tools/perf/main.ts` に足し、`src/types/globals.d.ts` と `src/tools/README.md` の契約記述を更新する。
- 例外: 性能プロトタイプ（`prototype.html`）と別の情景を検査するゲートは、文字可読性ゲート（`readability.html`）と同じく専用診断ページに固有のフックを置く。空間品質ゲート（下記9節）は専用診断ページ `spatial.html` に `window.__spatialReady`／`__spatialState`／`__spatialCapture` を置き、契約は `src/types/globals.d.ts` と `src/rendering/README.md` に記す。
- ローカル実行の合否は描画系統名の実測で決まる。閾値判定（例: 平均と下位5パーセンタイルが毎秒60フレーム以上）は各ゲート側で持ち込む。

## 8. トラブルシュート

- 黒画面・描画系統がソフトウェアに落ちる: `chrome://gpu` を開いて高速化状態を見る。`--channel` を切り替える。起動引数（ANGLE指定）が効いているかレポートの `browser.args` を確認する。
- 接続できない: 別端末で `npm run dev` が起動しているか、`BASE` が正しいか確認する。
- 単体テストが走らない: `vitest.config.ts` の `include` に `scripts/**/*.test.mjs` が入っているか確認する。

## 9. 空間品質ゲート（Issue #100）

奥行きの手がかり（視差・スケール変化・反射）の存在、反射の整合、発光のブルームの存在を、専用診断ページ `spatial.html` の描画から検査するゲート。仕様の正典は `docs/research/08-quality-assurance.md` の3節。失敗時の扱いは「警告（格下げ可）」。本ゲート本体は手元の実機GPU環境で動かし、継続的インテグレーションには構造スモークのみを置く（GPU が無い環境では見た目の計測が実機性能・実機の見えを表さないため。同文書1節）。

### 構成
- 診断ページ `spatial.html`（`src/rendering/diagnostics/spatial/main.ts`）。本番経路で情景を構成し、3姿勢の描画と射影を `window.__spatialReady`／`__spatialState`／`__spatialCapture` で公開する。
- 純粋関数 `scripts/harness/spatial-metrics.mjs`（6項目の合否判定）。単体テスト `scripts/harness/spatial-metrics.test.mjs`。
- ゲート本体 `scripts/spatial-quality.mjs`（`npm run quality:spatial`）。
- 構造スモーク `scripts/rendering-spatial-smoke.mjs`（`npm run smoke:spatial`、継続的インテグレーションが既定起動で動かす）。

### 実行手順
別端末で開発サーバまたはプレビューサーバを起動してから実行する。

```sh
npm run dev   # 5173番で起動（別端末で起動したまま）
```

```sh
# PowerShell
$env:BASE='http://localhost:5173'; npm run quality:spatial
# Unix系シェル
BASE=http://localhost:5173 npm run quality:spatial
```

不成立があると終了コード1で理由を列挙する。起動引数 `--warn-only` を与えると、不成立があっても警告として表示したうえで終了コード0で返す（提出が逼迫した場合に進行を止めない退避手段。同文書6節）。描画系統名を記録に表示し、初期較正は実機GPUの環境で行う。

### 閾値（初期値、Issue #104 で確定）
閾値は `scripts/harness/spatial-metrics.mjs` の `DEFAULT_THRESHOLDS` にあり、各値の採用理由を併記する。反射の整合は「反射有効と無効の上位2区画の輝度増分の平均が8以上」（反射は離散的な発光点の小さな鏡像で明るく変化する区画が少数のため、上位の少数区画で代表させる）。明部区画は背景輝度（全区画の下位5パーセンタイル）に16を加えた値以上の区画。視差は固定発光点を2姿勢へ射影した画面移動量のばらつき（画面の幅に対する割合）と、射影位置が明部であることの画素裏付け。スケール変化は近景と遠景の明部区画数の比。検査対象の情景は暫定発光点と中心の光柱のみで、発光点本実装（Issue #10）・蝶（#61）・ミクの造形を載せた後は閾値の再較正が要る。
