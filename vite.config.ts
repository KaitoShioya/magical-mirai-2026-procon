import { defineConfig, loadEnv } from "vite";

// マルチページ構成（本体・楽曲データ解析ツール・描画性能検証ツール）。
// HTMLの入口名は既存の自動化スクリプト（scripts/dump-songmap.mjs・scripts/prototype-fps.mjs）の
// 契約を保つため変更しない。
export default defineConfig(({ mode }) => {
  // ルートの .env から TEXT_ALIVE_API_TOKEN を読み込む（VITE_ プレフィックスなしでも取得）。
  const env = loadEnv(mode, process.cwd(), "");

  return {
    build: {
      rollupOptions: {
        input: {
          main: "index.html",
          analysis: "analysis.html",
          prototype: "prototype.html",
        },
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
