import { describe, it, expect } from "vitest";
import type { Text } from "troika-three-text";
import {
  detectReadabilityCapability,
  applyReadableTextStyle,
  createReadabilityBacking,
  type ReadableTextTarget,
} from "./readabilityRenderer";
import type { ResolvedReadabilityStyle } from "./types";

function makeStyle(overrides: Partial<ResolvedReadabilityStyle> = {}): ResolvedReadabilityStyle {
  return {
    minPixelHeight: 18,
    fillColor: 0xb3b3b3,
    maxBrightLuminance: 0.45,
    clampBrightBelowBloom: true,
    mode: "borderAndShadow",
    borderVia: "stroke",
    hasShadow: true,
    backing: "none",
    borderColor: 0x000000,
    borderWidth: "14%",
    borderOpacity: 1,
    shadowColor: 0x010101,
    shadowWidth: "6%",
    shadowOffsetX: "3%",
    shadowOffsetY: "-3%",
    shadowBlur: "12%",
    shadowOpacity: 0.85,
    ...overrides,
  };
}

function makeTarget(): ReadableTextTarget {
  return {
    color: 0xffffff,
    strokeWidth: 99,
    strokeColor: 0xffffff,
    strokeOpacity: 0.1,
    outlineWidth: 99,
    outlineColor: 0xffffff,
    outlineOpacity: 0.1,
    outlineOffsetX: 99,
    outlineOffsetY: 99,
    outlineBlur: 99,
  };
}

describe("機能可否の判定", () => {
  it("stroke系とoutline系のずれ・ぼかしが揃えば全て真", () => {
    const text = {
      strokeWidth: 0,
      strokeColor: 0,
      strokeOpacity: 1,
      outlineOffsetX: 0,
      outlineOffsetY: 0,
      outlineBlur: 0,
    };
    expect(detectReadabilityCapability(text)).toEqual({
      stroke: true,
      outlineOffset: true,
      outlineBlur: true,
    });
  });
  it("stroke系が無ければ stroke は偽", () => {
    const text = { outlineOffsetX: 0, outlineOffsetY: 0, outlineBlur: 0 };
    expect(detectReadabilityCapability(text).stroke).toBe(false);
  });
});

describe("確定可読性指定の反映", () => {
  it("縁取りと影モードは縁取りをstroke、影をoutlineのずれとぼかしで設定する", () => {
    const target = makeTarget();
    applyReadableTextStyle(target, makeStyle());
    expect(target.color).toBe(0xb3b3b3);
    expect(target.strokeColor).toBe(0x000000);
    expect(target.strokeWidth).toBe("14%");
    expect(target.strokeOpacity).toBe(1);
    expect(target.outlineColor).toBe(0x010101);
    expect(target.outlineWidth).toBe("6%");
    expect(target.outlineOffsetX).toBe("3%");
    expect(target.outlineOffsetY).toBe("-3%");
    expect(target.outlineBlur).toBe("12%");
    expect(target.outlineOpacity).toBe(0.85);
  });
  it("縁取りのみモードは縁取りをoutline（ずれなし）で設定し、影を持たない", () => {
    const target = makeTarget();
    applyReadableTextStyle(
      target,
      makeStyle({ mode: "borderOnly", borderVia: "outline", hasShadow: false })
    );
    expect(target.strokeWidth).toBe(0);
    expect(target.outlineColor).toBe(0x000000);
    expect(target.outlineWidth).toBe("14%");
    expect(target.outlineOffsetX).toBe(0);
    expect(target.outlineOffsetY).toBe(0);
    expect(target.outlineBlur).toBe(0);
  });
  it("再利用時の残留を防ぐため縁取りと影を一度無効値へ戻す", () => {
    const target = makeTarget();
    // 影を持たないモードで反映すると、前の影の値が残らない。
    applyReadableTextStyle(
      target,
      makeStyle({ mode: "borderOnly", borderVia: "outline", hasShadow: false })
    );
    expect(target.outlineOffsetX).toBe(0);
    expect(target.outlineBlur).toBe(0);
  });
});

describe("可読性下地の生成", () => {
  it("下地なしは null を返す", () => {
    const backing = createReadabilityBacking(makeStyle({ backing: "none" }), "あ", null, {
      createText: () => {
        throw new Error("呼ばれないはず");
      },
    });
    expect(backing).toBeNull();
  });
  it("単位背面の暗い面はメッシュを返し、後始末できる", () => {
    const backing = createReadabilityBacking(
      makeStyle({ mode: "borderAndBacking", backing: "unitPlate" }),
      "あ",
      null,
      {
        createText: () => {
          throw new Error("単位背面の暗い面では Text を作らない");
        },
      }
    );
    expect(backing).not.toBeNull();
    backing?.setTransform({ x: 1, y: 2, z: 3, fontSize: 4 });
    expect(backing?.object.position.x).toBe(1);
    expect(() => backing?.dispose()).not.toThrow();
  });
});

describe("可読性下地の追従", () => {
  it("単位背面の暗い面は基準寸法と拡大倍率の積で寸法を作り、倍率変更後も寸法を保つ", () => {
    const backing = createReadabilityBacking(
      makeStyle({ mode: "borderAndBacking", backing: "unitPlate" }),
      "あ",
      null,
      { createText: () => ({}) as unknown as Text }
    );
    if (!backing) throw new Error("下地が生成されなかった");
    // 係数は readabilityRenderer の UNIT_PLATE_WIDTH_FACTOR=0.9・HEIGHT_FACTOR=1.1。
    backing.setTransform({ x: 0, y: 0, z: 0, fontSize: 4 });
    expect(backing.object.scale.x).toBeCloseTo(4 * 0.9, 6);
    expect(backing.object.scale.y).toBeCloseTo(4 * 1.1, 6);
    // 倍率を2倍にしても、基準寸法由来の幅・高さを失わず積になる。
    backing.setScale(2);
    expect(backing.object.scale.x).toBeCloseTo(4 * 0.9 * 2, 6);
    expect(backing.object.scale.y).toBeCloseTo(4 * 1.1 * 2, 6);
    // 基準寸法を変えても倍率は保たれる。
    backing.setTransform({ x: 0, y: 0, z: 0, fontSize: 5 });
    expect(backing.object.scale.x).toBeCloseTo(5 * 0.9 * 2, 6);
    expect(backing.object.scale.y).toBeCloseTo(5 * 1.1 * 2, 6);
    backing.dispose();
  });

  it("単位背面の暗い面の sync は確定を要さず即座に完了の通知を呼ぶ", () => {
    const backing = createReadabilityBacking(
      makeStyle({ mode: "borderAndBacking", backing: "unitPlate" }),
      "あ",
      null,
      { createText: () => ({}) as unknown as Text }
    );
    let done = false;
    backing?.sync(() => {
      done = true;
    });
    expect(done).toBe(true);
    backing?.dispose();
  });

  it("単位背面の暗い面の setOpacity は元の不透明度との積になる", () => {
    const backing = createReadabilityBacking(
      makeStyle({ mode: "borderAndBacking", backing: "unitPlate", shadowOpacity: 0.8 }),
      "あ",
      null,
      { createText: () => ({}) as unknown as Text }
    );
    if (!backing) throw new Error("下地が生成されなかった");
    const material = (backing.object as unknown as { material: { opacity: number } }).material;
    backing.setOpacity(0.5);
    expect(material.opacity).toBeCloseTo(0.8 * 0.5, 6);
    backing.dispose();
  });

  it("文字形の暗い複製の setOpacity は塗りと縁取りを同じ不透明度にする", () => {
    const copy = {
      text: "",
      font: null as string | null,
      color: 0 as number | string,
      fillOpacity: 1,
      outlineWidth: 0 as number | string,
      outlineColor: 0 as number | string,
      outlineOpacity: 1,
      anchorX: "",
      anchorY: "",
      visible: true,
      fontSize: 0,
      position: { set(): void {} },
      scale: { setScalar(): void {} },
      sync(): void {},
      dispose(): void {},
    };
    const backing = createReadabilityBacking(
      makeStyle({ mode: "borderAndBacking", backing: "glyphCopy" }),
      "あ",
      "/fonts/main.woff",
      { createText: () => copy as unknown as Text }
    );
    backing?.setOpacity(0.4);
    expect(copy.fillOpacity).toBe(0.4);
    expect(copy.outlineOpacity).toBe(0.4);
  });

  it("文字形の暗い複製は寸法を fontSize、拡大倍率を scale で別に持ち、sync 完了で可視化し通知する", () => {
    const copy = {
      text: "",
      font: null as string | null,
      color: 0 as number | string,
      fillOpacity: 1,
      outlineWidth: 0 as number | string,
      outlineColor: 0 as number | string,
      outlineOpacity: 1,
      anchorX: "",
      anchorY: "",
      visible: true,
      fontSize: 0,
      position: { x: 0, y: 0, z: 0, set(x: number, y: number, z: number): void {
        this.x = x;
        this.y = y;
        this.z = z;
      } },
      scale: { x: 1, setScalar(s: number): void {
        this.x = s;
      } },
      lastSync: null as (() => void) | null,
      sync(cb?: () => void): void {
        this.lastSync = cb ?? null;
      },
      dispose(): void {},
    };
    const backing = createReadabilityBacking(
      makeStyle({ mode: "borderAndBacking", backing: "glyphCopy" }),
      "あ",
      "/fonts/main.woff",
      { createText: () => copy as unknown as Text }
    );
    if (!backing) throw new Error("下地が生成されなかった");
    backing.setTransform({ x: 0, y: 0, z: 0, fontSize: 4 });
    backing.setScale(2);
    expect(copy.fontSize).toBe(4);
    expect(copy.scale.x).toBe(2);
    let done = false;
    backing.sync(() => {
      done = true;
    });
    expect(done).toBe(false); // troika の確定完了を待つ。
    copy.lastSync?.();
    expect(done).toBe(true);
    expect(copy.visible).toBe(true);
  });
});
