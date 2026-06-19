import { describe, it, expect } from "vitest";
import { createFontRegistry } from "./fontRegistry";
import type { FontEntry } from "./types";

const credit = {
  fontName: "見本書体",
  author: "作者名",
  source: "配布元",
  license: "SIL Open Font License",
  licenseFileUrl: "/fonts/OFL.txt",
};

function entry(name: string, url: string): FontEntry {
  return { name, url, weight: 700, credit };
}

describe("createFontRegistry（論理名から実フォントを引く登録の仕組み）", () => {
  it("登録した名前で引ける", () => {
    const registry = createFontRegistry();
    registry.register(entry("main", "/fonts/main.woff"));
    expect(registry.resolve("main").url).toBe("/fonts/main.woff");
  });

  it("未登録の名前は例外を投げる", () => {
    const registry = createFontRegistry();
    expect(() => registry.resolve("missing")).toThrow();
  });

  it("複数を登録して一覧で得られる", () => {
    const registry = createFontRegistry();
    registry.register(entry("main", "/fonts/main.woff"));
    registry.register(entry("sub", "/fonts/sub.woff"));
    expect(registry.list().map((entryItem) => entryItem.name).sort()).toEqual(["main", "sub"]);
  });

  it("同じ名前の再登録は差し替えになる", () => {
    const registry = createFontRegistry();
    registry.register(entry("main", "/fonts/old.woff"));
    registry.register(entry("main", "/fonts/new.woff"));
    expect(registry.resolve("main").url).toBe("/fonts/new.woff");
    expect(registry.list()).toHaveLength(1);
  });
});
