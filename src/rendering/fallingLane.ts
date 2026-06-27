// 判定UI 落下式レーン（Issue #57・Issue #199）の表示物。画面左の音程番号の右の通路に、番号1のノーツを最も左・
// 番号 slotCount のノーツを最も右とする列で、発光する水滴のノーツを画面上端から落とす。各ノーツは自分の音程番号の
// 線分の高さ（スロット中央）に中心が到達した直後に消える。出現から消滅までの時間は全段一定で、速度は段ごとに変わる。
// ノーツが線分へ到達した瞬間に消滅エフェクト（波紋の輪としぶきの粒）を発火する。
// 状態を読んで描くビューであり、判定・得点・時刻の論理を持たない（依存規則 docs/decisions/architecture.md §5）。
// profiles は import しない（曲プロファイルの値は LaneNote として統括から渡される）。設計の出典は docs/idea/concept-final.md §4。

import { Group, type Object3D, PlaneGeometry } from "three";
import type { LaneNote } from "../types/judgmentLane";
import { PITCH_SLOT_COUNT_DEFAULT } from "../config/tuning";
import {
  laneNoteY,
  laneProgress,
  lanePoolCapacity,
  maxConcurrentInWindow,
  notePhaseRadians,
  reachedNoteRange,
  sortLaneNotesByTime,
  visibleNoteRange,
  type LaneTimingWindow,
} from "./fallingLaneLayout";
import { overlayPointFromNormalized } from "./viewport";
import { slotCenterNormalizedY } from "../utils/pitchSlotAxis";
import { columnCenterX, pitchHudHorizontalLayout } from "../utils/pitchHudLayout";
import { createNoteSprite, createNoteSpriteGeometry, type NoteSprite } from "./noteSprite";
import { createNoteBurst, NOTE_BURST_LIFETIME_MS, type NoteBurst, type NoteBurstSample } from "./noteBurst";

/** 出現から目標線到達までの時間（ミリ秒、★暫定）。採用理由を先に述べる。数字を読んで狙う時間として数百
 *  ミリ秒では短く、毎分175拍の約5〜6拍ぶん（約1715〜2057ミリ秒）あれば落下中に高さを定められる。
 *  長すぎると画面に多数のノーツが同時に並び密集するため、約2000ミリ秒を全段共通の出現〜消滅の時間とする。 */
export const LANE_LEAD_MS = 2000;

/** 目標線を越えた後も表示し続ける時間（ミリ秒）。ノーツの水滴は中心が自分の線分に一致した時点で消える。
 *  すなわち中心が線分を越えて下へ進む表示は行わないため、目標線通過後の表示時間は0とする。 */
export const POST_TARGET_VISIBLE_MS = 0;

const TIMING_WINDOW: LaneTimingWindow = {
  leadMs: LANE_LEAD_MS,
  postTargetMs: POST_TARGET_VISIBLE_MS,
};

/** ノーツが出現する縦位置（2次元層の上端 +1）。全段共通。ユーザー確定「画面上端から落下」。 */
const NOTE_TOP_Y = 1;

/** ノーツ点プールの容量の余裕。窓境界の丸めや実機の時刻揺れで瞬間的に増える分への備え。 */
const POOL_MARGIN = 4;

/** 消滅エフェクトのプールの容量の余裕。 */
const BURST_MARGIN = 4;

/** 芯の半径が1列の幅に占める割合。芯の直径が列幅の0.9となり列の境界に小さな余白を残す。 */
const CORE_RADIUS_OVER_COLUMN_WIDTH = 0.45;

/** 波紋の最大半径が1列の幅に占める割合。 */
const RING_MAX_RADIUS_OVER_COLUMN_WIDTH = 2.5;

/** 芯の半径の下限（デバイス画素）。視認のための下支え。これが列幅の半分を超える場合は列幅の半分で頭打ちにする
 *  （極めて狭い条件では視認性より、芯が隣の列へはみ出さないことを優先する）。 */
const MIN_CORE_RADIUS_DEVICE_PIXELS = 3;

// --- 重ね順の定数 ---
// 採用理由を先に述べる。2次元層は深度を消した平面の重ね合わせのため、深度比較に任せず描画順序の番号で奥から手前へ塗り重ねる。
// 基準値を持たせ、2次元層に載る他の表示物（左端Y軸音程ガイド #58・ランク表示 #65）と重ならないようにする。
const RENDER_ORDER_BASE = 10;
const RENDER_ORDER_BURST = RENDER_ORDER_BASE + 1;
const RENDER_ORDER_NOTE = RENDER_ORDER_BASE + 3;

/** 指定時刻における可視ノーツ1個ぶんの計算値（描画状態を変えない問い合わせの結果）。 */
export interface FallingLaneProbeNote {
  readonly id: string;
  readonly slotIndex: number;
  /** 2次元層上の現在の縦位置。 */
  readonly y: number;
  /** 2次元層上の列の中心の横位置。 */
  readonly x: number;
  /** そのスロットの線分（消滅高さ）の縦位置。 */
  readonly targetY: number;
}

/** 落下式レーンの外部契約。 */
export interface FallingLane {
  /** 2次元層へ載せる本体。統括（プレイ画面）が renderRoot.addOverlayObject で載せる。 */
  readonly object: Object3D;
  /** ノーツが出現する縦位置（全段共通の上端 +1）。 */
  readonly topY: number;
  /**
   * 毎フレームの更新。ゲーム時刻で可視ノーツの落下位置・列の横位置・芯の半径・接近の脈動を求めて表示し、
   * 線分へ到達したノーツの消滅エフェクトを発火し、消滅エフェクトの寿命を進める。
   */
  update(input: { gameTimeMs: number; aspect: number; viewportPixelHeight: number }): void;
  /** 通路の左端の横位置（直近の update が縦横比から定めた値）。受け入れ診断が読む。 */
  channelLeftX(): number;
  /** 通路の右端の横位置（直近の update が縦横比から定めた値）。受け入れ診断が読む。 */
  channelRightX(): number;
  /** 活動中の消滅エフェクトの数。受け入れ診断が読む。 */
  burstActiveCount(): number;
  /** 同時上限超過で消滅エフェクトの生成を抑制した累計回数。受け入れ診断が読む（プール容量の不足を観測するため）。 */
  burstSuppressedCount(): number;
  /** 直近の活動中の消滅エフェクトの標本（無ければ null）。受け入れ診断が読む。 */
  burstSample(): NoteBurstSample | null;
  /** 指定時刻の可視ノーツの計算値を返す副作用の無い問い合わせ（描画状態を変えない）。 */
  probe(gameTimeMs: number): FallingLaneProbeNote[];
  /** 後始末。生成した形状・材質を解放する。冪等。2次元層からの取り外しは載せた側が行う。 */
  dispose(): void;
}

/**
 * 落下式レーンを生成する。
 * notes は曲プロファイルのノーツ列（時刻と音程番号と識別子）。内部で時刻昇順へ複製して並べ替え、最も密集する
 * 時間窓の同時数からノーツ点と消滅エフェクトのプール容量を定める。生成直後は何も可視でなく、update で時刻に応じて表示する。
 */
export function createFallingLane(options: {
  notes: readonly LaneNote[];
  slotCount?: number;
}): FallingLane {
  const slotCount = options.slotCount ?? PITCH_SLOT_COUNT_DEFAULT;
  const sortedNotes = sortLaneNotesByTime(options.notes);
  const capacity = lanePoolCapacity(sortedNotes, TIMING_WINDOW, POOL_MARGIN);
  const burstCapacity = maxConcurrentInWindow(sortedNotes, NOTE_BURST_LIFETIME_MS) + BURST_MARGIN;

  const group = new Group();

  // スロットごとの目標Y（消滅高さ）。2次元層の縦位置は normalizedY だけで決まり縦横比に依らないため、ここで一度だけ求める。
  const targetYBySlot0: number[] = [];
  for (let i = 0; i < slotCount; i += 1) {
    targetYBySlot0.push(overlayPointFromNormalized(0, slotCenterNormalizedY(i, slotCount), 1).y);
  }

  // 消滅エフェクトのプール。
  const burst: NoteBurst = createNoteBurst({ capacity: burstCapacity, renderOrder: RENDER_ORDER_BURST });
  group.add(burst.object);

  // ノーツの水滴の造形のプール。共有の単位四角形ジオメトリを全ノーツで使い、材質はノーツごとに持つ。
  const spriteGeometry: PlaneGeometry = createNoteSpriteGeometry();
  const sprites: NoteSprite[] = [];
  for (let i = 0; i < capacity; i += 1) {
    const sprite = createNoteSprite(spriteGeometry, RENDER_ORDER_NOTE);
    group.add(sprite.mesh);
    sprites.push(sprite);
  }

  let lastGameTimeMs: number | null = null;
  let lastAspect = 1;
  let currentChannelLeftX = 0;
  let currentChannelRightX = 0;
  let disposed = false;

  function computeCoreRadius(columnWidth: number, viewportPixelHeight: number): number {
    const base = columnWidth * CORE_RADIUS_OVER_COLUMN_WIDTH;
    const half = columnWidth / 2;
    if (!Number.isFinite(viewportPixelHeight) || viewportPixelHeight <= 0) {
      return Math.min(base, half);
    }
    // デバイス画素の半径を2次元層の長さへ直す（縦1単位＝viewportPixelHeight÷2画素のため、半径 px の長さは 2×px÷高さ）。
    const minUnits = (2 * MIN_CORE_RADIUS_DEVICE_PIXELS) / viewportPixelHeight;
    const wanted = Math.max(base, minUnits);
    return Math.min(wanted, half);
  }

  function slotIndex0Of(note: LaneNote): number {
    const i = note.slotIndex - 1;
    if (i < 0) {
      return 0;
    }
    if (i > slotCount - 1) {
      return slotCount - 1;
    }
    return i;
  }

  return {
    object: group,
    topY: NOTE_TOP_Y,
    update(input): void {
      const { gameTimeMs, aspect, viewportPixelHeight } = input;
      if (Number.isFinite(aspect)) {
        lastAspect = aspect;
      }
      const horizontal = pitchHudHorizontalLayout(lastAspect, slotCount);
      currentChannelLeftX = horizontal.channelLeftX;
      currentChannelRightX = horizontal.channelRightX;
      const columnWidth = horizontal.columnWidth;
      const coreRadius = computeCoreRadius(columnWidth, viewportPixelHeight);
      const maxRadius = columnWidth * RING_MAX_RADIUS_OVER_COLUMN_WIDTH;

      // 消滅エフェクトの寿命を進める。前回処理した時刻から現在時刻までの差を経過時間として用いる。
      if (lastGameTimeMs !== null && Number.isFinite(gameTimeMs)) {
        const deltaSeconds = Math.max(0, (gameTimeMs - lastGameTimeMs) / 1000);
        burst.update(deltaSeconds);
      }

      // 線分へ到達したノーツ（前回時刻以上・現在時刻未満）で消滅エフェクトを発火する。
      if (lastGameTimeMs !== null) {
        const reached = reachedNoteRange(sortedNotes, lastGameTimeMs, gameTimeMs);
        for (let i = reached.start; i < reached.end; i += 1) {
          const note = sortedNotes[i];
          const slot0 = slotIndex0Of(note);
          burst.spawn({
            x: columnCenterX(horizontal, slot0, slotCount),
            y: targetYBySlot0[slot0],
            phase: notePhaseRadians(i),
            coreRadius,
            maxRadius,
          });
        }
      }
      if (Number.isFinite(gameTimeMs)) {
        lastGameTimeMs = gameTimeMs;
      }

      // 可視ノーツを水滴で表示する。
      const range = visibleNoteRange(sortedNotes, gameTimeMs, TIMING_WINDOW);
      let slot = 0;
      for (let i = range.start; i < range.end && slot < capacity; i += 1) {
        const note = sortedNotes[i];
        const slot0 = slotIndex0Of(note);
        const progress = laneProgress(note.timeMs, gameTimeMs, LANE_LEAD_MS);
        const y = laneNoteY(progress, { topY: NOTE_TOP_Y, targetY: targetYBySlot0[slot0] });
        const x = columnCenterX(horizontal, slot0, slotCount);
        const approach = progress < 0 ? 1 : progress > 1 ? 0 : 1 - progress;

        const sprite = sprites[slot];
        sprite.setPosition(x, y);
        sprite.setCoreRadius(coreRadius);
        sprite.setApproach(approach);
        sprite.setVisible(true);
        slot += 1;
      }
      for (let s = slot; s < capacity; s += 1) {
        sprites[s].setVisible(false);
      }
    },
    channelLeftX(): number {
      return currentChannelLeftX;
    },
    channelRightX(): number {
      return currentChannelRightX;
    },
    burstActiveCount(): number {
      return burst.activeCount();
    },
    burstSuppressedCount(): number {
      return burst.suppressedCount();
    },
    burstSample(): NoteBurstSample | null {
      return burst.sample();
    },
    probe(gameTimeMs): FallingLaneProbeNote[] {
      const horizontal = pitchHudHorizontalLayout(lastAspect, slotCount);
      const range = visibleNoteRange(sortedNotes, gameTimeMs, TIMING_WINDOW);
      const result: FallingLaneProbeNote[] = [];
      for (let i = range.start; i < range.end; i += 1) {
        const note = sortedNotes[i];
        const slot0 = slotIndex0Of(note);
        const progress = laneProgress(note.timeMs, gameTimeMs, LANE_LEAD_MS);
        result.push({
          id: note.id,
          slotIndex: note.slotIndex,
          y: laneNoteY(progress, { topY: NOTE_TOP_Y, targetY: targetYBySlot0[slot0] }),
          x: columnCenterX(horizontal, slot0, slotCount),
          targetY: targetYBySlot0[slot0],
        });
      }
      return result;
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      spriteGeometry.dispose();
      for (const sprite of sprites) {
        sprite.dispose();
      }
      burst.dispose();
    },
  };
}
