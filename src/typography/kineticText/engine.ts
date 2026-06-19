// キネティック文字エンジン本体。フォント登録・暖め・単一文字層・一括文字層を結線し、
// 文字の配置・毎フレームの寿命処理（自動解放）・カメラ正対・破棄・診断統計を提供する。
// 描画器は持たず、外から注入した scene・camera へ描く。判定・得点・時刻の論理は持たない。

import { Text, BatchedText } from "troika-three-text";
import { warmUpFont } from "./warmup";
import { createGlyphPool, type GlyphLease } from "./glyphPool";
import { createBatchedTextLayer, type BatchedGroupHandle } from "./batchedTextLayer";
import type {
  EngineInitDeps,
  EngineStats,
  EngineUpdateArgs,
  GlyphHandle,
  GlyphSpawnRequest,
  KineticTextEngine,
  PhraseSpawnRequest,
} from "./types";

/** 文字生成関数の注入口（単体テストで擬似に差し替える）。既定は troika の実体を使う。 */
export interface KineticTextEngineInternals {
  createText?: () => Text;
  createBatchedText?: () => BatchedText;
  /** 距離場の事前生成（暖め）。既定は troika の preloadFont を包む warmUpFont。 */
  warmUp?: (fontUrl: string | null, characters: string) => Promise<void>;
  /** 単一文字の配置確定（sync）が現役で完了し可視化された瞬間に呼ぶ（初回表示遅延の計測に使う）。 */
  onGlyphShown?: () => void;
}

const NOOP_HANDLE: GlyphHandle = {
  setPosition(): void {},
  setRotation(): void {},
  setScale(): void {},
  setColor(): void {},
  setOpacity(): void {},
  release(): void {},
};

interface SingleEntry {
  lease: GlyphLease<Text>;
  text: Text;
  expireAtMs: number | undefined;
}

interface BatchedEntry {
  handle: BatchedGroupHandle;
  members: Text[];
  expireAtMs: number | undefined;
}

export function createKineticTextEngine(
  deps: EngineInitDeps,
  internals: KineticTextEngineInternals = {}
): KineticTextEngine {
  const { scene, camera, fonts, limits } = deps;
  const createText = internals.createText ?? ((): Text => new Text());
  const createBatchedText = internals.createBatchedText ?? ((): BatchedText => new BatchedText());
  const warmUp = internals.warmUp ?? warmUpFont;

  const pool = createGlyphPool<Text>({ maxConcurrent: limits.single, textFactory: createText });
  const batchedText = createBatchedText();
  scene.add(batchedText);
  const batchedLayer = createBatchedTextLayer({ maxMembers: limits.batched, batchedText });

  const singleEntries = new Set<SingleEntry>();
  const batchedEntries = new Set<BatchedEntry>();

  let lastGameTimeMs = 0;

  function applyTextProperties(
    text: Text,
    char: string,
    fontUrl: string,
    fontSize: number,
    color: number,
    opacity: number,
    x: number,
    y: number,
    z: number
  ): void {
    text.text = char;
    text.font = fontUrl;
    text.fontSize = fontSize;
    text.color = color;
    text.fillOpacity = opacity;
    text.anchorX = "center";
    text.anchorY = "middle";
    text.position.set(x, y, z);
    text.visible = false;
  }

  function releaseSingle(entry: SingleEntry): void {
    if (!singleEntries.has(entry)) {
      return;
    }
    singleEntries.delete(entry);
    entry.text.visible = false;
    scene.remove(entry.text);
    pool.release(entry.lease);
  }

  function spawnGlyph(request: GlyphSpawnRequest): GlyphHandle {
    const font = fonts.resolve(request.fontName);
    const lease = pool.acquire();
    if (!lease) {
      // 同時上限に達したため、この出現は破棄する（プールの上限を守る）。
      return NOOP_HANDLE;
    }
    const text = lease.unit;
    applyTextProperties(
      text,
      request.char,
      font.url,
      request.fontSize,
      request.color,
      request.opacity,
      request.position.x,
      request.position.y,
      request.position.z
    );
    scene.add(text);
    const entry: SingleEntry = {
      lease,
      text,
      expireAtMs:
        request.lifetimeMs !== undefined ? lastGameTimeMs + request.lifetimeMs : undefined,
    };
    singleEntries.add(entry);
    // 配置確定（sync）まで非表示。完了通知が現役のときだけ可視化する（古い完了通知は無視）。
    text.sync(() => {
      if (lease.isCurrent()) {
        text.visible = true;
        internals.onGlyphShown?.();
      }
    });
    return {
      setPosition: (x, y, z): void => {
        text.position.set(x, y, z);
      },
      setRotation: (x, y, z): void => {
        text.rotation.set(x, y, z);
      },
      setScale: (scale): void => {
        text.scale.setScalar(scale);
      },
      setColor: (color): void => {
        text.color = color;
      },
      setOpacity: (opacity): void => {
        text.fillOpacity = opacity;
      },
      release: (): void => releaseSingle(entry),
    };
  }

  function releaseBatched(entry: BatchedEntry): void {
    if (!batchedEntries.has(entry)) {
      return;
    }
    batchedEntries.delete(entry);
    for (const member of entry.members) {
      member.visible = false;
    }
    batchedLayer.removeGroup(entry.handle);
    for (const member of entry.members) {
      member.dispose();
    }
  }

  function spawnPhrase(request: PhraseSpawnRequest): GlyphHandle {
    const font = fonts.resolve(request.fontName);
    const chars = [...request.text];
    const members: Text[] = chars.map((char, index) => {
      const member = createText();
      applyTextProperties(
        member,
        char,
        font.url,
        request.fontSize,
        request.color,
        request.opacity,
        request.position.x + index * request.letterSpacing,
        request.position.y,
        request.position.z
      );
      return member;
    });
    const handle = batchedLayer.addGroup(members);
    if (!handle) {
      // 一括層の同時上限を超えるため破棄する。
      for (const member of members) {
        member.dispose();
      }
      return NOOP_HANDLE;
    }
    const entry: BatchedEntry = {
      handle,
      members,
      expireAtMs:
        request.lifetimeMs !== undefined ? lastGameTimeMs + request.lifetimeMs : undefined,
    };
    batchedEntries.add(entry);
    batchedLayer.sync(() => {
      if (handle.isCurrent()) {
        for (const member of members) {
          member.visible = true;
        }
      }
    });
    return {
      setPosition: (x, y, z): void => {
        chars.forEach((_char, index) => {
          members[index].position.set(x + index * request.letterSpacing, y, z);
        });
      },
      setRotation: (x, y, z): void => {
        for (const member of members) {
          member.rotation.set(x, y, z);
        }
      },
      setScale: (scale): void => {
        for (const member of members) {
          member.scale.setScalar(scale);
        }
      },
      setColor: (color): void => {
        for (const member of members) {
          member.color = color;
        }
      },
      setOpacity: (opacity): void => {
        for (const member of members) {
          member.fillOpacity = opacity;
        }
      },
      release: (): void => releaseBatched(entry),
    };
  }

  function update(args: EngineUpdateArgs): void {
    lastGameTimeMs = args.gameTimeMs;

    const expiredSingle: SingleEntry[] = [];
    for (const entry of singleEntries) {
      if (entry.expireAtMs !== undefined && args.gameTimeMs >= entry.expireAtMs) {
        expiredSingle.push(entry);
        continue;
      }
      // カメラ正対（文字の向きをカメラに合わせる）。
      entry.text.quaternion.copy(camera.quaternion);
    }
    for (const entry of expiredSingle) {
      releaseSingle(entry);
    }

    const expiredBatched: BatchedEntry[] = [];
    for (const entry of batchedEntries) {
      if (entry.expireAtMs !== undefined && args.gameTimeMs >= entry.expireAtMs) {
        expiredBatched.push(entry);
        continue;
      }
      for (const member of entry.members) {
        member.quaternion.copy(camera.quaternion);
      }
    }
    for (const entry of expiredBatched) {
      releaseBatched(entry);
    }
  }

  async function warmUpAll(characters: string): Promise<void> {
    const fontUrls = new Set(fonts.list().map((entry) => entry.url));
    await Promise.all([...fontUrls].map((url) => warmUp(url, characters)));
  }

  function dispose(): void {
    for (const entry of [...singleEntries]) {
      releaseSingle(entry);
    }
    for (const entry of [...batchedEntries]) {
      releaseBatched(entry);
    }
    pool.disposeAll((text) => text.dispose());
    batchedLayer.dispose((member) => member.dispose());
    scene.remove(batchedText);
  }

  function stats(): EngineStats {
    return {
      activeGlyphs: singleEntries.size,
      pooledGlyphs: pool.pooledCount(),
      activeBatchedMembers: batchedLayer.activeMemberCount(),
    };
  }

  return { warmUp: warmUpAll, spawnGlyph, spawnPhrase, update, dispose, stats };
}
