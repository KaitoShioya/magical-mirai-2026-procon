// TAKEOVER曲プロファイルの成果物 takeover.profile.json を書き出す起動スクリプト（Issue #46）。
// リポジトリに TypeScript を直接実行する道具（tsx・vite-node・ts-node）が無く、生成関数は TypeScript のため、
// three.js の解決が実証済みの Vitest を子プロセスとして起動し、生成テストだけを生成モードで走らせて書き出す。
// 環境変数 GEN_TAKEOVER_PROFILE を子プロセスへ渡して生成を有効化する（scripts/harness/mode.mjs と同じ環境変数方式）。
// Windows では実行ファイルが .cmd で解決されるため shell を真にする。子プロセスの終了コードを親へ引き継ぐ。

import { spawnSync } from "node:child_process";

const targetTestFile = "src/profiles/takeover/generateProfile.gen.test.ts";

// 実行ファイルと引数を分けて渡す理由を先に述べる。命令文字列を組み立てる方式より、命令と引数を配列で
// 分けて渡す方が、引数に空白や特殊文字が混じったときの誤解釈を避けられる。Windows で実行ファイルが .cmd で
// 解決されるよう shell は真のままにする（引数は固定の文字列で外部入力を含まない）。
const result = spawnSync("npx", ["vitest", "run", targetTestFile], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, GEN_TAKEOVER_PROFILE: "1" },
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);
