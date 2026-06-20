// キネティック文字エンジン本体。フォント登録・暖め・単一文字層・一括文字層を結線し、
// 文字の配置・毎フレームの寿命処理（自動解放）・カメラ正対・破棄・診断統計を提供する。
// 読ませる役の可読性処理（縁取り・影・発光抑制・最小表示寸法・未収録文字代替・フォント読込失敗代替）を含む。
// 描画器は持たず、外から注入した scene・camera へ描く。判定・得点・時刻の論理は持たない。

import { Text, BatchedText } from "troika-three-text";
import { warmUpFont } from "./warmup";
import { createGlyphPool, type GlyphLease } from "./glyphPool";
import { createBatchedTextLayer, type BatchedGroupHandle } from "./batchedTextLayer";
import { minWorldFontSize, resolveReadabilityStyle, clampLuminanceSrgbHex } from "./readability";
import {
  applyReadableTextStyle,
  createReadabilityBacking,
  detectReadabilityCapability,
  type ReadabilityBackingObject,
  type ReadableTextTarget,
} from "./readabilityRenderer";
import type {
  EngineInitDeps,
  EngineStats,
  EngineUpdateArgs,
  GlyphHandle,
  GlyphSpawnRequest,
  KineticTextEngine,
  PhraseSpawnRequest,
  ReadabilityCapability,
  ReadabilityOptions,
  ResolvedReadabilityStyle,
} from "./types";

// ブルーム閾値の既定値。正典は src/rendering/constants.ts の BLOOM_THRESHOLD。
// 依存の向きを本体から rendering へ流さないため、ここに既定値を持ち、診断と本編は deps で渡す。
const DEFAULT_BLOOM_THRESHOLD = 0.5;
// 最小表示寸法の下限を満たすために fontSize を作り直す（再 sync する）しきい値（割合）。
// 採用理由を先に述べる。troika の配置確定（sync）は重いため、毎フレーム作り直すと性能を損なう。
// 目標寸法と現在寸法の差がこの割合を超えたときだけ作り直し、再 sync の回数を抑える。
const FONT_SIZE_RESYNC_RATIO = 0.02;

/** 文字生成関数の注入口（単体テストで擬似に差し替える）。既定は troika の実体を使う。 */
export interface KineticTextEngineInternals {
  createText?: () => Text;
  createBatchedText?: () => BatchedText;
  /** 距離場の事前生成（暖め）。既定は troika の preloadFont を包む warmUpFont。 */
  warmUp?: (fontUrl: string | null, characters: string) => Promise<void>;
  /** 単一文字の配置確定（sync）が現役で完了し可視化された瞬間に呼ぶ（初回表示遅延の計測に使う）。 */
  onGlyphShown?: () => void;
  /**
   * フォントの取得可否を確かめる（フォント読込失敗の検出に使う）。既定はブラウザの取得（fetch）で確認し、
   * 取得手段が無い環境では取得可とみなす。単体テストで擬似に差し替える。
   */
  checkFontAvailable?: (url: string) => Promise<boolean>;
  /** 可読性に使う troika 機能の可否を上書きする（単体テストで固定する）。既定は実体から判定する。 */
  readabilityCapability?: ReadabilityCapability;
}

const NOOP_HANDLE: GlyphHandle = {
  setPosition(): void {},
  setRotation(): void {},
  setScale(): void {},
  setColor(): void {},
  setOpacity(): void {},
  applyReadability(): void {},
  release(): void {},
};

interface SingleEntry {
  lease: GlyphLease<Text>;
  text: Text;
  expireAtMs: number | undefined;
  /** 読ませる役のときの可読性属性（演出役のときは undefined）。 */
  readability: ReadabilityOptions | undefined;
  /** 読ませる役のときの確定可読性指定（setColor の発光抑制と setOpacity の縁取り・影の追従に使う）。 */
  readabilityStyle: ResolvedReadabilityStyle | undefined;
  /** 出現要求の基準 fontSize（最小寸法の下限と比べる元の値）。 */
  baseFontSize: number;
  /** 可読性下地（無いときは null）。 */
  backing: ReadabilityBackingObject | null;
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
  const bloomThreshold = deps.bloomThreshold ?? DEFAULT_BLOOM_THRESHOLD;
  const checkFontAvailable =
    internals.checkFontAvailable ??
    (async (url: string): Promise<boolean> => {
      if (typeof fetch !== "function") {
        return true;
      }
      try {
        const response = await fetch(url, { method: "HEAD" });
        return response.ok;
      } catch {
        return false;
      }
    });

  const pool = createGlyphPool<Text>({ maxConcurrent: limits.single, textFactory: createText });
  const batchedText = createBatchedText();
  scene.add(batchedText);
  const batchedLayer = createBatchedTextLayer({ maxMembers: limits.batched, batchedText });

  const singleEntries = new Set<SingleEntry>();
  const batchedEntries = new Set<BatchedEntry>();

  // 可読性に使う troika 機能の可否。注入があればそれを使う。無ければ、読ませる役の初回利用時に使い捨ての
  // Text から判定して記憶する（演出役だけを使うときは判定用の Text を作らない）。
  let cachedCapability: ReadabilityCapability | null = internals.readabilityCapability ?? null;
  function getCapability(): ReadabilityCapability {
    if (cachedCapability) {
      return cachedCapability;
    }
    const probe = createText();
    cachedCapability = detectReadabilityCapability(probe as unknown as object);
    probe.dispose();
    return cachedCapability;
  }

  // 暖めで渡された文字集合（主フォントの収録範囲とみなす）。
  const warmedChars = new Set<string>();
  // 取得に失敗したフォントの論理名。
  const failedFonts = new Set<string>();
  let fallbackFontUses = 0;
  let fontLoadFailures = 0;

  let lastGameTimeMs = 0;

  function distanceFromCamera(x: number, y: number, z: number): number {
    const p = camera.position;
    const dx = p.x - x;
    const dy = p.y - y;
    const dz = p.z - z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  // 透視投影カメラの縦視野角（度）。透視投影でないときは null（最小寸法の下限を適用しない）。
  function perspectiveFovYDegrees(): number | null {
    const c = camera as unknown as { isPerspectiveCamera?: boolean; fov?: number };
    return c.isPerspectiveCamera === true && typeof c.fov === "number" ? c.fov : null;
  }

  // 最小表示寸法を満たす最小ワールド寸法を求める。デバイス画素高の注入か透視投影が無いときは0（下限なし）。
  function readableFontSizeFloor(
    readability: ReadabilityOptions,
    x: number,
    y: number,
    z: number,
    worldScale: number
  ): number {
    const provider = deps.viewportPixelHeight;
    const fovYDegrees = perspectiveFovYDegrees();
    if (!provider || fovYDegrees === null) {
      return 0;
    }
    const viewportPixelHeight = provider();
    if (viewportPixelHeight <= 0) {
      return 0;
    }
    return minWorldFontSize({
      minPixelHeight: readability.minPixelHeight,
      distance: distanceFromCamera(x, y, z),
      fovYDegrees,
      viewportPixelHeight,
      worldScale,
    });
  }

  // 未収録文字とフォント読込失敗の振り分け。収録の無い文字や失敗フォントの文字は代替フォントへ回す。
  function chooseFont(fontName: string, char: string): { url: string | null; fallbackUsed: boolean } {
    const entry = fonts.resolve(fontName);
    // 暖めが行われていない（集合が空）ときは、主フォントが全文字を収録するとみなす（誤った全件回送を避ける）。
    const covered = warmedChars.size === 0 || warmedChars.has(char);
    const failed = failedFonts.has(entry.name);
    if (covered && !failed) {
      return { url: entry.url, fallbackUsed: false };
    }
    fallbackFontUses += 1;
    if (entry.fallbackName) {
      try {
        const fallback = fonts.resolve(entry.fallbackName);
        // 代替フォント自身が取得に失敗しているときは、その URL を返さず troika 既定フォントへ回す。
        if (!failedFonts.has(fallback.name)) {
          return { url: fallback.url, fallbackUsed: true };
        }
      } catch {
        // 代替フォントが未登録のときは troika 既定フォントへ回す。
      }
    }
    return { url: null, fallbackUsed: true };
  }

  function applyTextProperties(
    text: Text,
    char: string,
    fontUrl: string | null,
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
    // 縁取りと影を既定値へ戻す。理由を先に述べる。単一文字層はプールで Text を再利用するため、可読性付きの
    // 文字を出したあと同じ Text を可読性なしの文字へ再利用すると、前の縁取りと影が残る。基準設定の時点で
    // 既定値へ戻し、読ませる役のときはこの後 applyReadableTextStyle が上書きする。
    text.strokeWidth = 0;
    text.strokeOpacity = 1;
    text.outlineWidth = 0;
    text.outlineOpacity = 1;
    text.outlineOffsetX = 0;
    text.outlineOffsetY = 0;
    text.outlineBlur = 0;
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
    if (entry.backing) {
      scene.remove(entry.backing.object);
      entry.backing.dispose();
      entry.backing = null;
    }
    pool.release(entry.lease);
  }

  // 単一文字を1つ出す内部処理。読ませる役のときは可読性処理を適用する。上限超過時は null。
  function createSingleGlyph(params: {
    char: string;
    fontName: string;
    fontSize: number;
    color: number;
    opacity: number;
    x: number;
    y: number;
    z: number;
    lifetimeMs?: number;
    readability?: ReadabilityOptions;
  }): SingleEntry | null {
    const chosen = chooseFont(params.fontName, params.char);
    const lease = pool.acquire();
    if (!lease) {
      return null;
    }
    const text = lease.unit;

    // 最小表示寸法の下限（読ませる役のみ、デバイス画素高が注入されているとき）。出現時は累積拡大を1とみなす。
    let fontSize = params.fontSize;
    if (params.readability) {
      fontSize = Math.max(
        fontSize,
        readableFontSizeFloor(params.readability, params.x, params.y, params.z, 1)
      );
    }

    applyTextProperties(
      text,
      params.char,
      chosen.url,
      fontSize,
      params.color,
      params.opacity,
      params.x,
      params.y,
      params.z
    );

    let backing: ReadabilityBackingObject | null = null;
    let readabilityStyle: ResolvedReadabilityStyle | undefined;
    if (params.readability) {
      const style = resolveReadabilityStyle({
        options: params.readability,
        baseFillColor: params.color,
        capability: getCapability(),
        bloomThreshold,
        fallbackFontUsed: chosen.fallbackUsed,
        needsBacking: deps.readabilityNeedsBacking ?? false,
      });
      readabilityStyle = style;
      applyReadableTextStyle(text as unknown as ReadableTextTarget, style);
      if (style.backing !== "none") {
        backing = createReadabilityBacking(style, params.char, chosen.url, { createText });
        if (backing) {
          backing.setTransform({ x: params.x, y: params.y, z: params.z, fontSize });
          scene.add(backing.object);
          backing.sync();
        }
      }
    }

    scene.add(text);
    const entry: SingleEntry = {
      lease,
      text,
      expireAtMs:
        params.lifetimeMs !== undefined ? lastGameTimeMs + params.lifetimeMs : undefined,
      readability: params.readability,
      readabilityStyle,
      baseFontSize: params.fontSize,
      backing,
    };
    // 読ませる役は、縁取り・影・下地の不透明度にも実効不透明度を掛ける（出現時の opacity を反映する）。
    if (readabilityStyle) {
      setEntryOpacity(entry, params.opacity);
    }
    singleEntries.add(entry);
    // 配置確定（sync）まで非表示。完了通知が現役のときだけ可視化する（古い完了通知は無視）。
    text.sync(() => {
      if (lease.isCurrent()) {
        text.visible = true;
        internals.onGlyphShown?.();
      }
    });
    return entry;
  }

  // 単一エントリへ最後段の可読性補正を適用し直す（#131 が合成の最後段で呼ぶ）。寸法は変えない。
  // 可読性下地の有無と形は出現時に確定する（下地の要否は需要設定 readabilityNeedsBacking と代替フォント使用で
  // 決まり、その文字の生存中は変わらない）。よって本処理は文字本体の塗り・縁取り・影と発光上限の更新に限る。
  function reapplyReadability(entry: SingleEntry, style: ResolvedReadabilityStyle): void {
    entry.readabilityStyle = style;
    applyReadableTextStyle(entry.text as unknown as ReadableTextTarget, style);
    entry.text.sync();
  }

  // エントリへ色を設定する。読ませる役のときは塗りを発光上限以下へ収め、塗りがブルームでにじむのを防ぐ
  // 不変条件（明るい成分はブルーム閾値以下）を、生色での上書きでも保つ。
  function setEntryColor(entry: SingleEntry, color: number): void {
    const style = entry.readabilityStyle;
    if (style) {
      entry.text.color = clampLuminanceSrgbHex(color, style.maxBrightLuminance);
    } else {
      entry.text.color = color;
    }
  }

  // エントリの大きさを設定する。可読性下地があるときは下地も同じ倍率にする（下地が文字に追従するため）。
  // 下地の setScale は形ごとに寸法の作り方が異なる（単位背面の暗い面は基準寸法と倍率の積で作り直す）。
  function setEntryScale(entry: SingleEntry, scale: number): void {
    entry.text.scale.setScalar(scale);
    if (entry.backing) {
      entry.backing.setScale(scale);
    }
  }

  // エントリの不透明度を設定する。読ませる役のときは、縁取り・影・下地の不透明度にも同じ実効不透明度を掛ける。
  // 理由を先に述べる。塗りだけを薄くすると、フェードアウト時に暗い縁取り・影・下地が残って黒い形だけが見える。
  // 読ませる役は単位ごとにフェード制御される前提のため、可読性の各要素を同じ実効不透明度で薄くする。
  function setEntryOpacity(entry: SingleEntry, opacity: number): void {
    entry.text.fillOpacity = opacity;
    const style = entry.readabilityStyle;
    if (style) {
      if (style.borderVia === "stroke") {
        entry.text.strokeOpacity = style.borderOpacity * opacity;
        if (style.hasShadow) {
          entry.text.outlineOpacity = style.shadowOpacity * opacity;
        }
      } else {
        entry.text.outlineOpacity = style.borderOpacity * opacity;
      }
    }
    if (entry.backing) {
      entry.backing.setOpacity(opacity);
    }
  }

  // エントリの回転を設定する。可読性下地があるときは下地も同じ回転にする（下地が文字に追従するため）。
  // 通常は update のカメラ正対で上書きされるが、API の契約（下地は単位追従）に合わせて回す。
  function setEntryRotation(entry: SingleEntry, x: number, y: number, z: number): void {
    entry.text.rotation.set(x, y, z);
    if (entry.backing) {
      entry.backing.object.rotation.set(x, y, z);
    }
  }

  function singleHandle(entry: SingleEntry): GlyphHandle {
    const { text } = entry;
    return {
      setPosition: (x, y, z): void => {
        text.position.set(x, y, z);
        if (entry.backing) {
          entry.backing.setTransform({ x, y, z, fontSize: text.fontSize });
        }
      },
      setRotation: (x, y, z): void => setEntryRotation(entry, x, y, z),
      setScale: (scale): void => setEntryScale(entry, scale),
      setColor: (color): void => setEntryColor(entry, color),
      setOpacity: (opacity): void => setEntryOpacity(entry, opacity),
      applyReadability: (style): void => reapplyReadability(entry, style),
      release: (): void => releaseSingle(entry),
    };
  }

  function spawnGlyph(request: GlyphSpawnRequest): GlyphHandle {
    const entry = createSingleGlyph({
      char: request.char,
      fontName: request.fontName,
      fontSize: request.fontSize,
      color: request.color,
      opacity: request.opacity,
      x: request.position.x,
      y: request.position.y,
      z: request.position.z,
      lifetimeMs: request.lifetimeMs,
      readability: request.readability,
    });
    if (!entry) {
      // 同時上限に達したため、この出現は破棄する（プールの上限を守る）。
      return NOOP_HANDLE;
    }
    return singleHandle(entry);
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

  // 読ませる役のフレーズ。各文字を単一文字層で描く（一括描画は各文字ごとの可読性設定を持たないため）。
  function spawnReadablePhrase(request: PhraseSpawnRequest): GlyphHandle {
    const chars = [...request.text];
    const entries: SingleEntry[] = [];
    for (let index = 0; index < chars.length; index += 1) {
      const entry = createSingleGlyph({
        char: chars[index],
        fontName: request.fontName,
        fontSize: request.fontSize,
        color: request.color,
        opacity: request.opacity,
        x: request.position.x + index * request.letterSpacing,
        y: request.position.y,
        z: request.position.z,
        lifetimeMs: request.lifetimeMs,
        readability: request.readability,
      });
      if (!entry) {
        // 単一文字層の同時上限を超えたため、確保済みを解放して破棄する。
        for (const acquired of entries) {
          releaseSingle(acquired);
        }
        return NOOP_HANDLE;
      }
      entries.push(entry);
    }
    return {
      setPosition: (x, y, z): void => {
        entries.forEach((entry, index) => {
          const cx = x + index * request.letterSpacing;
          entry.text.position.set(cx, y, z);
          if (entry.backing) {
            entry.backing.setTransform({ x: cx, y, z, fontSize: entry.text.fontSize });
          }
        });
      },
      setRotation: (x, y, z): void => {
        for (const entry of entries) {
          setEntryRotation(entry, x, y, z);
        }
      },
      setScale: (scale): void => {
        for (const entry of entries) {
          setEntryScale(entry, scale);
        }
      },
      setColor: (color): void => {
        for (const entry of entries) {
          setEntryColor(entry, color);
        }
      },
      setOpacity: (opacity): void => {
        for (const entry of entries) {
          setEntryOpacity(entry, opacity);
        }
      },
      applyReadability: (style): void => {
        for (const entry of entries) {
          reapplyReadability(entry, style);
        }
      },
      release: (): void => {
        for (const entry of entries) {
          releaseSingle(entry);
        }
      },
    };
  }

  function spawnPhrase(request: PhraseSpawnRequest): GlyphHandle {
    // 読ませる役のフレーズは単一文字層で描く（可読性の正確さを既定とする）。
    if (request.readability) {
      return spawnReadablePhrase(request);
    }
    const chars = [...request.text];
    const members: Text[] = chars.map((char, index) => {
      const member = createText();
      // chooseFont は未収録文字・失敗フォントを代替へ回し、代替も無いときは url=null（troika 既定）を返す。
      // null をそのまま渡す（?? で主フォントへ戻すと代替指定が打ち消されるため）。
      const chosen = chooseFont(request.fontName, char);
      applyTextProperties(
        member,
        char,
        chosen.url,
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
      // 演出役のフレーズは可読性補正を行わない（読ませる役のみ）。
      applyReadability: (): void => {},
      release: (): void => releaseBatched(entry),
    };
  }

  // 読ませる役の単一エントリについて、最小表示寸法の下限を毎フレーム保て、必要なときだけ作り直す。
  function maintainReadableFontSize(entry: SingleEntry): void {
    if (!entry.readability) {
      return;
    }
    const position = entry.text.position;
    const floor = readableFontSizeFloor(
      entry.readability,
      position.x,
      position.y,
      position.z,
      entry.text.scale.x || 1
    );
    if (floor <= 0) {
      return;
    }
    const target = Math.max(entry.baseFontSize, floor);
    if (Math.abs(target - entry.text.fontSize) > entry.text.fontSize * FONT_SIZE_RESYNC_RATIO) {
      entry.text.fontSize = target;
      if (entry.backing) {
        entry.backing.setTransform({
          x: position.x,
          y: position.y,
          z: position.z,
          fontSize: target,
        });
        // 文字形の暗い複製は fontSize の変更を配置確定（sync）で反映する必要がある。
        entry.backing.sync();
      }
      entry.text.sync();
    }
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
      if (entry.backing) {
        entry.backing.object.quaternion.copy(camera.quaternion);
      }
      // 最小表示寸法の下限を保つ（合成 #131 が無い現段階はエンジンのみが適用する）。
      maintainReadableFontSize(entry);
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
    for (const char of characters) {
      warmedChars.add(char);
    }
    // 各フォントの取得可否を確かめてから暖める。取得に失敗したフォントは暖めず、その文字は代替へ回す。
    await Promise.all(
      fonts.list().map(async (entry) => {
        const available = await checkFontAvailable(entry.url);
        if (!available) {
          failedFonts.add(entry.name);
          fontLoadFailures += 1;
          return;
        }
        // 取得可否の確認を通っても暖め自体が失敗することがあるため、その失敗も代替へ落とす。
        try {
          await warmUp(entry.url, characters);
        } catch {
          failedFonts.add(entry.name);
          fontLoadFailures += 1;
        }
      })
    );
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
    let activeBackings = 0;
    for (const entry of singleEntries) {
      if (entry.backing) {
        activeBackings += 1;
      }
    }
    return {
      activeGlyphs: singleEntries.size,
      pooledGlyphs: pool.pooledCount(),
      activeBatchedMembers: batchedLayer.activeMemberCount(),
      fallbackFontUses,
      fontLoadFailures,
      activeBackings,
    };
  }

  return { warmUp: warmUpAll, spawnGlyph, spawnPhrase, update, dispose, stats };
}
