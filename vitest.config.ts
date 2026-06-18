// vitest（単体テスト）の設定。本体のビルド設定（vite.config.ts のマルチページ入力）は単体テストに不要なため分ける。
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // Windows の一時ディレクトリへの並行書き込みで、稀に変換キャッシュの書込みエラーが出ることがある。
    // 単一プロセスで直列実行して決定的にする。テスト数が少なく速度低下は無視できる。
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
