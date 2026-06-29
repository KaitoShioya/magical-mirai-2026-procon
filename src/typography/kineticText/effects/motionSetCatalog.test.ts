// モーションセットのライブラリ（登録一覧）の検証。
// 全セットが識別名重複なく登録時検証を通ること、各セットが個別にも validateEffectElement を通ることを表明する。

import { describe, it, expect } from "vitest";
import { createEffectRegistry, validateEffectElement } from "../effectElement";
import { buildMotionSetLibrary, registerMotionSetLibrary } from "./motionSetCatalog";

describe("モーションセット・ライブラリ", () => {
  it("全セットの識別名が一意である", () => {
    const ids = buildMotionSetLibrary().map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("各セットが個別に validateEffectElement を空で通す", () => {
    for (const element of buildMotionSetLibrary()) {
      expect(validateEffectElement(element)).toEqual([]);
    }
  });

  it("registerMotionSetLibrary が例外なく全セットを登録し、登録数が一覧と一致する", () => {
    const registry = createEffectRegistry();
    expect(() => registerMotionSetLibrary(registry)).not.toThrow();
    expect(registry.list().length).toBe(buildMotionSetLibrary().length);
  });

  it("登録後に各識別名で演出を引ける", () => {
    const registry = createEffectRegistry();
    registerMotionSetLibrary(registry);
    for (const element of buildMotionSetLibrary()) {
      expect(registry.get(element.id)).toBe(element);
    }
  });
});
