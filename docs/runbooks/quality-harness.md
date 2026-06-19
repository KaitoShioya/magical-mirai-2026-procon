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
- ローカル実行の合否は描画系統名の実測で決まる。閾値判定（例: 平均と下位5パーセンタイルが毎秒60フレーム以上）は各ゲート側で持ち込む。

## 8. トラブルシュート

- 黒画面・描画系統がソフトウェアに落ちる: `chrome://gpu` を開いて高速化状態を見る。`--channel` を切り替える。起動引数（ANGLE指定）が効いているかレポートの `browser.args` を確認する。
- 接続できない: 別端末で `npm run dev` が起動しているか、`BASE` が正しいか確認する。
- 単体テストが走らない: `vitest.config.ts` の `include` に `scripts/**/*.test.mjs` が入っているか確認する。
