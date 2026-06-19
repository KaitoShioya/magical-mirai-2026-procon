// vitest（単体テスト）の設定。本体のビルド設定（vite.config.ts のマルチページ入力）は単体テストに不要なため分ける。
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // 本体のドメインロジック（src の .test.ts）に加え、品質検査ハーネスの純粋関数の
    // 単体テスト（scripts/harness の .test.mjs）も対象にする。ハーネスは scripts 配下の
    // プレーンJS（型検査対象外）であり、テストは対象モジュールを直接読み込むため
    // ブラウザ起動部品（Playwright）には到達しない。
    include: ["src/**/*.test.ts", "scripts/**/*.test.mjs"],
    // Windows の一時ディレクトリへの並行書き込みで、稀に変換キャッシュの書込みエラーが出ることがある。
    // 単一プロセスで直列実行して決定的にする。テスト数が少なく速度低下は無視できる。
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
