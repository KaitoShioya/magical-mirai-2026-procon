import { describe, it, expect } from "vitest";
import { createGlyphPool } from "./glyphPool";

interface FakeUnit {
  readonly id: number;
}

function fakeFactory() {
  let next = 0;
  const created: FakeUnit[] = [];
  const make = (): FakeUnit => {
    const unit = { id: next++ };
    created.push(unit);
    return unit;
  };
  return { make, created };
}

describe("createGlyphPool（個別文字単位の再利用プール）", () => {
  it("同時上限まで取得でき、超えると取得できない", () => {
    const factory = fakeFactory();
    const pool = createGlyphPool<FakeUnit>({ maxConcurrent: 2, textFactory: factory.make });
    const a = pool.acquire();
    const b = pool.acquire();
    const c = pool.acquire();
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(c).toBeNull();
    expect(pool.activeCount()).toBe(2);
  });

  it("解放した単位を再利用し、新規生成を増やさない", () => {
    const factory = fakeFactory();
    const pool = createGlyphPool<FakeUnit>({ maxConcurrent: 2, textFactory: factory.make });
    const a = pool.acquire();
    if (!a) throw new Error("取得できるはず");
    pool.release(a);
    const b = pool.acquire();
    expect(b).not.toBeNull();
    // 生成された単位は1つだけ（再利用された）。
    expect(factory.created).toHaveLength(1);
    expect(pool.activeCount()).toBe(1);
  });

  it("取得直後は現役、解放後は非現役（古い完了通知を無視する判定）", () => {
    const factory = fakeFactory();
    const pool = createGlyphPool<FakeUnit>({ maxConcurrent: 1, textFactory: factory.make });
    const lease = pool.acquire();
    if (!lease) throw new Error("取得できるはず");
    expect(lease.isCurrent()).toBe(true);
    pool.release(lease);
    expect(lease.isCurrent()).toBe(false);
  });

  it("再利用後は前の取っ手が非現役になる（解放後の完了通知で復活しない）", () => {
    const factory = fakeFactory();
    const pool = createGlyphPool<FakeUnit>({ maxConcurrent: 1, textFactory: factory.make });
    const first = pool.acquire();
    if (!first) throw new Error("取得できるはず");
    pool.release(first);
    const second = pool.acquire();
    if (!second) throw new Error("取得できるはず");
    // 同じ単位を使い回しても、前の取っ手は現役でない。
    expect(first.unit).toBe(second.unit);
    expect(first.isCurrent()).toBe(false);
    expect(second.isCurrent()).toBe(true);
  });

  it("disposeAll で生成済みの全単位を破棄する", () => {
    const factory = fakeFactory();
    const pool = createGlyphPool<FakeUnit>({ maxConcurrent: 2, textFactory: factory.make });
    pool.acquire();
    pool.acquire();
    const disposed: FakeUnit[] = [];
    pool.disposeAll((unit) => disposed.push(unit));
    expect(disposed.sort((x, y) => x.id - y.id)).toEqual(factory.created.sort((x, y) => x.id - y.id));
  });
});
