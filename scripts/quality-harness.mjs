// 品質検査ハーネスのコマンド入口。起動引数 --mode を解釈してモードを決め、ローカルなら run-local.mjs、
// クラウドなら run-cloud.mjs を動的に読み込んで実行する。
// 動的読み込みにより、クラウド経路はブラウザ起動部品（Playwright）の読み込みに到達しない。
//
// 起動例:
//   ローカル: BASE=http://localhost:5173 node scripts/quality-harness.mjs --mode=local
//   クラウド: node scripts/quality-harness.mjs --mode=cloud
// 任意ノブ: --channel=chromium|chrome|msedge / --angle=d3d11 / --duration=12000 / --allow-unknown-renderer
import { resolveMode } from "./harness/mode.mjs";

/**
 * 起動引数を解釈する。`--key=value` と `--flag` の形を受け付ける。
 * @param {string[]} argv
 * @returns {Record<string, string | boolean>}
 */
function parseArgs(argv) {
  const result = {};
  for (const token of argv) {
    if (!token.startsWith("--")) {
      continue;
    }
    const body = token.slice(2);
    const eq = body.indexOf("=");
    if (eq === -1) {
      result[body] = true;
    } else {
      result[body.slice(0, eq)] = body.slice(eq + 1);
    }
  }
  return result;
}

const args = parseArgs(process.argv.slice(2));
const mode = resolveMode({ cliMode: typeof args.mode === "string" ? args.mode : undefined });

let exitCode;
if (mode === "cloud") {
  const { runCloud } = await import("./harness/run-cloud.mjs");
  exitCode = await runCloud({});
} else {
  const { runLocal } = await import("./harness/run-local.mjs");
  exitCode = await runLocal({
    channel: typeof args.channel === "string" ? args.channel : undefined,
    angle: typeof args.angle === "string" ? args.angle : undefined,
    durationMs: typeof args.duration === "string" ? Number(args.duration) : undefined,
    allowUnknownRenderer: args["allow-unknown-renderer"] === true,
  });
}

process.exit(exitCode);
