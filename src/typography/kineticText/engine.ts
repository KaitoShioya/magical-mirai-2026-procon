// キネティック文字エンジン本体。フォント登録・暖め・単一文字層・一括文字層を結線し、
// 文字の配置・毎フレームの寿命処理（自動解放）・向き方針の反映・破棄・診断統計を提供する。
// 描画器は持たず、外から注入した scene・camera へ描く。判定・得点・時刻の論理は持たない。

import { Text, BatchedText } from "troika-three-text";
import { Vector3 } from "three";
import { warmUpFont } from "./warmup";
import { createGlyphPool, type GlyphLease } from "./glyphPool";
import { createBatchedTextLayer, type BatchedGroupHandle } from "./batchedTextLayer";
import { createDeformingTextUnit, type DeformingTextUnit } from "./deformMaterial";
import {
  DEFAULT_ORIENTATION,
  facesCamera,
  isGroupBillboard,
  groupBillboardPosition,
  type OrientationPolicy,
} from "./orientation";
import type {
  DeformingTextHandle,
  DeformingTextSpawnRequest,
  EngineInitDeps,
  EngineStats,
  EngineUpdateArgs,
  GlyphHandle,
  GlyphSpawnRequest,
  KineticTextEngine,
  PhraseSpawnRequest,
} from "./types";

/**
 * 距離場（符号付き距離場）の解像度。troika の既定は64で、角・細線の再現は本値に依存し、
 * メモリ使用量と生成時間は本値の2乗で増える（troika Text.js の記述）。最大表示寸法で鮮鋭さを
 * 満たす最小の2の冪を採る方針で、現時点はエンジンが生む寸法で十分な64を採用する。最大寸法が
 * 増える演出（#32 など）が入る場合は、輪郭鮮鋭度の受け入れ診断（基準D）で再評価する。
 * 暖めと各文字の生成で同じ値を使い、アトラス解像度を揃える。
 */
export const SDF_GLYPH_SIZE = 64;

/** 文字生成関数の注入口（単体テストで擬似に差し替える）。既定は troika の実体を使う。 */
export interface KineticTextEngineInternals {
  createText?: () => Text;
  createBatchedText?: () => BatchedText;
  /** 距離場の事前生成（暖め）。既定は troika の preloadFont を包む warmUpFont。 */
  warmUp?: (fontUrl: string | null, characters: string, sdfGlyphSize?: number) => Promise<void>;
  /** 単一文字または変形テキストの配置確定（sync）が現役で完了し可視化された瞬間に呼ぶ（初回表示遅延の計測に使う）。 */
  onGlyphShown?: () => void;
  /** 変形テキスト部品の生成（単体テストで擬似に差し替える）。既定は createDeformingTextUnit。 */
  createDeformingTextUnit?: (
    kind: DeformingTextSpawnRequest["kind"],
    params: DeformingTextSpawnRequest["params"]
  ) => DeformingTextUnit;
}

const NOOP_HANDLE: GlyphHandle = {
  setPosition(): void {},
  setRotation(): void {},
  setScale(): void {},
  setColor(): void {},
  setOpacity(): void {},
  setOrientation(): void {},
  release(): void {},
};

interface SingleEntry {
  lease: GlyphLease<Text>;
  text: Text;
  expireAtMs: number | undefined;
  orientation: OrientationPolicy;
}

interface BatchedEntry {
  handle: BatchedGroupHandle;
  members: Text[];
  expireAtMs: number | undefined;
  orientation: OrientationPolicy;
  /** フレーズ先頭の基準位置（群正対の回転中心）。 */
  basePosition: Vector3;
  /** 各メンバの基準点相対の元オフセット（群正対の再計算に使う）。 */
  offsets: Vector3[];
}

interface DeformingEntry {
  text: Text;
  unit: DeformingTextUnit;
  expireAtMs: number | undefined;
  orientation: OrientationPolicy;
}

export function createKineticTextEngine(
  deps: EngineInitDeps,
  internals: KineticTextEngineInternals = {}
): KineticTextEngine {
  const { scene, camera, fonts, limits } = deps;
  const createText = internals.createText ?? ((): Text => new Text());
  const createBatchedText = internals.createBatchedText ?? ((): BatchedText => new BatchedText());
  const warmUp = internals.warmUp ?? warmUpFont;
  const makeDeformingTextUnit = internals.createDeformingTextUnit ?? createDeformingTextUnit;

  const pool = createGlyphPool<Text>({ maxConcurrent: limits.single, textFactory: createText });
  const batchedText = createBatchedText();
  scene.add(batchedText);
  const batchedLayer = createBatchedTextLayer({ maxMembers: limits.batched, batchedText });

  const singleEntries = new Set<SingleEntry>();
  const batchedEntries = new Set<BatchedEntry>();
  const deformingEntries = new Set<DeformingEntry>();

  // 群正対のローカル位置算出で再利用する（毎フレームの割り当てを避ける）。
  const reusablePosition = new Vector3();

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
    // 距離場の品質設定。暖めと同じ解像度で1回だけ設定し、毎フレーム変更しない
    // （sdfGlyphSize 変更は再配置確定を誘発するため）。
    text.sdfGlyphSize = SDF_GLYPH_SIZE;
    text.gpuAccelerateSDF = true;
    text.position.set(x, y, z);
    // 向きを初期化する。プール再利用で前回の姿勢（カメラ正対で入った四元数など）が残ると、
    // 固定向き（update で上書きしない）の文字が前利用者の回転を引き継ぐため、出現時に単位回転へ戻す。
    text.quaternion.identity();
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
      orientation: request.orientation ?? DEFAULT_ORIENTATION,
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
      setOrientation: (policy): void => {
        entry.orientation = policy;
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
    const offsets: Vector3[] = chars.map((_char, index) => new Vector3(index * request.letterSpacing, 0, 0));
    const members: Text[] = chars.map((char, index) => {
      const member = createText();
      applyTextProperties(
        member,
        char,
        font.url,
        request.fontSize,
        request.color,
        request.opacity,
        request.position.x + offsets[index].x,
        request.position.y + offsets[index].y,
        request.position.z + offsets[index].z
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
      orientation: request.orientation ?? DEFAULT_ORIENTATION,
      basePosition: new Vector3(request.position.x, request.position.y, request.position.z),
      offsets,
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
        entry.basePosition.set(x, y, z);
        chars.forEach((_char, index) => {
          members[index].position.set(x + offsets[index].x, y + offsets[index].y, z + offsets[index].z);
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
      setOrientation: (policy): void => {
        entry.orientation = policy;
      },
      release: (): void => releaseBatched(entry),
    };
  }

  function releaseDeforming(entry: DeformingEntry): void {
    if (!deformingEntries.has(entry)) {
      // 二度目以降の解放では何もしない（冪等）。
      return;
    }
    deformingEntries.delete(entry);
    entry.text.visible = false;
    scene.remove(entry.text);
    // 解放は部品の dispose に集約する。部品はジオメトリと基材の両方を破棄し（基材は troika が被せた文字マテリアルと
    // 取り込み層の破棄へ連鎖）、冪等である。
    entry.unit.dispose();
  }

  function spawnDeformingText(request: DeformingTextSpawnRequest): DeformingTextHandle {
    const font = fonts.resolve(request.fontName);
    // 変形を仕込んだ Text の部品を作る（マテリアルは部品が基材＋取り込み層で構成済み）。
    const unit = makeDeformingTextUnit(request.kind, request.params);
    const text = unit.text;
    // フレーズ全体を1つの Text にし、変形単位を文字ローカル原点に中央寄せする（uDeformOrigin 既定 (0,0) と整合）。
    text.text = request.text;
    text.font = font.url;
    text.fontSize = request.fontSize;
    text.color = request.color;
    text.fillOpacity = request.opacity;
    text.anchorX = "center";
    text.anchorY = "middle";
    if (request.letterSpacing !== undefined) {
      text.letterSpacing = request.letterSpacing;
    }
    text.position.set(request.position.x, request.position.y, request.position.z);
    text.visible = false;
    // 頂点変形はGPU側で行われCPUの境界に反映されないため、視錐台カリングを無効にして誤った描画除外を防ぐ。
    text.frustumCulled = false;
    scene.add(text);
    const entry: DeformingEntry = {
      text,
      unit,
      expireAtMs:
        request.lifetimeMs !== undefined ? lastGameTimeMs + request.lifetimeMs : undefined,
      // 変形テキストは単一の Text で文字ごとのオフセットを持たないため、群正対は意味を持たない。
      // 向きは「カメラ正対」か「固定」のいずれかで、既定はカメラ正対（従来挙動）。
      orientation: DEFAULT_ORIENTATION,
    };
    deformingEntries.add(entry);
    text.sync(() => {
      // 解放済み（古い完了通知）でなければ可視化し、初回表示遅延の計測へ通知する。
      if (deformingEntries.has(entry)) {
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
      setOrientation: (policy): void => {
        entry.orientation = policy;
      },
      setDeformParams: (params): void => {
        unit.setParams(params);
      },
      release: (): void => releaseDeforming(entry),
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
      // 向き方針がカメラ正対のときだけ向きを合わせる。固定は上書きしない。
      if (facesCamera(entry.orientation)) {
        entry.text.quaternion.copy(camera.quaternion);
      }
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
      if (!facesCamera(entry.orientation)) {
        continue;
      }
      const group = isGroupBillboard(entry.orientation);
      for (let index = 0; index < entry.members.length; index += 1) {
        const member = entry.members[index];
        member.quaternion.copy(camera.quaternion);
        if (group) {
          // 群正対: 各メンバを基準点まわりにカメラ四元数で回した位置へ置く。
          const position = groupBillboardPosition(
            entry.basePosition,
            entry.offsets[index],
            camera.quaternion,
            reusablePosition
          );
          member.position.set(position.x, position.y, position.z);
        }
      }
    }
    for (const entry of expiredBatched) {
      releaseBatched(entry);
    }

    const expiredDeforming: DeformingEntry[] = [];
    for (const entry of deformingEntries) {
      if (entry.expireAtMs !== undefined && args.gameTimeMs >= entry.expireAtMs) {
        expiredDeforming.push(entry);
        continue;
      }
      // 向き方針がカメラ正対のときだけ向きを合わせる（固定は上書きしない）。
      // 変形の時間進行（楽曲同期のためゲーム時刻を秒に直して渡す）は向きと独立に常時行う。
      if (facesCamera(entry.orientation)) {
        entry.text.quaternion.copy(camera.quaternion);
      }
      entry.unit.setTimeSec(args.gameTimeMs / 1000);
    }
    for (const entry of expiredDeforming) {
      releaseDeforming(entry);
    }
  }

  async function warmUpAll(characters: string): Promise<void> {
    const fontUrls = new Set(fonts.list().map((entry) => entry.url));
    await Promise.all([...fontUrls].map((url) => warmUp(url, characters, SDF_GLYPH_SIZE)));
  }

  function dispose(): void {
    for (const entry of [...singleEntries]) {
      releaseSingle(entry);
    }
    for (const entry of [...batchedEntries]) {
      releaseBatched(entry);
    }
    for (const entry of [...deformingEntries]) {
      releaseDeforming(entry);
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
      activeDeformingTexts: deformingEntries.size,
    };
  }

  return { warmUp: warmUpAll, spawnGlyph, spawnPhrase, spawnDeformingText, update, dispose, stats };
}
