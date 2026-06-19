// 品質検査ハーネスのクラウド実行。GPU無しのCIで、登録済みの検査（ファイル存在＋JSONスキーマ）だけを行う。
// ブラウザを起動せず、ブラウザ起動部品（Playwright）を読み込まない。
// #95時点では検査の登録が無いため、登録0件で合格する。#96が曲プロファイルの検査を登録した時点で実検査が効く。
import { listRegisteredChecks, runSchemaChecks } from "./schema-check.mjs";

/**
 * クラウド実行。
 * @param {{ checks?: Array<{ key: string, file: string, schema: object }> }} options
 * @returns {Promise<number>} 終了コード（0が成功）
 */
export async function runCloud(options = {}) {
  const checks = options.checks || listRegisteredChecks();
  const { ok, results } = await runSchemaChecks(checks);

  if (results.length === 0) {
    console.log("クラウド検査: 登録された検査はありません（合格）");
  }
  for (const result of results) {
    if (result.ok) {
      console.log(`[${result.key}] 合格: ${result.file}`);
    } else {
      console.error(
        `[${result.key}] 不合格: ${result.file}\n  ` + result.errors.join("\n  ")
      );
    }
  }
  console.log(ok ? "品質ハーネス（クラウド）: 成功" : "品質ハーネス（クラウド）: 失敗");

  return ok ? 0 : 1;
}
