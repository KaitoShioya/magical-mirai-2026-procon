// 品質検査ハーネスのクラウド側スキーマ検査機構。
// ファイルの存在確認と、JSONスキーマ（ajv）による適合判定と、検査の登録簿を提供する。
// ブラウザ起動部品（Playwright）を読み込まない。クラウド経路（GPU無しのCI）はこの機構だけを使う。
//
// 採用理由を先に述べる。曲プロファイルの必須項目検査（Issue #96）は列挙・範囲・パターン等を含む
// 本格的なJSONスキーマで表現される見込みで、自作の最小検証では表現力が足りない。標準のJSON Schemaを
// 解釈する確立したライブラリ ajv を用い、検査機構をJSON Schema準拠にする。
// 本Issue（#95）は機構だけを提供し、具体的な曲プロファイルスキーマは #34/#96 が登録簿へ登録する。
import { readFile } from "node:fs/promises";
import Ajv from "ajv";

const ajv = new Ajv({ allErrors: true });

// 検査の登録簿。#95は空で出荷し、#96が曲プロファイルの検査を登録する。
const registry = [];

/**
 * 検査を登録簿へ登録する。
 * @param {string} key 検査の識別子
 * @param {{ file: string, schema: object }} entry 検査対象ファイルとJSONスキーマ
 */
export function registerSchema(key, entry) {
  registry.push({ key, file: entry.file, schema: entry.schema });
}

/**
 * 登録簿の内容を返す。
 * @returns {Array<{ key: string, file: string, schema: object }>}
 */
export function listRegisteredChecks() {
  return registry.map((entry) => ({ ...entry }));
}

/**
 * 登録簿を空に戻す（単体テスト用）。
 */
export function resetRegistry() {
  registry.length = 0;
}

/**
 * 値をJSONスキーマで検査する。
 * @param {unknown} value 検査する値
 * @param {object} schema JSONスキーマ
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validate(value, schema) {
  const validator = ajv.compile(schema);
  const ok = validator(value);
  if (ok) {
    return { ok: true, errors: [] };
  }
  const errors = (validator.errors || []).map((error) => {
    const where = error.instancePath || "(根)";
    return `${where} ${error.message}`;
  });
  return { ok: false, errors };
}

/**
 * 検査配列を実行する。各検査でファイル存在確認・JSON解釈・スキーマ適合判定を行う。
 * 1件でも失敗すれば全体を不合格とする。
 * @param {Array<{ key: string, file: string, schema: object }>} checks
 * @returns {Promise<{ ok: boolean, results: Array<{ key: string, file: string, ok: boolean, errors: string[] }>}>}
 */
export async function runSchemaChecks(checks) {
  const results = [];
  for (const check of checks) {
    results.push(await runOneCheck(check));
  }
  const ok = results.every((result) => result.ok);
  return { ok, results };
}

/**
 * 登録簿に登録済みの検査をすべて実行する。
 * @returns {Promise<{ ok: boolean, results: Array<{ key: string, file: string, ok: boolean, errors: string[] }>}>}
 */
export async function runRegisteredChecks() {
  return runSchemaChecks(listRegisteredChecks());
}

async function runOneCheck(check) {
  let text;
  try {
    text = await readFile(check.file, "utf8");
  } catch {
    return {
      key: check.key,
      file: check.file,
      ok: false,
      errors: ["ファイルが見つかりません"],
    };
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      key: check.key,
      file: check.file,
      ok: false,
      errors: ["JSONとして解釈できません: " + message],
    };
  }
  const { ok, errors } = validate(value, check.schema);
  return { key: check.key, file: check.file, ok, errors };
}
