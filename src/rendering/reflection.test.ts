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

// 重複指定の仕様。入口（src/main.ts）は URLSearchParams.get("refl") で読み、get は同名パラメータが
// 重複したとき最初の値を返す。読取と解釈を結合し、重複時は最初の値で解釈されることを明示する。
describe("refl の重複指定（URLSearchParams.get と解釈の結合）", () => {
  it("最初の値で解釈する（最初が0なら無効、最初が512なら512）", () => {
    const firstZero = new URLSearchParams("refl=0&refl=512").get("refl");
    expect(resolveReflectionResolution(firstZero)).toBe(0);
    const firstFive = new URLSearchParams("refl=512&refl=0").get("refl");
    expect(resolveReflectionResolution(firstFive)).toBe(512);
  });
});
