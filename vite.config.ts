import { defineConfig, loadEnv } from "vite";

// マルチページ構成（本体・楽曲データ解析ツール・描画性能検証ツール・文字診断・雨診断・発光点診断）。
// HTMLの入口名は既存の自動化スクリプト（scripts/dump-songmap.mjs・scripts/prototype-fps.mjs・
// scripts/rendering-glow-smoke.mjs）の契約を保つため変更しない。
//
// 本番配信（Cloudflare Pages）は規約適合のため本体 index.html のみを公開する（Issue #7）。
// `vite build --mode app` のときだけ入口を index.html に絞り、開発ツールと診断ページを
// 成果物から除外する。開発検証用の `npm run build`（mode は既定の "production"）は本体に加え
// 解析・性能・文字診断・雨診断・カメラ軌跡診断・発光点診断の各ページを出す。
// 補足: `--mode app` でもビルドの NODE_ENV は "production" のままで、import.meta.env.PROD は true、
// import.meta.env.MODE が "app" になる。本番判定が必要な箇所では MODE ではなく import.meta.env.PROD を使う。
export default defineConfig(({ mode }) => {
  // ルートの .env から TEXT_ALIVE_API_TOKEN を読み込む（VITE_ プレフィックスなしでも取得）。
  // loadEnv は空プレフィックス指定時に process.env も取り込むため、.env の無いCI環境でも
  // 環境変数から TEXT_ALIVE_API_TOKEN を取得できる。
  const env = loadEnv(mode, process.cwd(), "");

  const deployAppOnly = mode === "app";

  // 本番（--mode app）は本体のみ。開発検証用は本体＋開発ツール・診断ページ。
  // typography.html は kineticText エンジンの受け入れ診断（性能計測）、rain.html は雨パーティクルの
  // 単独診断、camera-trajectory.html はカメラ軌跡システムの受け入れ診断、rendering.html は発光点（#10）の
  // 描画命令数の受け入れ診断、input.html は入力アーキテクチャ（#47）の受け入れ診断、layer-composite.html は
  // 描画層合成（#15）の受け入れ診断の入口で、いずれも本番では配信しない。
  const input: Record<string, string> = deployAppOnly
    ? { main: "index.html" }
    : {
        main: "index.html",
        analysis: "analysis.html",
        prototype: "prototype.html",
        typography: "typography.html",
        rain: "rain.html",
        cameraTrajectory: "camera-trajectory.html",
        rendering: "rendering.html",
        input: "input.html",
        layerComposite: "layer-composite.html",
      };

  return {
    build: {
      rollupOptions: {
        input,
      },
    },
    define: {
      // import.meta.env.VITE_TEXTALIVE_TOKEN として参照する。
      "import.meta.env.VITE_TEXTALIVE_TOKEN": JSON.stringify(
        env.TEXT_ALIVE_API_TOKEN
      ),
    },
  };
});
