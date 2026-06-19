// 品質検査ハーネスのモード判定（純粋）の単体テスト。
// 環境変数を直接読まず、引数で env を渡して決定的に検査する。
import { describe, expect, test } from "vitest";
import { resolveMode } from "./mode.mjs";

describe("resolveMode（モード判定の優先順位）", () => {
  // 優先順位: 起動引数 --mode > 環境変数 HARNESS_MODE > CI検出 > 既定ローカル。
  test("起動引数 cloud は最優先でクラウド", () => {
    expect(resolveMode({ cliMode: "cloud", env: { HARNESS_MODE: "local" } })).toBe(
      "cloud"
    );
  });

  test("起動引数 local はCI検出より優先される", () => {
    expect(resolveMode({ cliMode: "local", env: { CI: "true" } })).toBe("local");
  });

  test("起動引数が無ければ環境変数 HARNESS_MODE に従う", () => {
    expect(resolveMode({ env: { HARNESS_MODE: "cloud" } })).toBe("cloud");
  });

  test("環境変数 HARNESS_MODE はCI検出より優先される", () => {
    expect(resolveMode({ env: { HARNESS_MODE: "local", CI: "true" } })).toBe("local");
  });

  test("起動引数も HARNESS_MODE も無くCIならクラウド", () => {
    expect(resolveMode({ env: { CI: "true" } })).toBe("cloud");
  });

  test("いずれも無ければ既定はローカル", () => {
    expect(resolveMode({ env: {} })).toBe("local");
  });

  test("不正な起動引数は無視して次の優先順位へ進む", () => {
    expect(resolveMode({ cliMode: "unknown", env: { CI: "true" } })).toBe("cloud");
  });
});
