// 品質検査ハーネスのクラウド実行。GPU無しのCIで、登録済みの検査（ファイル存在＋JSONスキーマ）だけを行う。
// ブラウザを起動せず、ブラウザ起動部品（Playwright）を読み込まない。
// #96が曲プロファイルのスキーマ検査を登録するため、実行の入口でその登録を行ってから検査を走らせる。
import { listRegisteredChecks, runSchemaChecks } from "./schema-check.mjs";
import { registerProfileSchemas } from "./profile-schema.mjs";

/**
 * クラウド実行。
 * @param {{ checks?: Array<{ key: string, file: string, schema: object }> }} options
 * @returns {Promise<number>} 終了コード（0が成功）
 */
export async function runCloud(options = {}) {
  // 曲プロファイルのスキーマ検査を登録簿へ登録する。登録が無いと登録0件で無条件合格してしまうため、
  // クラウド実行の入口で登録してから検査を走らせる。冪等であり重複登録しない。
  registerProfileSchemas();
  // options.checks を明示指定して呼ぶ既存の使い方を尊重する（明示指定時はそれを使う）。
  // 冒頭の登録は登録簿を満たすだけで、この分岐には干渉しない。
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
