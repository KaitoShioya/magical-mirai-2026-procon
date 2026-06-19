// フォント登録の仕組み。論理名から実フォント（URLと出典）を引く。
// 複数フォントの保持とシーン・演出別の差し替えを担う。判定・得点・時刻の論理は持たない。

import type { FontEntry, FontRegistry } from "./types";

export function createFontRegistry(): FontRegistry {
  const entries = new Map<string, FontEntry>();
  return {
    register(entry: FontEntry): void {
      // 同じ名前は差し替える（演出別の付け替えを許すため）。
      entries.set(entry.name, entry);
    },
    resolve(name: string): FontEntry {
      const entry = entries.get(name);
      if (!entry) {
        throw new Error(`未登録のフォント論理名です: ${name}`);
      }
      return entry;
    },
    list(): readonly FontEntry[] {
      return [...entries.values()];
    },
  };
}
