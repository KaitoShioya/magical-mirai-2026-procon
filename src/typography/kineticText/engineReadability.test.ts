import { describe, it, expect } from "vitest";
import type { Camera, Scene } from "three";
import type { Text, BatchedText } from "troika-three-text";
import { createKineticTextEngine } from "./engine";
import { createFontRegistry } from "./fontRegistry";
import { DEFAULT_READABILITY_OPTIONS, relativeLuminanceFromSrgbHex } from "./readability";
import type { FontRegistry, ReadabilityCapability } from "./types";

// 可読性に必要なプロパティを備えた擬似 Text（troika の Text を模す）。
interface ReadableFakeText {
  text: string;
  font: string | null;
  fontSize: number;
  color: number;
  fillOpacity: number;
  anchorX: string;
  anchorY: string;
  visible: boolean;
  strokeWidth: number | string;
  strokeColor: number | string;
  strokeOpacity: number;
  outlineWidth: number | string;
  outlineColor: number | string;
  outlineOpacity: number;
  outlineOffsetX: number | string;
  outlineOffsetY: number | string;
  outlineBlur: number | string;
  position: { x: number; y: number; z: number; set(x: number, y: number, z: number): void };
  rotation: { set(): void };
  scale: { x: number; setScalar(s: number): void };
  quaternion: { copy(): void };
  lastSyncCallback: (() => void) | null;
  syncCount: number;
  sync(cb?: () => void): void;
  dispose(): void;
}

function makeReadableFakeText(): ReadableFakeText {
  return {
    text: "",
    font: null,
    fontSize: 0,
    color: 0,
    fillOpacity: 1,
    anchorX: "",
    anchorY: "",
    visible: true,
    strokeWidth: 0,
    strokeColor: 0,
    strokeOpacity: 1,
    outlineWidth: 0,
    outlineColor: 0,
    outlineOpacity: 1,
    outlineOffsetX: 0,
    outlineOffsetY: 0,
    outlineBlur: 0,
    position: {
      x: 0,
      y: 0,
      z: 0,
      set(x: number, y: number, z: number): void {
        this.x = x;
        this.y = y;
        this.z = z;
      },
    },
    rotation: { set(): void {} },
    scale: {
      x: 1,
      setScalar(s: number): void {
        this.x = s;
      },
    },
    quaternion: { copy(): void {} },
    lastSyncCallback: null,
    syncCount: 0,
    sync(cb?: () => void): void {
      this.syncCount += 1;
      this.lastSyncCallback = cb ?? null;
    },
    dispose(): void {},
  };
}

const FULL_CAPABILITY: ReadabilityCapability = {
  stroke: true,
  outlineOffset: true,
  outlineBlur: true,
};

function setup(options?: {
  single?: number;
  fallbackName?: string;
  registerFallback?: boolean;
  viewportPixelHeight?: () => number;
  needsBacking?: boolean;
  checkFontAvailable?: (url: string) => Promise<boolean>;
  warmUp?: (fontUrl: string | null, characters: string) => Promise<void>;
  capability?: ReadabilityCapability;
}) {
  const created: ReadableFakeText[] = [];
  const fonts: FontRegistry = createFontRegistry();
  const credit = {
    fontName: "見本",
    author: "作者",
    sourceLabel: "配布元",
    sourceUrl: "https://example.com/font",
    license: "SIL Open Font License",
    licenseFileUrl: "/fonts/OFL.txt",
  };
  fonts.register({
    name: "main",
    url: "/fonts/main.woff",
    weight: 700,
    credit,
    fallbackName: options?.fallbackName,
  });
  if (options?.registerFallback) {
    fonts.register({ name: "fb", url: "/fonts/fallback.woff", weight: 400, credit });
  }
  const camera = {
    isPerspectiveCamera: true,
    fov: 60,
    position: { x: 0, y: 0, z: 10 },
    quaternion: { tag: "camera" },
  } as unknown as Camera;
  const scene = { add(): void {}, remove(): void {} } as unknown as Scene;
  const fakeBatched = {
    members: [] as unknown[],
    addText(t: unknown): void {
      this.members.push(t);
    },
    removeText(t: unknown): void {
      const i = this.members.indexOf(t);
      if (i >= 0) this.members.splice(i, 1);
    },
    sync(): void {},
    dispose(): void {},
  };
  const engine = createKineticTextEngine(
    {
      scene,
      camera,
      fonts,
      limits: { single: options?.single ?? 8, batched: 16 },
      viewportPixelHeight: options?.viewportPixelHeight,
      readabilityNeedsBacking: options?.needsBacking,
    },
    {
      createText: (): Text => {
        const fake = makeReadableFakeText();
        created.push(fake);
        return fake as unknown as Text;
      },
      createBatchedText: (): BatchedText => fakeBatched as unknown as BatchedText,
      warmUp: options?.warmUp ?? (async (): Promise<void> => {}),
      checkFontAvailable: options?.checkFontAvailable ?? (async (): Promise<boolean> => true),
      readabilityCapability: options?.capability ?? FULL_CAPABILITY,
    }
  );
  return { engine, created, fakeBatched };
}

const readableGlyph = {
  char: "あ",
  fontName: "main",
  position: { x: 0, y: 0, z: 0 },
  fontSize: 3,
  color: 0xffffff,
  opacity: 1,
  readability: DEFAULT_READABILITY_OPTIONS,
};

describe("可読性付きの単一文字", () => {
  it("縁取りと影モードで縁取りをstroke、影をoutlineで設定し、塗りを発光上限以下へ収める", () => {
    const { engine, created } = setup();
    engine.spawnGlyph(readableGlyph);
    const text = created[0];
    expect(text.strokeColor).toBe(0x000000);
    expect(text.strokeWidth).toBe(DEFAULT_READABILITY_OPTIONS.borderWidth);
    expect(text.outlineColor).toBe(DEFAULT_READABILITY_OPTIONS.shadowColor);
    expect(text.outlineOffsetX).toBe(DEFAULT_READABILITY_OPTIONS.shadowOffsetX);
    // 塗りは発光上限（0.45）以下へ収まる（白のままにならない）。
    expect(relativeLuminanceFromSrgbHex(text.color)).toBeLessThanOrEqual(0.45);
  });

  it("stroke非対応なら縁取りをoutline（ずれなし）で描き、別建ての影を持たない", () => {
    const { engine, created } = setup({
      capability: { stroke: false, outlineOffset: false, outlineBlur: false },
    });
    engine.spawnGlyph(readableGlyph);
    const text = created[0];
    expect(text.strokeWidth).toBe(0);
    expect(text.outlineColor).toBe(DEFAULT_READABILITY_OPTIONS.borderColor);
    expect(text.outlineWidth).toBe(DEFAULT_READABILITY_OPTIONS.borderWidth);
    expect(text.outlineOffsetX).toBe(0);
    expect(text.outlineBlur).toBe(0);
  });
});

describe("最小表示寸法の下限", () => {
  it("デバイス画素高が注入され、下限が基準より大きいとき fontSize を引き上げる", () => {
    const { engine, created } = setup({ viewportPixelHeight: () => 1000 });
    engine.spawnGlyph({
      ...readableGlyph,
      readability: { ...DEFAULT_READABILITY_OPTIONS, minPixelHeight: 500 },
    });
    // 期待値: minPixelHeight=500, distance=10, fov=60, vp=1000 → 500*2*10*tan(30°)/1000 ≈ 5.7735。
    expect(created[0].fontSize).toBeCloseTo(5.7735, 3);
    expect(created[0].fontSize).toBeGreaterThan(3);
  });

  it("デバイス画素高の注入が無いときは下限を適用せず基準寸法のまま", () => {
    const { engine, created } = setup();
    engine.spawnGlyph({
      ...readableGlyph,
      readability: { ...DEFAULT_READABILITY_OPTIONS, minPixelHeight: 500 },
    });
    expect(created[0].fontSize).toBe(3);
  });
});

describe("未収録文字とフォント読込失敗の代替", () => {
  it("暖めた文字集合に無い文字は代替フォントへ回し、件数を数える", async () => {
    const { engine, created } = setup({ fallbackName: "fb", registerFallback: true });
    await engine.warmUp("あ"); // 収録範囲は「あ」のみ。
    engine.spawnGlyph({ ...readableGlyph, char: "ん" });
    expect(created[0].font).toBe("/fonts/fallback.woff");
    expect(engine.stats().fallbackFontUses).toBe(1);
  });

  it("収録済みの文字は主フォントで描く（代替件数は増えない）", async () => {
    const { engine, created } = setup({ fallbackName: "fb", registerFallback: true });
    await engine.warmUp("あ");
    engine.spawnGlyph({ ...readableGlyph, char: "あ" });
    expect(created[0].font).toBe("/fonts/main.woff");
    expect(engine.stats().fallbackFontUses).toBe(0);
  });

  it("フォントの取得に失敗すると失敗を数え、その文字を代替へ回す", async () => {
    const { engine, created } = setup({
      fallbackName: "fb",
      registerFallback: true,
      checkFontAvailable: async (url: string): Promise<boolean> => url !== "/fonts/main.woff",
    });
    await engine.warmUp("あ");
    expect(engine.stats().fontLoadFailures).toBe(1);
    engine.spawnGlyph({ ...readableGlyph, char: "あ" });
    expect(created[0].font).toBe("/fonts/fallback.woff");
    expect(engine.stats().fallbackFontUses).toBe(1);
  });

  it("代替フォントが未登録なら troika 既定（font=null）へ回す", async () => {
    const { engine, created } = setup({ fallbackName: undefined, registerFallback: false });
    await engine.warmUp("あ");
    engine.spawnGlyph({ ...readableGlyph, char: "ん" });
    expect(created[0].font).toBeNull();
    expect(engine.stats().fallbackFontUses).toBe(1);
  });
});

describe("読ませる役のフレーズ", () => {
  it("一括描画でなく単一文字層で描く", () => {
    const { engine, created, fakeBatched } = setup();
    engine.spawnPhrase({
      text: "あい",
      fontName: "main",
      position: { x: 0, y: 0, z: 0 },
      letterSpacing: 1,
      fontSize: 3,
      color: 0xffffff,
      opacity: 1,
      readability: DEFAULT_READABILITY_OPTIONS,
    });
    expect(fakeBatched.members).toHaveLength(0);
    expect(created).toHaveLength(2);
    expect(engine.stats().activeGlyphs).toBe(2);
    expect(engine.stats().activeBatchedMembers).toBe(0);
  });
});

describe("可読性下地", () => {
  it("下地が要るとき下地を描き、活動下地数を数える", () => {
    const { engine } = setup({ needsBacking: true });
    engine.spawnGlyph(readableGlyph);
    expect(engine.stats().activeBackings).toBe(1);
  });
});

describe("プール再利用での縁取り・影の残留防止", () => {
  it("可読性付きの後に同じ Text を可読性なしへ再利用しても縁取り・影が残らない", () => {
    const { engine, created } = setup({ single: 1 });
    const handle = engine.spawnGlyph(readableGlyph);
    const text = created[0];
    expect(text.strokeWidth).not.toBe(0);
    handle.release();
    engine.spawnGlyph({
      char: "X",
      fontName: "main",
      position: { x: 0, y: 0, z: 0 },
      fontSize: 3,
      color: 0xffffff,
      opacity: 1,
    });
    // プールが同じ Text を再利用する（新規生成しない）。
    expect(created).toHaveLength(1);
    expect(text.strokeWidth).toBe(0);
    expect(text.outlineWidth).toBe(0);
    expect(text.outlineOffsetX).toBe(0);
    expect(text.outlineBlur).toBe(0);
  });
});

describe("フォント読込失敗の代替（補強）", () => {
  it("暖め自体が失敗したフォントも失敗に数え、その文字を代替へ回す", async () => {
    const { engine, created } = setup({
      fallbackName: "fb",
      registerFallback: true,
      warmUp: async (url: string | null): Promise<void> => {
        if (url === "/fonts/main.woff") {
          throw new Error("暖め失敗");
        }
      },
    });
    await engine.warmUp("あ");
    expect(engine.stats().fontLoadFailures).toBe(1);
    engine.spawnGlyph({ ...readableGlyph, char: "あ" });
    expect(created[0].font).toBe("/fonts/fallback.woff");
  });

  it("主フォントも代替フォントも失敗したら troika 既定（font=null）へ回す", async () => {
    const { engine, created } = setup({
      fallbackName: "fb",
      registerFallback: true,
      checkFontAvailable: async (): Promise<boolean> => false,
    });
    await engine.warmUp("あ");
    expect(engine.stats().fontLoadFailures).toBe(2);
    engine.spawnGlyph({ ...readableGlyph, char: "あ" });
    expect(created[0].font).toBeNull();
  });

  it("演出役フレーズの未収録文字は代替（ここでは troika 既定）へ回し、主フォントへ戻さない", async () => {
    const { engine, created } = setup({ fallbackName: undefined, registerFallback: false });
    await engine.warmUp("あ");
    engine.spawnPhrase({
      text: "ん",
      fontName: "main",
      position: { x: 0, y: 0, z: 0 },
      letterSpacing: 1,
      fontSize: 3,
      color: 0xffffff,
      opacity: 1,
    });
    expect(created[0].font).toBeNull();
    expect(engine.stats().fallbackFontUses).toBe(1);
  });
});

describe("setColor の発光抑制", () => {
  it("読ませる役の setColor は塗りを発光上限以下へ収める", () => {
    const { engine, created } = setup();
    const handle = engine.spawnGlyph(readableGlyph);
    handle.setColor(0xffffff);
    expect(relativeLuminanceFromSrgbHex(created[0].color)).toBeLessThanOrEqual(0.45);
  });

  it("演出役の setColor は生色のまま（抑制しない）", () => {
    const { engine, created } = setup();
    const handle = engine.spawnGlyph({
      char: "X",
      fontName: "main",
      position: { x: 0, y: 0, z: 0 },
      fontSize: 3,
      color: 0x808080,
      opacity: 1,
    });
    handle.setColor(0xffffff);
    expect(created[0].color).toBe(0xffffff);
  });
});

describe("setOpacity の縁取り・影への追従", () => {
  it("読ませる役の setOpacity は塗り・縁取り・影に同じ実効不透明度を掛ける", () => {
    const { engine, created } = setup();
    const handle = engine.spawnGlyph(readableGlyph);
    handle.setOpacity(0.5);
    const text = created[0];
    expect(text.fillOpacity).toBe(0.5);
    // 既定: borderOpacity=1, shadowOpacity=0.85。縁取り=stroke、影=outline。
    expect(text.strokeOpacity).toBeCloseTo(1 * 0.5, 6);
    expect(text.outlineOpacity).toBeCloseTo(0.85 * 0.5, 6);
  });

  it("読ませる役を不透明度0で出すと縁取り・影も消える（黒い形が残らない）", () => {
    const { engine, created } = setup();
    engine.spawnGlyph({ ...readableGlyph, opacity: 0 });
    const text = created[0];
    expect(text.fillOpacity).toBe(0);
    expect(text.strokeOpacity).toBe(0);
    expect(text.outlineOpacity).toBe(0);
  });

  it("演出役の setOpacity は塗りの不透明度だけを変える", () => {
    const { engine, created } = setup();
    const handle = engine.spawnGlyph({
      char: "X",
      fontName: "main",
      position: { x: 0, y: 0, z: 0 },
      fontSize: 3,
      color: 0x808080,
      opacity: 1,
    });
    handle.setOpacity(0.3);
    const text = created[0];
    expect(text.fillOpacity).toBe(0.3);
    // 演出役は縁取り・影を使わないため既定値（1）のまま。
    expect(text.strokeOpacity).toBe(1);
    expect(text.outlineOpacity).toBe(1);
  });
});

describe("最後段の可読性補正の再適用", () => {
  it("applyReadability で縁取り・影・塗りを再設定し、配置を確定し直す", () => {
    const { engine, created } = setup();
    const handle = engine.spawnGlyph(readableGlyph);
    const text = created[0];
    const syncBefore = text.syncCount;
    handle.applyReadability({
      minPixelHeight: 18,
      fillColor: 0x222222,
      maxBrightLuminance: 0.45,
      clampBrightBelowBloom: true,
      mode: "borderOnly",
      borderVia: "outline",
      hasShadow: false,
      backing: "none",
      borderColor: 0x111111,
      borderWidth: "20%",
      borderOpacity: 1,
      shadowColor: 0,
      shadowWidth: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      shadowBlur: 0,
      shadowOpacity: 1,
    });
    expect(text.color).toBe(0x222222);
    expect(text.outlineWidth).toBe("20%");
    expect(text.syncCount).toBe(syncBefore + 1);
  });
});
