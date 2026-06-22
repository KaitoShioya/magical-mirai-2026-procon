// タイポ駆動部（指揮者、Issue #33）の単体テスト。
// 擬似エンジンで、読ませる役の再構成・被覆・読ませる役へのスマッシュ適用・出現破棄の再試行・後始末を固定する。

import { describe, it, expect } from "vitest";
import { createConductor } from "./conductor";
import type { ConductorDeps, ConductorEngineLike, ConductorPlacement, ConductorContent } from "./conductor";
import type { GlyphHandle, ReadabilityOptions, Vector3Like } from "./types";
import { buildLyricsTimeline } from "../../textalive/lyricsTimeline";
import type { LyricSourceVideo } from "../../textalive/lyricsTimeline";
import { buildReadingSpansByPhrase } from "./readingLayout";
import type { ReadingPlacementResolved } from "./readingLayout";
import { EFFECT_ID } from "./effectAssignment";
import type { ResolvedAssignmentPlan, ResolvedEffectAssignment } from "./typographyChartResolve";

// ---- 擬似の取っ手とエンジン ----

interface RecordHandle extends GlyphHandle {
  released: boolean;
  lastScale: Vector3Like | null;
}

function makeHandle(): RecordHandle {
  const h: RecordHandle = {
    released: false,
    lastScale: null,
    setPosition() {},
    setRotation() {},
    setScale() {},
    setScale3(x, y, z) {
      h.lastScale = { x, y, z };
    },
    setColor() {},
    setOpacity() {},
    setLetterSpacing() {},
    applyReadability() {},
    setOrientation() {},
    release() {
      h.released = true;
    },
  };
  return h;
}

interface FakeEngine extends ConductorEngineLike {
  phraseSpawns: { text: string; handle: RecordHandle }[];
}

function makeEngine(placeholderProvider?: () => GlyphHandle | null): FakeEngine {
  const engine: FakeEngine = {
    phraseSpawns: [],
    // 読ませる役は行全体を1つのテキスト（char に文字列全体）として描く。
    spawnGlyph(req) {
      const forced = placeholderProvider?.();
      const handle = forced ?? makeHandle();
      engine.phraseSpawns.push({ text: req.char, handle: handle as RecordHandle });
      return handle;
    },
  };
  return engine;
}

const placement: ConductorPlacement = {
  readingWorldPosition: () => ({ x: 0, y: 0, z: 0 }),
  worldFontSizeForPixelHeight: (px) => px / 100,
};

const region = { centerXRatio: 0.5, centerYRatio: 0.7, widthRatio: 0.8, heightRatio: 0.2 };

function makePhraseSource(text: string, startTime: number, perChar: number) {
  const chars = Array.from(text);
  return {
    startTime,
    endTime: startTime + chars.length * perChar,
    text,
    children: [
      {
        startTime,
        endTime: startTime + chars.length * perChar,
        text,
        children: chars.map((ch, i) => ({
          startTime: startTime + i * perChar,
          endTime: startTime + (i + 1) * perChar,
          text: ch,
        })),
      },
    ],
  };
}

// フレーズ0（0〜200）、無音、フレーズ1（1000〜1200）。
const timeline = buildLyricsTimeline({
  phrases: [makePhraseSource("あい", 0, 100), makePhraseSource("うえ", 1000, 100)],
} as unknown as LyricSourceVideo);

function placementFor(_phraseIndex: number): ReadingPlacementResolved {
  return { unit: "phrase", targetPixelHeight: 20, region };
}

const spansByPhrase = buildReadingSpansByPhrase(timeline, placementFor, {
  viewportPixelWidth: 1000,
  defaultTargetPixelHeight: 20,
  defaultRegion: region,
});

/** 全時間でスマッシュが active な確定割付プラン。 */
function planWithSmash(): ResolvedAssignmentPlan {
  const smash: ResolvedEffectAssignment = {
    effectId: EFFECT_ID.smash,
    grammar: "smash",
    declaredTargetUnit: "char",
    applyGranularity: "char",
    priorityAdjustment: 0,
    segmentCharCadenceBeats: 2,
    effectBeatCadenceBeats: 2,
    status: "active",
    finalPriority: 0,
    beatCadenceOverrideBeats: null,
    range: null,
    songSpecific: false,
  };
  return {
    segments: [
      {
        startTimeMs: 0,
        endTimeMs: 1300,
        granularity: "char",
        reason: "shortDense",
        phraseIndex: 0,
        unitRefs: [],
        phraseChunk: null,
        charCadenceBeats: 2,
        assignments: [smash],
      },
    ],
  };
}

/** スマッシュを持たない確定割付プラン。 */
function planWithoutSmash(): ResolvedAssignmentPlan {
  return { segments: [] };
}

const readability: ReadabilityOptions = {
  borderColor: 0,
  borderWidth: "4%",
  borderOpacity: 1,
  shadowColor: 0,
  shadowWidth: "3%",
  shadowOffsetX: "3%",
  shadowOffsetY: "-3%",
  shadowBlur: "8%",
  shadowOpacity: 0.85,
  maxBrightLuminance: 0.45,
  minPixelHeight: 18,
};

function makeDeps(engine: FakeEngine, resolvedPlan: ResolvedAssignmentPlan, isPlaceholder?: (h: GlyphHandle) => boolean): ConductorDeps {
  const content: ConductorContent = { timeline, resolvedPlan, spansByPhrase, placementFor };
  return {
    engine,
    placement,
    content,
    fontName: "test",
    readabilityFor: () => readability,
    baseColor: 0xffffff,
    isPlaceholder: isPlaceholder ?? (() => false),
  };
}

describe("conductor 読ませる役", () => {
  it("発声中のフレーズで読ませる役を1つ生成する", () => {
    const engine = makeEngine();
    const c = createConductor(makeDeps(engine, planWithoutSmash()));
    c.update(50);
    expect(engine.phraseSpawns).toHaveLength(1);
    expect(engine.phraseSpawns[0].text).toBe("あい");
  });

  it("同じ区間の間は作り直さない", () => {
    const engine = makeEngine();
    const c = createConductor(makeDeps(engine, planWithoutSmash()));
    c.update(50);
    c.update(60);
    c.update(90);
    expect(engine.phraseSpawns).toHaveLength(1);
  });

  it("無音区間に入ると読ませる役を解放する", () => {
    const engine = makeEngine();
    const c = createConductor(makeDeps(engine, planWithoutSmash()));
    c.update(50);
    const first = engine.phraseSpawns[0].handle;
    c.update(500);
    expect(first.released).toBe(true);
  });

  it("別のフレーズへ移ると新しい読ませる役を生成する", () => {
    const engine = makeEngine();
    const c = createConductor(makeDeps(engine, planWithoutSmash()));
    c.update(50);
    c.update(1050);
    expect(engine.phraseSpawns).toHaveLength(2);
    expect(engine.phraseSpawns[1].text).toBe("うえ");
  });

  it("出現破棄（プレースホルダ）は登録せず次フレームに再試行する", () => {
    const placeholder = makeHandle();
    const deps = makeDeps(makeEngine(), planWithoutSmash(), (h) => h === placeholder);
    const engineForced = makeEngine(() => placeholder);
    const c = createConductor({ ...deps, engine: engineForced });
    c.update(50);
    c.update(60);
    // 区間は同じだが登録されないため、毎フレーム生成を試みる（2回）。
    expect(engineForced.phraseSpawns.length).toBe(2);
    expect(placeholder.released).toBe(true);
  });
});

describe("conductor 読ませる役へのスマッシュ適用", () => {
  it("スマッシュが有効なら出現直後に読ませる役を拡大する（倍率1超）", () => {
    const engine = makeEngine();
    const c = createConductor(makeDeps(engine, planWithSmash()));
    c.update(10); // 区間（フレーズ0）の開始直後。
    const scale = engine.phraseSpawns[0].handle.lastScale;
    expect(scale).not.toBeNull();
    expect(scale!.x).toBeGreaterThan(1);
  });

  it("拡大は短時間で落ち着き寸法（倍率1）へ戻る", () => {
    const engine = makeEngine();
    const c = createConductor(makeDeps(engine, planWithSmash()));
    c.update(10);
    c.update(150); // 開始から150ミリ秒（落ち着き割合35%を過ぎる）→ 倍率1。
    expect(engine.phraseSpawns[0].handle.lastScale!.x).toBeCloseTo(1);
  });

  it("スマッシュが無効なら拡大しない（倍率1のまま）", () => {
    const engine = makeEngine();
    const c = createConductor(makeDeps(engine, planWithoutSmash()));
    c.update(10);
    const scale = engine.phraseSpawns[0].handle.lastScale;
    // 倍率1のまま（設定されないか、設定されても1）。
    if (scale !== null) {
      expect(scale.x).toBeCloseTo(1);
    }
  });
});

describe("conductor 後始末と再構成", () => {
  it("dispose で表示中の読ませる役を解放する", () => {
    const engine = makeEngine();
    const c = createConductor(makeDeps(engine, planWithSmash()));
    c.update(10);
    const reading = engine.phraseSpawns[0].handle;
    c.dispose();
    expect(reading.released).toBe(true);
  });

  it("時刻が後戻り（シーク）しても現在時刻の正しい状態へ収束する", () => {
    const engine = makeEngine();
    const c = createConductor(makeDeps(engine, planWithoutSmash()));
    c.update(1050); // フレーズ1
    expect(engine.phraseSpawns[engine.phraseSpawns.length - 1].text).toBe("うえ");
    c.update(50); // フレーズ0へシーク
    expect(engine.phraseSpawns[engine.phraseSpawns.length - 1].text).toBe("あい");
  });
});
