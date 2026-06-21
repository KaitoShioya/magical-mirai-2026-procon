import { describe, it, expect } from "vitest";
import { composeGlyphState } from "./effectCompositor";
import type { ComposeInput, ContributionEntry, DegradeDirective } from "./effectCompositor";
import type { AttributeContribution, OperatedAttributes } from "./effectElement";
import type { ResolvedReadabilityStyle } from "./types";
import {
  resolveReadabilityStyle,
  DEFAULT_READABILITY_OPTIONS,
  srgbHexToChannels,
  relativeLuminanceFromSrgbHex,
} from "./readability";

function entry(
  id: string,
  contribution: AttributeContribution,
  priority: number,
  operates: OperatedAttributes
): ContributionEntry {
  return { id, contribution, priority, operates };
}

function input(overrides: Partial<ComposeInput> = {}): ComposeInput {
  return {
    unit: "char",
    contributions: [],
    baseColor: 0x808080,
    bloomThreshold: 0.5,
    readability: null,
    ...overrides,
  };
}

function readingStyle(): ResolvedReadabilityStyle {
  return resolveReadabilityStyle({
    options: DEFAULT_READABILITY_OPTIONS,
    baseFillColor: 0xffffff,
    capability: { stroke: true, outlineOffset: true, outlineBlur: true },
    bloomThreshold: 0.5,
    fallbackFontUsed: false,
    needsBacking: false,
  });
}

function bytes(hex: number): [number, number, number] {
  const c = srgbHexToChannels(hex);
  return [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)];
}

function expectColorClose(actual: number, expected: number, tolerance = 1): void {
  const a = bytes(actual);
  const e = bytes(expected);
  for (let i = 0; i < 3; i += 1) {
    expect(Math.abs(a[i] - e[i])).toBeLessThanOrEqual(tolerance);
  }
}

describe("段1・段2 位置・回転・大きさ（主変形の上書きと揺らぎの加算）", () => {
  it("主変形1件はそのまま出力される", () => {
    const state = composeGlyphState(
      input({
        contributions: [
          entry("a", { position: { layer: "main", value: { x: 2, y: 3, z: 4 } } }, 0, { position: "main" }),
        ],
      })
    );
    expect(state.position).toEqual({ x: 2, y: 3, z: 4 });
  });

  it("主変形2件で同優先度のときは配列順の後者が勝つ", () => {
    const state = composeGlyphState(
      input({
        contributions: [
          entry("a", { position: { layer: "main", value: { x: 1, y: 0, z: 0 } } }, 5, { position: "main" }),
          entry("b", { position: { layer: "main", value: { x: 9, y: 0, z: 0 } } }, 5, { position: "main" }),
        ],
      })
    );
    expect(state.position.x).toBe(9);
  });

  it("主変形2件で異優先度のときは高優先度が勝つ", () => {
    const state = composeGlyphState(
      input({
        contributions: [
          entry("a", { position: { layer: "main", value: { x: 1, y: 0, z: 0 } } }, 10, { position: "main" }),
          entry("b", { position: { layer: "main", value: { x: 9, y: 0, z: 0 } } }, 1, { position: "main" }),
        ],
      })
    );
    expect(state.position.x).toBe(1);
  });

  it("揺らぎ2件は加算される", () => {
    const state = composeGlyphState(
      input({
        contributions: [
          entry("a", { position: { layer: "jitter", value: { x: 1, y: 1, z: 0 } } }, 0, { position: "jitter" }),
          entry("b", { position: { layer: "jitter", value: { x: 2, y: 0, z: 0 } } }, 0, { position: "jitter" }),
        ],
      })
    );
    expect(state.position).toEqual({ x: 3, y: 1, z: 0 });
  });

  it("主変形の上に揺らぎが乗る。大きさは絶対倍率に加算差分が乗る", () => {
    const state = composeGlyphState(
      input({
        contributions: [
          entry("a", { scale: { layer: "main", value: { x: 2, y: 2, z: 2 } } }, 0, { scale: "main" }),
          entry("b", { scale: { layer: "jitter", value: { x: 0.1, y: 0, z: 0 } } }, 0, { scale: "jitter" }),
        ],
      })
    );
    expect(state.scale.x).toBeCloseTo(2.1, 6);
    expect(state.scale.y).toBe(2);
  });

  it("寄与ゼロは単位元（位置零・大きさ1・字間null・回転null）", () => {
    const state = composeGlyphState(input());
    expect(state.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(state.scale).toEqual({ x: 1, y: 1, z: 1 });
    expect(state.letterSpacing).toBeNull();
    expect(state.rotation).toBeNull();
    expect(state.color).toBe(0x808080);
    expect(state.opacity).toBe(1);
  });

  it("位置の主変形が無ければ基準位置を保ち、単位を原点へ動かさない", () => {
    const state = composeGlyphState(input({ basePosition: { x: 5, y: 6, z: 7 } }));
    expect(state.position).toEqual({ x: 5, y: 6, z: 7 });
  });

  it("位置の揺らぎは基準位置の上に乗る", () => {
    const state = composeGlyphState(
      input({
        basePosition: { x: 5, y: 0, z: 0 },
        contributions: [
          entry("a", { position: { layer: "jitter", value: { x: 1, y: 0, z: 0 } } }, 0, { position: "jitter" }),
        ],
      })
    );
    expect(state.position).toEqual({ x: 6, y: 0, z: 0 });
  });

  it("位置の主変形は基準位置を無視して絶対値で上書きする", () => {
    const state = composeGlyphState(
      input({
        basePosition: { x: 5, y: 5, z: 5 },
        contributions: [
          entry("a", { position: { layer: "main", value: { x: 1, y: 2, z: 3 } } }, 0, { position: "main" }),
        ],
      })
    );
    expect(state.position).toEqual({ x: 1, y: 2, z: 3 });
  });

  it("回転を操作する寄与が無ければ rotation は null（カメラ正対を保つ）", () => {
    const state = composeGlyphState(
      input({ contributions: [entry("a", { opacity: { factor: 1 } }, 0, { opacity: true })] })
    );
    expect(state.rotation).toBeNull();
  });

  it("回転の主変形があれば rotation が設定される", () => {
    const state = composeGlyphState(
      input({
        contributions: [
          entry("a", { rotation: { layer: "main", value: { x: 0, y: 0.5, z: 0 } } }, 0, { rotation: "main" }),
        ],
      })
    );
    expect(state.rotation).toEqual({ x: 0, y: 0.5, z: 0 });
  });
});

describe("段3 色（主張色の上書きと補助色の線形混合）", () => {
  it("主張色が無ければ基底色が起点", () => {
    const state = composeGlyphState(input({ baseColor: 0x123456 }));
    expect(state.color).toBe(0x123456);
  });

  it("主張色は最高優先度が上書きする", () => {
    const state = composeGlyphState(
      input({
        contributions: [
          entry("a", { color: { layer: "assertive", color: 0xff0000 } }, 1, { color: "assertive" }),
          entry("b", { color: { layer: "assertive", color: 0x00ff00 } }, 9, { color: "assertive" }),
        ],
      })
    );
    expectColorClose(state.color, 0x00ff00);
  });

  it("補助色 weight=0 は色を変えない", () => {
    const state = composeGlyphState(
      input({
        baseColor: 0x204060,
        contributions: [
          entry("a", { color: { layer: "auxiliary", color: 0xffffff, weight: 0 } }, 0, { color: "auxiliary" }),
        ],
      })
    );
    expectColorClose(state.color, 0x204060);
  });

  it("補助色 weight=1 は補助色へ一致する", () => {
    const state = composeGlyphState(
      input({
        baseColor: 0x204060,
        contributions: [
          entry("a", { color: { layer: "auxiliary", color: 0x3399cc, weight: 1 } }, 0, { color: "auxiliary" }),
        ],
      })
    );
    expectColorClose(state.color, 0x3399cc);
  });

  it("補助色2件は順序が結果に影響し、高優先度が支配的", () => {
    const lowFirst = composeGlyphState(
      input({
        baseColor: 0x000000,
        contributions: [
          entry("a", { color: { layer: "auxiliary", color: 0xff0000, weight: 0.5 } }, 1, { color: "auxiliary" }),
          entry("b", { color: { layer: "auxiliary", color: 0x0000ff, weight: 0.5 } }, 9, { color: "auxiliary" }),
        ],
      })
    );
    // 高優先度（青）を最後に混ぜるため、青成分が赤成分より強くなる。
    const [r, , b] = bytes(lowFirst.color);
    expect(b).toBeGreaterThan(r);
  });
});

describe("段4 透明度（積と読ませる役の下限）", () => {
  it("演出役は係数の積", () => {
    const state = composeGlyphState(
      input({
        contributions: [
          entry("a", { opacity: { factor: 0.5 } }, 0, { opacity: true }),
          entry("b", { opacity: { factor: 0.5 } }, 0, { opacity: true }),
        ],
      })
    );
    expect(state.opacity).toBeCloseTo(0.25, 6);
  });

  it("読ませる役は積が下限を下回れば下限へ", () => {
    const state = composeGlyphState(
      input({
        readability: readingStyle(),
        minReadingOpacity: 0.7,
        contributions: [
          entry("a", { opacity: { factor: 0.2 } }, 0, { opacity: true }),
          entry("b", { opacity: { factor: 0.2 } }, 0, { opacity: true }),
        ],
      })
    );
    expect(state.opacity).toBeCloseTo(0.7, 6);
  });
});

describe("段5 発光（色相保持の引き上げと抑制）", () => {
  it("黒へ発光を要求すると非黒の中立明色になり発光対象", () => {
    const state = composeGlyphState(
      input({
        baseColor: 0x000000,
        contributions: [entry("a", { glow: { intensity: 0.5 } }, 0, { glow: true })],
      })
    );
    const [r, g, b] = bytes(state.color);
    expect(r).toBeGreaterThan(0);
    expect(r).toBe(g);
    expect(g).toBe(b);
    expect(state.glowing).toBe(true);
    expect(relativeLuminanceFromSrgbHex(state.color)).toBeGreaterThan(0.5);
  });

  it("彩度のある色は最も明るいチャネルが上限を超えず色相が保たれる", () => {
    const base = 0xff2200;
    const state = composeGlyphState(
      input({
        baseColor: base,
        contributions: [entry("a", { glow: { intensity: 1 } }, 0, { glow: true })],
      })
    );
    const [r, g, b] = bytes(state.color);
    expect(r).toBeLessThanOrEqual(255);
    // 最も明るい赤が頭打ちのため、緑と青は赤より小さいまま（色相保持）。
    expect(g).toBeLessThan(r);
    expect(b).toBeLessThan(r);
  });

  it("発光寄与が無くても基底色が高輝度なら発光対象", () => {
    const state = composeGlyphState(input({ baseColor: 0xffffff }));
    expect(state.glowing).toBe(true);
  });

  it("読ませる役は発光を抑制し発光対象に数えない", () => {
    const state = composeGlyphState(
      input({
        baseColor: 0xffffff,
        readability: readingStyle(),
        contributions: [entry("a", { glow: { intensity: 1 } }, 0, { glow: true })],
      })
    );
    expect(state.glowing).toBe(false);
    expect(relativeLuminanceFromSrgbHex(state.color)).toBeLessThanOrEqual(0.5 + 1e-6);
  });
});

describe("読ませる役の大きさ（縦横独立は一律倍率へ畳む）", () => {
  it("縦横独立の倍率は各軸最大値の一律倍率へ畳まれ collapsedNonUniformScale が立つ", () => {
    const state = composeGlyphState(
      input({
        readability: readingStyle(),
        contributions: [
          entry("a", { scale: { layer: "main", value: { x: 1, y: 3, z: 1 } } }, 0, { scale: "main" }),
        ],
      })
    );
    expect(state.scale).toEqual({ x: 3, y: 3, z: 3 });
    expect(state.collapsedNonUniformScale).toBe(true);
  });

  it("読ませる役の主張色は合成色を発光抑制した色になり、基底 fillColor で上書きされない", () => {
    const style = readingStyle();
    const state = composeGlyphState(
      input({
        baseColor: 0x222222,
        readability: style,
        contributions: [entry("a", { color: { layer: "assertive", color: 0xff8800 } }, 0, { color: "assertive" })],
      })
    );
    // 合成色（橙）由来であり、確定可読性指定の基底 fillColor（白由来）ではない。
    expect(state.color).not.toBe(style.fillColor);
    const [r, g, b] = bytes(state.color);
    expect(r).toBeGreaterThan(b);
    expect(g).toBeGreaterThan(b);
  });
});

describe("変形を含む単位（変形優先・幾何破棄・読ませる役無効化）", () => {
  it("変形と大きさの混在で変形が採用され大きさが捨てられる", () => {
    const state = composeGlyphState(
      input({
        contributions: [
          entry(
            "a",
            { deform: { kind: "swirl", params: { strength: 0.8, speed: 1, spatialFreq: 1, phaseOffset: 0 } } },
            0,
            { deform: true }
          ),
          entry("b", { scale: { layer: "main", value: { x: 2, y: 2, z: 2 } } }, 0, { scale: "main" }),
        ],
      })
    );
    expect(state.deform).not.toBeNull();
    expect(state.scale).toEqual({ x: 1, y: 1, z: 1 });
    expect(state.droppedGeometricContributions).toBe(1);
  });

  it("変形と位置の混在も幾何が捨てられる", () => {
    const state = composeGlyphState(
      input({
        contributions: [
          entry(
            "a",
            { deform: { kind: "wave", params: { strength: 0.5, speed: 1, spatialFreq: 1, phaseOffset: 0 } } },
            0,
            { deform: true }
          ),
          entry("b", { position: { layer: "main", value: { x: 5, y: 0, z: 0 } } }, 0, { position: "main" }),
        ],
      })
    );
    expect(state.deform).not.toBeNull();
    expect(state.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(state.droppedGeometricContributions).toBe(1);
  });

  it("変形単位は読ませる役指定を無効化する", () => {
    const state = composeGlyphState(
      input({
        readability: readingStyle(),
        contributions: [
          entry(
            "a",
            { deform: { kind: "swirl", params: { strength: 0.8, speed: 1, spatialFreq: 1, phaseOffset: 0 } } },
            0,
            { deform: true }
          ),
        ],
      })
    );
    expect(state.readability).toBeNull();
    expect(state.forcedReadabilityNull).toBe(true);
  });
});

describe("字間（フレーズ・単語のみ、文字単位は捨てる）", () => {
  it("単語単位の字間は主変形で確定する", () => {
    const state = composeGlyphState(
      input({
        unit: "word",
        contributions: [entry("a", { letterSpacing: { layer: "main", value: 1.5 } }, 0, { letterSpacing: "main" })],
      })
    );
    expect(state.letterSpacing).toBeCloseTo(1.5, 6);
  });

  it("文字単位に字間寄与が来ると捨てられ droppedLetterSpacing が増える", () => {
    const state = composeGlyphState(
      input({
        unit: "char",
        contributions: [entry("a", { letterSpacing: { layer: "main", value: 1.5 } }, 0, { letterSpacing: "main" })],
      })
    );
    expect(state.letterSpacing).toBeNull();
    expect(state.droppedLetterSpacing).toBe(1);
  });
});

describe("縮退指示の反映", () => {
  it("dropJitterEffectIds で指定演出の揺らぎが落ちる", () => {
    const contributions = [
      entry("main", { position: { layer: "main", value: { x: 1, y: 0, z: 0 } } }, 0, { position: "main" }),
      entry("jit", { position: { layer: "jitter", value: { x: 5, y: 0, z: 0 } } }, 0, { position: "jitter" }),
    ];
    const withJitter = composeGlyphState(input({ contributions }));
    const directive: DegradeDirective = { dropJitterEffectIds: new Set(["jit"]) };
    const dropped = composeGlyphState(input({ contributions }), directive);
    expect(withJitter.position.x).toBe(6);
    expect(dropped.position.x).toBe(1);
  });

  it("maxCopies で複製の写し数が minCount を下限に減る", () => {
    const copies = [
      { offset: { x: 1, y: 0, z: 0 } },
      { offset: { x: 2, y: 0, z: 0 } },
      { offset: { x: 3, y: 0, z: 0 } },
      { offset: { x: 4, y: 0, z: 0 } },
    ];
    const contributions = [
      entry("dup", { duplication: { layout: "trail", copies, minCount: 2 } }, 0, { duplication: true }),
    ];
    const capped = composeGlyphState(input({ contributions }), { maxCopies: 1 });
    expect(capped.duplication?.copies.length).toBe(2);
  });

  it("dropGlow で発光が落ちる", () => {
    const contributions = [entry("g", { glow: { intensity: 1 } }, 0, { glow: true })];
    const lit = composeGlyphState(input({ baseColor: 0x202020, contributions }));
    const dark = composeGlyphState(input({ baseColor: 0x202020, contributions }), { dropGlow: true });
    expect(lit.glowing).toBe(true);
    expect(dark.glowing).toBe(false);
  });
});

describe("達成基準A 値域と例外", () => {
  it("不整合な寄与（operates 未宣言）は例外を投げる", () => {
    expect(() =>
      composeGlyphState(
        input({
          contributions: [entry("a", { opacity: { factor: 0.5 } }, 0, {})],
        })
      )
    ).toThrow();
  });

  it("透明度は0以上1以下、大きさは0以上に収まる", () => {
    const state = composeGlyphState(
      input({
        contributions: [
          entry("a", { opacity: { factor: 1.5 } }, 0, { opacity: true }),
          entry("b", { scale: { layer: "main", value: { x: 0.5, y: 0.5, z: 0.5 } } }, 0, { scale: "main" }),
        ],
      })
    );
    expect(state.opacity).toBeGreaterThanOrEqual(0);
    expect(state.opacity).toBeLessThanOrEqual(1);
    expect(state.scale.x).toBeGreaterThanOrEqual(0);
  });
});
