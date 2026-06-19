// 品質検査ハーネスのレポート組み立てと書き出し。JSON整形と書き出しに限る。
// ブラウザ起動部品（Playwright）を読み込まない。これにより、クラウド経路が本ファイル経由で
// ブラウザ起動部品へ到達しないことを保証する。

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

// レポートの版。後続ゲートが構造の変更を見分けられるようにする。
const HARNESS_VERSION = "1";

/**
 * 構造化レポートを組み立てる。閾値・合否・ゲート結果欄は入れない（記録に徹する）。
 * @param {{ mode: string, browserMeta: object, runtimeInfo: object, runs: object[], errors: string[] }} input
 * @returns {object}
 */
export function buildReport(input) {
  return {
    harnessVersion: HARNESS_VERSION,
    generatedAt: new Date().toISOString(),
    mode: input.mode,
    runtime: input.runtimeInfo,
    browser: input.browserMeta,
    runs: input.runs,
    errors: input.errors,
  };
}

/**
 * レポートをJSONファイルへ書き出す。出力先を作成する。
 * @param {object} report
 * @param {{ outDir: string, name?: string }} options
 * @returns {Promise<{ path: string }>}
 */
export async function writeReport(report, options) {
  await mkdir(options.outDir, { recursive: true });
  const path = join(options.outDir, options.name || "quality-report.json");
  await writeFile(path, JSON.stringify(report, null, 2), "utf8");
  return { path };
}
