import { describe, it, expect } from "vitest";
import type { Text, BatchedText } from "troika-three-text";
import type { Camera, Scene } from "three";
import { createKineticTextEngine } from "./engine";
import { createFontRegistry } from "./fontRegistry";
import type { DeformingTextUnit } from "./deformMaterial";
import type { FontRegistry, DeformingTextSpawnRequest } from "./types";

// 擬似の Text。破棄・視錐台カリング設定・カメラ正対・sync を記録する。
interface FakeText {
  text: string;
  font: string | null;
  fontSize: number;
  color: number;
  fillOpacity: number;
  letterSpacing: number;
  anchorX: string;
  anchorY: string;
  visible: boolean;
  frustumCulled: boolean;
  position: { set(x: number, y: number, z: number): void };
  rotation: { set(x: number, y: number, z: number): void };
  scale: { setScalar(s: number): void };
  quaternion: { copy(q: unknown): void; copied: unknown };
  lastSyncCallback: (() => void) | null;
  disposeCount: number;
  sync(cb?: () => void): void;
  dispose(): void;
}

function makeFakeText(): FakeText {
  return {
    text: "",
    font: null,
    fontSize: 0,
    color: 0,
    fillOpacity: 1,
    letterSpacing: 0,
    anchorX: "",
    anchorY: "",
    visible: true,
    frustumCulled: true,
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
    disposeCount: 0,
    sync(cb?: () => void): void {
      this.lastSyncCallback = cb ?? null;
    },
    dispose(): void {
      this.disposeCount += 1;
    },
  };
}

// 擬似の変形部品。text を持ち、setTimeSec の引数と dispose 回数を記録する。
interface FakeUnit extends DeformingTextUnit {
  fake: FakeText;
  lastTimeSec: number;
  disposeCount: number;
}

function setup() {
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
  const camera = { quaternion: { tag: "camera" } } as unknown as Camera;
  const sceneOps: string[] = [];
  const scene = {
    add(): void {
      sceneOps.push("add");
    },
    remove(): void {
      sceneOps.push("remove");
    },
  } as unknown as Scene;
  const units: FakeUnit[] = [];
  const engine = createKineticTextEngine(
    { scene, camera, fonts, limits: { single: 8, batched: 8 } },
    {
      createText: (): Text => makeFakeText() as unknown as Text,
      // 変形テストでは一括層を使わないが、エンジンは生成時に一括層を作るため最小の擬似を返す。
      createBatchedText: (): BatchedText =>
        ({
          addText(): void {},
          removeText(): void {},
          sync(): void {},
          dispose(): void {},
        }) as unknown as BatchedText,
      warmUp: async (): Promise<void> => {},
      createDeformingTextUnit: (): DeformingTextUnit => {
        const fake = makeFakeText();
        const unit: FakeUnit = {
          fake,
          lastTimeSec: -1,
          disposeCount: 0,
          text: fake as unknown as Text,
          setTimeSec(sec: number): void {
            unit.lastTimeSec = sec;
          },
          setParams(): void {},
          // 実装と同じく、部品の解放でジオメトリ（text）と部品自身を破棄する。
          dispose(): void {
            unit.disposeCount += 1;
            fake.dispose();
          },
        };
        units.push(unit);
        return unit;
      },
    }
  );
  return { engine, units, sceneOps, camera };
}

const baseRequest: DeformingTextSpawnRequest = {
  text: "ことば",
  fontName: "main",
  position: { x: 1, y: 2, z: 3 },
  fontSize: 3,
  color: 0xffffff,
  opacity: 1,
  kind: "swirl",
  params: { strength: 0.5, speed: 2, spatialFreq: 0.3, phaseOffset: 0 },
};

describe("createKineticTextEngine 変形テキスト層", () => {
  it("変形部品の単一 Text に内容を設定する（1個・フレーズ全体・中央寄せ）", () => {
    const { engine, units } = setup();
    engine.spawnDeformingText(baseRequest);
    expect(units).toHaveLength(1);
    expect(units[0].fake.text).toBe("ことば");
    expect(units[0].fake.anchorX).toBe("center");
    expect(units[0].fake.anchorY).toBe("middle");
  });

  it("視錐台カリングを無効にし、配置確定（sync）を行う", () => {
    const { engine, units } = setup();
    engine.spawnDeformingText(baseRequest);
    expect(units[0].fake.frustumCulled).toBe(false);
    expect(units[0].fake.lastSyncCallback).not.toBeNull();
  });

  it("sync 完了が現役なら可視化する", () => {
    const { engine, units } = setup();
    engine.spawnDeformingText(baseRequest);
    const fake = units[0].fake;
    expect(fake.visible).toBe(false);
    fake.lastSyncCallback?.();
    expect(fake.visible).toBe(true);
  });

  it("解放後に届いた sync 完了は無視する（古い完了通知で復活しない）", () => {
    const { engine, units } = setup();
    const handle = engine.spawnDeformingText(baseRequest);
    const fake = units[0].fake;
    handle.release();
    fake.lastSyncCallback?.();
    expect(fake.visible).toBe(false);
  });

  it("update で変形の時間へ gameTimeMs を秒に直して渡す", () => {
    const { engine, units } = setup();
    engine.spawnDeformingText(baseRequest);
    engine.update({ gameTimeMs: 2500, frameDeltaMs: 16 });
    expect(units[0].lastTimeSec).toBe(2.5);
  });

  it("update で活動中の変形テキストをカメラに正対させる", () => {
    const { engine, units, camera } = setup();
    engine.spawnDeformingText(baseRequest);
    engine.update({ gameTimeMs: 0, frameDeltaMs: 16 });
    expect(units[0].fake.quaternion.copied).toBe(
      (camera as unknown as { quaternion: unknown }).quaternion
    );
  });

  it("表示残存を過ぎると update で自動解放する", () => {
    const { engine } = setup();
    engine.spawnDeformingText({ ...baseRequest, lifetimeMs: 100 });
    engine.update({ gameTimeMs: 50, frameDeltaMs: 16 });
    expect(engine.stats().activeDeformingTexts).toBe(1);
    engine.update({ gameTimeMs: 100, frameDeltaMs: 16 });
    expect(engine.stats().activeDeformingTexts).toBe(0);
  });

  it("release を二度呼んでも、シーン除去・Text破棄・部品破棄はそれぞれ一度だけ行う（冪等）", () => {
    const { engine, units, sceneOps } = setup();
    const handle = engine.spawnDeformingText(baseRequest);
    handle.release();
    handle.release();
    expect(units[0].fake.disposeCount).toBe(1);
    expect(units[0].disposeCount).toBe(1);
    expect(sceneOps.filter((op) => op === "remove")).toHaveLength(1);
    expect(engine.stats().activeDeformingTexts).toBe(0);
  });
});
