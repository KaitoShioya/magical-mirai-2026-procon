import { describe, it, expect } from "vitest";
import type { Text, BatchedText } from "troika-three-text";
import type { Camera, Scene } from "three";
import { createKineticTextEngine } from "./engine";
import { createFontRegistry } from "./fontRegistry";
import type { FontRegistry } from "./types";

interface FakeText {
  text: string;
  font: string | null;
  fontSize: number;
  color: number;
  fillOpacity: number;
  anchorX: string;
  anchorY: string;
  visible: boolean;
  position: { set(x: number, y: number, z: number): void };
  rotation: { set(x: number, y: number, z: number): void };
  scale: { setScalar(s: number): void };
  quaternion: { copy(q: unknown): void; copied: unknown };
  lastSyncCallback: (() => void) | null;
  sync(cb?: () => void): void;
  dispose(): void;
}

function makeFakeText(): FakeText {
  const fake: FakeText = {
    text: "",
    font: null,
    fontSize: 0,
    color: 0,
    fillOpacity: 1,
    anchorX: "",
    anchorY: "",
    visible: true,
    position: { set(): void {} },
    rotation: { set(): void {} },
    scale: { setScalar(): void {} },
    quaternion: {
      copied: null,
      copy(q: unknown): void {
        this.copied = q;
      },
    },
    lastSyncCallback: null,
    sync(cb?: () => void): void {
      this.lastSyncCallback = cb ?? null;
    },
    dispose(): void {},
  };
  return fake;
}

interface FakeBatched {
  members: FakeText[];
  lastSyncCallback: (() => void) | null;
  addText(text: FakeText): void;
  removeText(text: FakeText): void;
  sync(cb?: () => void): void;
  dispose(): void;
}

function makeFakeBatched(): FakeBatched {
  const fake: FakeBatched = {
    members: [],
    lastSyncCallback: null,
    addText(text: FakeText): void {
      this.members.push(text);
    },
    removeText(text: FakeText): void {
      const index = this.members.indexOf(text);
      if (index >= 0) this.members.splice(index, 1);
    },
    sync(cb?: () => void): void {
      this.lastSyncCallback = cb ?? null;
    },
    dispose(): void {},
  };
  return fake;
}

function setup(single = 2, batched = 4) {
  const created: FakeText[] = [];
  const fonts: FontRegistry = createFontRegistry();
  fonts.register({
    name: "main",
    url: "/fonts/main.woff",
    weight: 700,
    credit: {
      fontName: "見本",
      author: "作者",
      source: "配布元",
      license: "SIL Open Font License",
      licenseFileUrl: "/fonts/OFL.txt",
    },
  });
  const camera = { quaternion: { tag: "camera" } } as unknown as Camera;
  const scene = { add(): void {}, remove(): void {} } as unknown as Scene;
  const fakeBatched = makeFakeBatched();
  const engine = createKineticTextEngine(
    { scene, camera, fonts, limits: { single, batched } },
    {
      createText: (): Text => {
        const fake = makeFakeText();
        created.push(fake);
        return fake as unknown as Text;
      },
      createBatchedText: (): BatchedText => fakeBatched as unknown as BatchedText,
      warmUp: async (): Promise<void> => {},
    }
  );
  return { engine, created, camera, fakeBatched };
}

const basePhrase = {
  text: "あい",
  fontName: "main",
  position: { x: 0, y: 0, z: 0 },
  letterSpacing: 1,
  fontSize: 3,
  color: 0xffffff,
  opacity: 1,
};

const baseGlyph = {
  char: "あ",
  fontName: "main",
  position: { x: 0, y: 0, z: 0 },
  fontSize: 3,
  color: 0xffffff,
  opacity: 1,
};

describe("createKineticTextEngine 単一文字層", () => {
  it("sync 完了が現役なら可視化する", () => {
    const { engine, created } = setup();
    engine.spawnGlyph(baseGlyph);
    const text = created[0];
    expect(text.visible).toBe(false);
    text.lastSyncCallback?.();
    expect(text.visible).toBe(true);
  });

  it("解放後に届いた sync 完了は無視する（古い完了通知で復活しない）", () => {
    const { engine, created } = setup();
    const handle = engine.spawnGlyph(baseGlyph);
    const text = created[0];
    handle.release();
    text.lastSyncCallback?.();
    expect(text.visible).toBe(false);
  });

  it("表示残存を過ぎると update で自動解放する", () => {
    const { engine } = setup();
    engine.spawnGlyph({ ...baseGlyph, lifetimeMs: 100 });
    engine.update({ gameTimeMs: 50, frameDeltaMs: 16 });
    expect(engine.stats().activeGlyphs).toBe(1);
    engine.update({ gameTimeMs: 100, frameDeltaMs: 16 });
    expect(engine.stats().activeGlyphs).toBe(0);
  });

  it("update で活動中の文字をカメラに正対させる", () => {
    const { engine, created, camera } = setup();
    engine.spawnGlyph(baseGlyph);
    engine.update({ gameTimeMs: 0, frameDeltaMs: 16 });
    expect(created[0].quaternion.copied).toBe((camera as unknown as { quaternion: unknown }).quaternion);
  });

  it("同時上限に達すると追加の出現は破棄される（プール上限を守る）", () => {
    const { engine } = setup(1);
    engine.spawnGlyph(baseGlyph);
    engine.spawnGlyph(baseGlyph);
    expect(engine.stats().activeGlyphs).toBe(1);
  });
});

describe("createKineticTextEngine 一括文字層", () => {
  it("フレーズの文字数ぶんのメンバを一括層へ追加し、sync 完了で可視化する", () => {
    const { engine, fakeBatched } = setup();
    engine.spawnPhrase(basePhrase);
    expect(fakeBatched.members).toHaveLength(2);
    expect(fakeBatched.members.every((member) => member.visible === false)).toBe(true);
    fakeBatched.lastSyncCallback?.();
    expect(fakeBatched.members.every((member) => member.visible === true)).toBe(true);
    expect(engine.stats().activeBatchedMembers).toBe(2);
  });

  it("解放するとメンバを一括層から取り除く", () => {
    const { engine, fakeBatched } = setup();
    const handle = engine.spawnPhrase(basePhrase);
    handle.release();
    expect(fakeBatched.members).toHaveLength(0);
    expect(engine.stats().activeBatchedMembers).toBe(0);
  });

  it("同時メンバ上限を超えるフレーズは破棄される", () => {
    const { engine, fakeBatched } = setup(2, 2);
    engine.spawnPhrase({ ...basePhrase, text: "あいう" }); // 3文字 > 上限2
    expect(fakeBatched.members).toHaveLength(0);
    expect(engine.stats().activeBatchedMembers).toBe(0);
  });

  it("解放後に届いた sync 完了は無視する（古い世代）", () => {
    const { engine, fakeBatched } = setup();
    const handle = engine.spawnPhrase(basePhrase);
    const members = [...fakeBatched.members];
    handle.release();
    fakeBatched.lastSyncCallback?.();
    expect(members.every((member) => member.visible === false)).toBe(true);
  });

  it("表示残存を過ぎると update で一括フレーズを自動解放する", () => {
    const { engine } = setup();
    engine.spawnPhrase({ ...basePhrase, lifetimeMs: 100 });
    engine.update({ gameTimeMs: 50, frameDeltaMs: 16 });
    expect(engine.stats().activeBatchedMembers).toBe(2);
    engine.update({ gameTimeMs: 100, frameDeltaMs: 16 });
    expect(engine.stats().activeBatchedMembers).toBe(0);
  });
});
