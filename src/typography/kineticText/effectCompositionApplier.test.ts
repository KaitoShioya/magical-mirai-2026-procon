import { describe, it, expect } from "vitest";
import { createCompositionTarget } from "./effectCompositionApplier";
import type { ComposedGlyphState } from "./composedGlyphState";
import type { GlyphHandle, DeformingTextHandle } from "./types";
import type { DeformParams } from "./types";
import { resolveReadabilityStyle, DEFAULT_READABILITY_OPTIONS } from "./readability";

interface HandleRecord {
  calls: string[];
  scale3: Array<[number, number, number]>;
  positions: Array<[number, number, number]>;
  colors: number[];
  opacities: number[];
  letterSpacings: number[];
  readabilityCount: number;
  releaseCount: number;
  deformParams: DeformParams[];
}

function recordingHandle(): { handle: GlyphHandle; record: HandleRecord } {
  const record: HandleRecord = {
    calls: [],
    scale3: [],
    positions: [],
    colors: [],
    opacities: [],
    letterSpacings: [],
    readabilityCount: 0,
    releaseCount: 0,
    deformParams: [],
  };
  const handle: GlyphHandle = {
    setPosition: (x, y, z): void => {
      record.positions.push([x, y, z]);
      record.calls.push("setPosition");
    },
    setRotation: (): void => {
      record.calls.push("setRotation");
    },
    setScale: (): void => {
      record.calls.push("setScale");
    },
    setScale3: (x, y, z): void => {
      record.scale3.push([x, y, z]);
      record.calls.push("setScale3");
    },
    setColor: (color): void => {
      record.colors.push(color);
      record.calls.push("setColor");
    },
    setOpacity: (opacity): void => {
      record.opacities.push(opacity);
      record.calls.push("setOpacity");
    },
    setLetterSpacing: (value): void => {
      record.letterSpacings.push(value);
      record.calls.push("setLetterSpacing");
    },
    applyReadability: (): void => {
      record.readabilityCount += 1;
      record.calls.push("applyReadability");
    },
    setOrientation: (): void => {},
    release: (): void => {
      record.releaseCount += 1;
      record.calls.push("release");
    },
  };
  return { handle, record };
}

function deformingHandle(): { handle: DeformingTextHandle; record: HandleRecord } {
  const base = recordingHandle();
  const handle: DeformingTextHandle = {
    ...base.handle,
    setDeformParams: (params): void => {
      base.record.deformParams.push(params);
      base.record.calls.push("setDeformParams");
    },
  };
  return { handle, record: base.record };
}

function state(overrides: Partial<ComposedGlyphState> = {}): ComposedGlyphState {
  return {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    letterSpacing: null,
    color: 0xffffff,
    opacity: 1,
    glowing: false,
    deform: null,
    duplication: null,
    readability: null,
    droppedGeometricContributions: 0,
    droppedLetterSpacing: 0,
    collapsedNonUniformScale: false,
    forcedReadabilityNull: false,
    ...overrides,
  };
}

function readingStyle() {
  return resolveReadabilityStyle({
    options: DEFAULT_READABILITY_OPTIONS,
    baseFillColor: 0xffffff,
    capability: { stroke: true, outlineOffset: true, outlineBlur: true },
    bloomThreshold: 0.5,
    fallbackFontUsed: false,
    needsBacking: false,
  });
}

describe("1回反映の呼び出し", () => {
  it("演出役は各 setter を1回ずつ呼ぶ（applyReadability は呼ばない）", () => {
    const primary = recordingHandle();
    const target = createCompositionTarget({ spawnPrimary: () => primary.handle, spawnCopy: () => null });
    target.applyComposed(state({ color: 0x112233, opacity: 0.5 }));
    expect(primary.record.colors).toEqual([0x112233]);
    expect(primary.record.opacities).toEqual([0.5]);
    expect(primary.record.scale3).toHaveLength(1);
    expect(primary.record.readabilityCount).toBe(0);
  });

  it("読ませる役は applyReadability の後に setColor を呼ぶ", () => {
    const primary = recordingHandle();
    const target = createCompositionTarget({ spawnPrimary: () => primary.handle, spawnCopy: () => null });
    target.applyComposed(state({ readability: readingStyle(), color: 0xff8800 }));
    const readabilityIndex = primary.record.calls.indexOf("applyReadability");
    const colorIndex = primary.record.calls.indexOf("setColor");
    expect(readabilityIndex).toBeGreaterThanOrEqual(0);
    expect(colorIndex).toBeGreaterThan(readabilityIndex);
  });

  it("字間が null のときは setLetterSpacing を呼ばない", () => {
    const primary = recordingHandle();
    const target = createCompositionTarget({ spawnPrimary: () => primary.handle, spawnCopy: () => null });
    target.applyComposed(state({ letterSpacing: null }));
    expect(primary.record.letterSpacings).toEqual([]);
    target.applyComposed(state({ letterSpacing: 1.5 }));
    expect(primary.record.letterSpacings).toEqual([1.5]);
  });

  it("回転寄与が無い（rotation=null）と setRotation を呼ばない（カメラ正対を保つ）", () => {
    const primary = recordingHandle();
    const target = createCompositionTarget({ spawnPrimary: () => primary.handle, spawnCopy: () => null });
    target.applyComposed(state({ rotation: null }));
    expect(primary.record.calls).not.toContain("setRotation");
  });

  it("回転寄与があれば setRotation を呼ぶ", () => {
    const primary = recordingHandle();
    const target = createCompositionTarget({ spawnPrimary: () => primary.handle, spawnCopy: () => null });
    target.applyComposed(state({ rotation: { x: 0, y: 1, z: 0 } }));
    expect(primary.record.calls).toContain("setRotation");
  });

  it("変形単位は setDeformParams と色・透明度を反映する", () => {
    const primary = deformingHandle();
    const target = createCompositionTarget({ spawnPrimary: () => primary.handle, spawnCopy: () => null });
    target.applyComposed(
      state({
        deform: { kind: "swirl", params: { strength: 0.8, speed: 1, spatialFreq: 1, phaseOffset: 0 } },
        color: 0x445566,
        opacity: 0.9,
      })
    );
    expect(primary.record.deformParams).toHaveLength(1);
    expect(primary.record.colors).toEqual([0x445566]);
    expect(primary.record.opacities).toEqual([0.9]);
  });
});

describe("複製の写しの増減と後始末", () => {
  function trail(count: number) {
    const copies = [];
    for (let i = 0; i < count; i += 1) {
      copies.push({ offset: { x: -(i + 1) * 0.1, y: 0, z: 0 }, opacity: 0.5 });
    }
    return { layout: "trail" as const, copies, minCount: 1 };
  }

  it("計画の写し数まで確保し、各写しを配置・着色する", () => {
    const created: ReturnType<typeof recordingHandle>[] = [];
    const target = createCompositionTarget({
      spawnPrimary: () => recordingHandle().handle,
      spawnCopy: () => {
        const c = recordingHandle();
        created.push(c);
        return c.handle;
      },
    });
    target.applyComposed(state({ duplication: trail(3), color: 0xabcdef, opacity: 0.8 }));
    expect(target.liveCopyCount()).toBe(3);
    expect(created[0].record.colors).toEqual([0xabcdef]);
    // 写しの不透明度は合成透明度に写しの減衰を掛ける（0.8 × 0.5 = 0.4）。
    expect(created[0].record.opacities[0]).toBeCloseTo(0.4, 6);
  });

  it("写し数が減ると余剰の写しを解放する", () => {
    const created: ReturnType<typeof recordingHandle>[] = [];
    const target = createCompositionTarget({
      spawnPrimary: () => recordingHandle().handle,
      spawnCopy: () => {
        const c = recordingHandle();
        created.push(c);
        return c.handle;
      },
    });
    target.applyComposed(state({ duplication: trail(3) }));
    target.applyComposed(state({ duplication: trail(1) }));
    expect(target.liveCopyCount()).toBe(1);
    // 後から確保した2つが解放される。
    expect(created[2].record.releaseCount).toBe(1);
    expect(created[1].record.releaseCount).toBe(1);
    expect(created[0].record.releaseCount).toBe(0);
  });

  it("複製が無くなると全写しを解放し管理配列が空になる", () => {
    const created: ReturnType<typeof recordingHandle>[] = [];
    const target = createCompositionTarget({
      spawnPrimary: () => recordingHandle().handle,
      spawnCopy: () => {
        const c = recordingHandle();
        created.push(c);
        return c.handle;
      },
    });
    target.applyComposed(state({ duplication: trail(2) }));
    target.applyComposed(state({ duplication: null }));
    expect(target.liveCopyCount()).toBe(0);
    expect(created.every((c) => c.record.releaseCount === 1)).toBe(true);
  });

  it("プール枯渇（spawnCopy が null）のとき確保できた分だけ生かす", () => {
    let remaining = 2;
    const target = createCompositionTarget({
      spawnPrimary: () => recordingHandle().handle,
      spawnCopy: () => {
        if (remaining <= 0) return null;
        remaining -= 1;
        return recordingHandle().handle;
      },
    });
    target.applyComposed(state({ duplication: trail(5) }));
    expect(target.liveCopyCount()).toBe(2);
  });
});

describe("解放", () => {
  it("主取っ手と全写しを解放し、二度目は何もしない（冪等）", () => {
    const primary = recordingHandle();
    const created: ReturnType<typeof recordingHandle>[] = [];
    const target = createCompositionTarget({
      spawnPrimary: () => primary.handle,
      spawnCopy: () => {
        const c = recordingHandle();
        created.push(c);
        return c.handle;
      },
    });
    target.applyComposed(state({ duplication: { layout: "trail", copies: [{ offset: { x: 0, y: 0, z: 0 } }], minCount: 1 } }));
    target.release();
    expect(primary.record.releaseCount).toBe(1);
    expect(created[0].record.releaseCount).toBe(1);
    target.release();
    expect(primary.record.releaseCount).toBe(1);
  });
});
