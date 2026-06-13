import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  // ルートの .env から TEXT_ALIVE_API_TOKEN を読み込む（VITE_ プレフィックスなしでも取得）
  const env = loadEnv(mode, process.cwd(), "");

  return {
    // マルチページ：index.html と analysis.html を両方ビルド対象に
    build: {
      rollupOptions: {
        input: {
          main: "index.html",
          analysis: "analysis.html",
        },
      },
    },
    define: {
      // src/main.js や src/analyze.js で import.meta.env.VITE_TEXTALIVE_TOKEN として参照
      "import.meta.env.VITE_TEXTALIVE_TOKEN": JSON.stringify(
        env.TEXT_ALIVE_API_TOKEN
      ),
    },
  };
});
