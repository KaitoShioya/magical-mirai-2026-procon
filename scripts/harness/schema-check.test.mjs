// 品質検査ハーネスのクラウド側スキーマ検査機構の単体テスト。
// 対象モジュール schema-check.mjs を直接読み込み、ブラウザ起動部品には到達しない。
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { beforeEach, describe, expect, test } from "vitest";
import {
  listRegisteredChecks,
  registerSchema,
  resetRegistry,
  runSchemaChecks,
  validate,
} from "./schema-check.mjs";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");
const validFile = join(fixturesDir, "valid-sample.json");
const invalidFile = join(fixturesDir, "invalid-sample.json");
const missingFile = join(fixturesDir, "does-not-exist.json");

const sampleSchema = {
  type: "object",
  required: ["name", "beats"],
  properties: {
    name: { type: "string" },
    beats: { type: "array", items: { type: "number" } },
  },
};

describe("validate（JSONスキーマ適合判定）", () => {
  test("適合する値は合格しエラーが無い", () => {
    const result = validate({ name: "takeover", beats: [1, 2, 3] }, sampleSchema);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test("必須キー欠落は不合格", () => {
    const result = validate({ name: "takeover" }, sampleSchema);
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test("型不一致は不合格", () => {
    const result = validate({ name: 123, beats: "x" }, sampleSchema);
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("runSchemaChecks（ファイル存在＋スキーマ検査）", () => {
  test("登録0件は合格する", async () => {
    const result = await runSchemaChecks([]);
    expect(result.ok).toBe(true);
    expect(result.results).toEqual([]);
  });

  test("存在する適合ファイルは合格する", async () => {
    const result = await runSchemaChecks([
      { key: "valid", file: validFile, schema: sampleSchema },
    ]);
    expect(result.ok).toBe(true);
    expect(result.results[0].ok).toBe(true);
  });

  test("存在しないファイルは不合格", async () => {
    const result = await runSchemaChecks([
      { key: "missing", file: missingFile, schema: sampleSchema },
    ]);
    expect(result.ok).toBe(false);
    expect(result.results[0].ok).toBe(false);
    expect(result.results[0].errors.length).toBeGreaterThan(0);
  });

  test("存在するが不適合なファイルは不合格", async () => {
    const result = await runSchemaChecks([
      { key: "invalid", file: invalidFile, schema: sampleSchema },
    ]);
    expect(result.ok).toBe(false);
    expect(result.results[0].ok).toBe(false);
  });

  test("1件でも不合格なら全体が不合格", async () => {
    const result = await runSchemaChecks([
      { key: "valid", file: validFile, schema: sampleSchema },
      { key: "invalid", file: invalidFile, schema: sampleSchema },
    ]);
    expect(result.ok).toBe(false);
  });
});

describe("registerSchema / listRegisteredChecks（検査の登録簿）", () => {
  beforeEach(() => {
    resetRegistry();
  });

  test("登録した検査が一覧に現れる", () => {
    registerSchema("song-profile", { file: validFile, schema: sampleSchema });
    const checks = listRegisteredChecks();
    expect(checks.length).toBe(1);
    expect(checks[0].key).toBe("song-profile");
    expect(checks[0].file).toBe(validFile);
  });

  test("初期状態の登録簿は空", () => {
    expect(listRegisteredChecks()).toEqual([]);
  });
});
