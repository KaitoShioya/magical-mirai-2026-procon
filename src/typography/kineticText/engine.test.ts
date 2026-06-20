import { describe, it, expect } from "vitest";
import type { Text, BatchedText } from "troika-three-text";
import { Quaternion, Vector3, Euler, type Camera, type Scene } from "three";
import { createKineticTextEngine, SDF_GLYPH_SIZE } from "./engine";
import { createFontRegistry } from "./fontRegistry";
import { groupBillboardPosition } from "./orientation";
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
  sdfGlyphSize: number | null;
  gpuAccelerateSDF: boolean;
  position: { set(x: number, y: number, z: number): void; coords: { x: number; y: number; z: number } | null };
  rotation: { set(x: number, y: number, z: number): void };
  scale: { setScalar(s: number): void };
  quaternion: { copy(q: unknown): void; identity(): unknown; copied: unknown; identityReset: boolean };
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
    sdfGlyphSize: null,
    gpuAccelerateSDF: false,
    position: {
      coords: null,
      set(x: number, y: number, z: number): void {
        this.coords = { x, y, z };
      },
    },
    rotation: { set(): void {} },
    scale: { setScalar(): void {} },
    quaternion: {
      copied: null as unknown,
      identityReset: false,
      copy(q: unknown): void {
        this.copied = q;
        this.identityReset = false;
      },
      identity(): unknown {
        this.copied = null;
        this.identityReset = true;
        return this;
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

function setup(single = 2, batched = 4, cameraQuaternion?: unknown) {
  const created: FakeText[] = [];
  const fonts: FontRegistry = createFontRegistry();
  fonts.register({
    name: "main",
    url: "/fonts/main.woff",
    weight: 700,
    credit: {
      fontName: "見本",
      author: "作者",
      sourceLabel: "配布元",
      sourceUrl: "https://example.com/font",
      license: "SIL Open Font License",
      licenseFileUrl: "/fonts/OFL.txt",
    },
  });
  const camera = { quaternion: cameraQuaternion ?? { tag: "camera" } } as unknown as Camera;
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

describe("createKineticTextEngine 向き方針", () => {
  it("固定の向き方針は update でカメラ正対しない（四元数を上書きしない）", () => {
    const { engine, created } = setup();
    engine.spawnGlyph({ ...baseGlyph, orientation: { mode: "fixed" } });
    engine.update({ gameTimeMs: 0, frameDeltaMs: 16 });
    expect(created[0].quaternion.copied).toBe(null);
  });

  it("出現時に四元数を初期化し、固定向きがプール再利用で前回の姿勢を引き継がない", () => {
    const { engine, created, camera } = setup(1);
    const cameraQuaternion = (camera as unknown as { quaternion: unknown }).quaternion;
    // 1回目: カメラ正対の文字。update でカメラ四元数が入る。
    const first = engine.spawnGlyph(baseGlyph);
    engine.update({ gameTimeMs: 0, frameDeltaMs: 16 });
    expect(created[0].quaternion.copied).toBe(cameraQuaternion);
    first.release();
    // 2回目: 同じスロットを固定向きで再利用。出現時に四元数が初期化される。
    engine.spawnGlyph({ ...baseGlyph, orientation: { mode: "fixed" } });
    expect(created[0].quaternion.identityReset).toBe(true);
    expect(created[0].quaternion.copied).toBe(null);
    // 固定向きは update でも上書きしないため、前回のカメラ姿勢を引き継がない。
    engine.update({ gameTimeMs: 16, frameDeltaMs: 16 });
    expect(created[0].quaternion.copied).toBe(null);
  });

  it("setOrientation で固定へ変えると以後カメラ正対しない", () => {
    const { engine, created, camera } = setup();
    const handle = engine.spawnGlyph(baseGlyph);
    engine.update({ gameTimeMs: 0, frameDeltaMs: 16 });
    expect(created[0].quaternion.copied).toBe(
      (camera as unknown as { quaternion: unknown }).quaternion
    );
    // 上書きされたか確認するため番兵を置き、固定へ変えた後の update で変化しないことを見る。
    created[0].quaternion.copied = "sentinel";
    handle.setOrientation({ mode: "fixed" });
    engine.update({ gameTimeMs: 16, frameDeltaMs: 16 });
    expect(created[0].quaternion.copied).toBe("sentinel");
  });

  it("群正対フレーズは各メンバを基準点まわりにカメラ正対配置する", () => {
    const cameraQuaternion = new Quaternion().setFromEuler(new Euler(0, Math.PI / 2, 0));
    const { engine, fakeBatched } = setup(2, 4, cameraQuaternion);
    engine.spawnPhrase({
      ...basePhrase,
      position: { x: 0, y: 4, z: 0 },
      letterSpacing: 1,
      orientation: { mode: "faceCamera", granularity: "asGroup" },
    });
    engine.update({ gameTimeMs: 0, frameDeltaMs: 16 });
    // 2文字目（添字1）の元オフセットは (1,0,0)。基準点 (0,4,0) まわりに群正対する。
    const expected = groupBillboardPosition(
      new Vector3(0, 4, 0),
      new Vector3(1, 0, 0),
      cameraQuaternion
    );
    const coords = fakeBatched.members[1].position.coords;
    expect(coords).not.toBe(null);
    expect(coords?.x).toBeCloseTo(expected.x, 5);
    expect(coords?.y).toBeCloseTo(expected.y, 5);
    expect(coords?.z).toBeCloseTo(expected.z, 5);
  });

  it("文字ごと正対のフレーズは update でメンバ位置を動かさない", () => {
    const { engine, fakeBatched } = setup();
    engine.spawnPhrase({ ...basePhrase, position: { x: 0, y: 0, z: 0 }, letterSpacing: 1 });
    // 出現時に2文字目は (1,0,0) へ置かれる。
    engine.update({ gameTimeMs: 0, frameDeltaMs: 16 });
    const coords = fakeBatched.members[1].position.coords;
    expect(coords?.x).toBeCloseTo(1, 5);
    expect(coords?.y).toBeCloseTo(0, 5);
    expect(coords?.z).toBeCloseTo(0, 5);
  });
});

describe("createKineticTextEngine 距離場の品質設定", () => {
  it("文字生成時に sdfGlyphSize と gpuAccelerateSDF を設定する", () => {
    const { engine, created } = setup();
    engine.spawnGlyph(baseGlyph);
    expect(created[0].sdfGlyphSize).toBe(SDF_GLYPH_SIZE);
    expect(created[0].gpuAccelerateSDF).toBe(true);
  });
});
