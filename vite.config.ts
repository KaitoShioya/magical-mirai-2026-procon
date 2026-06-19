import { defineConfig, loadEnv } from "vite";

// マルチページ構成（本体・楽曲データ解析ツール・描画性能検証ツール）。
// HTMLの入口名は既存の自動化スクリプト（scripts/dump-songmap.mjs・scripts/prototype-fps.mjs）の
// 契約を保つため変更しない。
//
// 本番配信（Cloudflare Pages）は規約適合のため本体 index.html のみを公開する（Issue #7）。
// `vite build --mode app` のときだけ入口を index.html に絞り、開発ツール（analysis/prototype）を
// 成果物から除外する。開発検証用の `npm run build`（mode は既定の "production"）は計5ページ
// （本体と開発ツール4ページ）を出す。
// 補足: `--mode app` でもビルドの NODE_ENV は "production" のままで、import.meta.env.PROD は true、
// import.meta.env.MODE が "app" になる。本番判定が必要な箇所では MODE ではなく import.meta.env.PROD を使う。
export default defineConfig(({ mode }) => {
  // ルートの .env から TEXT_ALIVE_API_TOKEN を読み込む（VITE_ プレフィックスなしでも取得）。
  // loadEnv は空プレフィックス指定時に process.env も取り込むため、.env の無いCI環境でも
  // 環境変数から TEXT_ALIVE_API_TOKEN を取得できる。
  const env = loadEnv(mode, process.cwd(), "");

  const deployAppOnly = mode === "app";

  // 本番（--mode app）は本体のみ。開発検証用は本体＋開発ツール4ページ。
  // typography.html は kineticText エンジン、camera-trajectory.html はカメラ軌跡システムの
  // 受け入れ診断の入口で、いずれも本番では配信しない。
  const input: Record<string, string> = deployAppOnly
    ? { main: "index.html" }
    : {
        main: "index.html",
        analysis: "analysis.html",
        prototype: "prototype.html",
        typography: "typography.html",
        cameraTrajectory: "camera-trajectory.html",
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
