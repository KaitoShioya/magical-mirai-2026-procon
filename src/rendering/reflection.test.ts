import { describe, expect, it } from "vitest";
import { resolveReflectionResolution } from "./reflection";

describe("resolveReflectionResolution", () => {
  it("明示的な0は無効化（0）を返す", () => {
    expect(resolveReflectionResolution("0")).toBe(0);
    expect(resolveReflectionResolution(0)).toBe(0);
  });
  it("256と512はその値を返す", () => {
    expect(resolveReflectionResolution("256")).toBe(256);
    expect(resolveReflectionResolution("512")).toBe(512);
    expect(resolveReflectionResolution(256)).toBe(256);
    expect(resolveReflectionResolution(512)).toBe(512);
  });
  it("未指定（null・undefined）は既定512を返す", () => {
    expect(resolveReflectionResolution(null)).toBe(512);
    expect(resolveReflectionResolution(undefined)).toBe(512);
  });
  it("空文字・空白のみは既定512を返す（数値変換で0になる無効化を防ぐ）", () => {
    expect(resolveReflectionResolution("")).toBe(512);
    expect(resolveReflectionResolution("   ")).toBe(512);
  });
  it("非数の文字列は既定512を返す", () => {
    expect(resolveReflectionResolution("abc")).toBe(512);
    expect(resolveReflectionResolution(Number.NaN)).toBe(512);
  });
  it("前後に空白を含む有効値は数値として解釈する", () => {
    expect(resolveReflectionResolution(" 512 ")).toBe(512);
    expect(resolveReflectionResolution(" 256 ")).toBe(256);
    expect(resolveReflectionResolution(" 0 ")).toBe(0);
  });
  it("256・512以外の数は既定512を返す", () => {
    expect(resolveReflectionResolution("1024")).toBe(512);
    expect(resolveReflectionResolution("128")).toBe(512);
    expect(resolveReflectionResolution(-256)).toBe(512);
    expect(resolveReflectionResolution(Number.POSITIVE_INFINITY)).toBe(512);
  });
});
