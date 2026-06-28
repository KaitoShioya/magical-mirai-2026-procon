// 判定UI 落下式レーン（Issue #57・Issue #199・Issue #202）の表示物。画面左側の帯に縦7レーンを並べ、鳴る打楽器をX軸の
// どのレーンかで表す。レーン1のノーツを最も左・レーン slotCount のノーツを最も右に置き、発光する水滴のノーツを
// 画面上端から落とす。全レーンのノーツは共通の単一判定線に中心が到達した直後に消える。出現から消滅までの時間は
// 全レーン共通で、各レーンに固有の色を割り当てる。ノーツが判定線へ到達した瞬間に消滅エフェクト（波紋の輪としぶき
// の粒）を発火する。状態を読んで描くビューであり、判定・得点・時刻の論理を持たない（依存規則 docs/decisions/architecture.md §5）。
// profiles は import しない（曲プロファイルの値は LaneNote として統括から渡される）。設計の出典は docs/idea/concept-final.md §4。

import { Group, type Object3D, PlaneGeometry } from "three";
import type { LaneNote } from "../types/judgmentLane";
import { PITCH_SLOT_COUNT_DEFAULT } from "../config/tuning";
import {
  JUDGMENT_LINE_OVERLAY_Y,
  NOTE_TOP_OVERLAY_Y,
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
import { columnCenterX, laneBoundaryX, laneWidthNormalizedX, resolveSlotCount } from "../utils/pitchHudLayout";
import { laneColor } from "./noteColors";
import { createNoteSprite, createNoteSpriteGeometry, type NoteSprite } from "./noteSprite";
import { createNoteBurst, NOTE_BURST_LIFETIME_MS, type NoteBurst, type NoteBurstSample } from "./noteBurst";
import { createRippleField, type RippleField } from "./rippleField";

/** 出現から判定線到達までの時間（ミリ秒、★暫定）。採用理由を先に述べる。狙う時間として数百ミリ秒では短く、
 *  毎分175拍の約5〜6拍ぶん（約1715〜2057ミリ秒）あれば落下中にレーンとタイミングを定められる。長すぎると画面に
 *  多数のノーツが同時に並び密集するため、約2000ミリ秒を全レーン共通の出現〜消滅の時間とする。 */
export const LANE_LEAD_MS = 2000;

/** 判定線を越えた後も表示し続ける時間（ミリ秒）。ノーツの水滴は中心が判定線に一致した時点で消えるため0とする。 */
export const POST_TARGET_VISIBLE_MS = 0;

const TIMING_WINDOW: LaneTimingWindow = {
  leadMs: LANE_LEAD_MS,
  postTargetMs: POST_TARGET_VISIBLE_MS,
};

/** ノーツ点プールの容量の余裕。窓境界の丸めや実機の時刻揺れで瞬間的に増える分への備え。 */
const POOL_MARGIN = 4;

/** 消滅エフェクトのプールの容量の余裕。 */
const BURST_MARGIN = 4;

/** 芯の半径が1レーンの幅に占める割合。芯の直径がレーン幅の0.9となりレーンの境界に小さな余白を残す。 */
const CORE_RADIUS_OVER_LANE_WIDTH = 0.45;

/** 波紋の最大半径が1レーンの幅に占める割合。 */
const RING_MAX_RADIUS_OVER_LANE_WIDTH = 2.5;

/** 芯の半径の下限（デバイス画素）。視認のための下支え。これがレーン幅の半分を超える場合はレーン幅の半分で頭打ちにする
 *  （極めて狭い条件では視認性より、芯が隣のレーンへはみ出さないことを優先する）。 */
const MIN_CORE_RADIUS_DEVICE_PIXELS = 3;

// --- 重ね順の定数 ---
// 採用理由を先に述べる。2次元層は深度を消した平面の重ね合わせのため、深度比較に任せず描画順序の番号で奥から手前へ塗り重ねる。
// 基準値を持たせ、2次元層に載る他の表示物（レーンガイド・ランク表示 #65）と重ならないようにする。
const RENDER_ORDER_BASE = 10;
const RENDER_ORDER_BURST = RENDER_ORDER_BASE + 1;
const RENDER_ORDER_NOTE = RENDER_ORDER_BASE + 3;
// 画面全体の波紋はレーンガイド（最背面）より手前・ノーツより奥に置き、水面がノーツの背後で広がるようにする。
const RENDER_ORDER_RIPPLE = RENDER_ORDER_BASE - 2;

/** 指定時刻における可視ノーツ1個ぶんの計算値（描画状態を変えない問い合わせの結果）。 */
export interface FallingLaneProbeNote {
  readonly id: string;
  readonly slotIndex: number;
  /** 2次元層上の現在の縦位置。 */
  readonly y: number;
  /** 2次元層上のレーンの中心の横位置。 */
  readonly x: number;
}

/** 落下式レーンの外部契約。 */
export interface FallingLane {
  /** 2次元層へ載せる本体。統括（プレイ画面）が renderRoot.addOverlayObject で載せる。 */
  readonly object: Object3D;
  /** ノーツが出現する縦位置（全レーン共通の上端 +1）。 */
  readonly topY: number;
  /** 単一判定線の縦位置（全レーン共通の目標Y）。 */
  readonly judgmentLineY: number;
  /**
   * 毎フレームの更新。ゲーム時刻で可視ノーツの落下位置・レーンの横位置・芯の半径・接近の脈動・レーンの色を求めて表示し、
   * 判定線へ到達したノーツの消滅エフェクトを発火し、消滅エフェクトの寿命を進める。
   */
  update(input: { gameTimeMs: number; aspect: number; viewportPixelHeight: number }): void;
  /**
   * プレイヤーがタップした瞬間に、そのレーン（音程スロット、0始まり）の判定線の位置から画面全体の水面の波紋を1つ立てる。
   * 波紋はプレイヤーのタップに対する手応えであり、ノーツが判定線を自動で通過しただけでは立てない。
   */
  spawnTapRipple(slotIndex0: number): void;
  /** 帯の左端の横位置（直近の update が縦横比から定めた値）。受け入れ診断が読む。 */
  channelLeftX(): number;
  /** 帯の右端の横位置（直近の update が縦横比から定めた値）。受け入れ診断が読む。 */
  channelRightX(): number;
  /** 活動中の消滅エフェクトの数。受け入れ診断が読む。 */
  burstActiveCount(): number;
  /** 活動中の画面全体の波紋の数。受け入れ診断が読む。 */
  rippleActiveCount(): number;
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
  // スロット数は入力側（src/input）と同じ正典 resolveSlotCount で検証して確定する。0・非整数・非有限が混入しても
  // レーン幅が無限大や非整数の刻みにならず、既定値へ丸めて表示を続ける（失敗のない床）。
  const slotCount = resolveSlotCount(options.slotCount, PITCH_SLOT_COUNT_DEFAULT);
  const sortedNotes = sortLaneNotesByTime(options.notes);
  const capacity = lanePoolCapacity(sortedNotes, TIMING_WINDOW, POOL_MARGIN);
  const burstCapacity = maxConcurrentInWindow(sortedNotes, NOTE_BURST_LIFETIME_MS) + BURST_MARGIN;

  const group = new Group();

  // 消滅エフェクトのプール。
  const burst: NoteBurst = createNoteBurst({ capacity: burstCapacity, renderOrder: RENDER_ORDER_BURST });
  group.add(burst.object);

  // 画面全体の水面の波紋。プレイヤーの得点したタップ（spawnTapRipple）でのみ立て、落下中の他ノーツへも影響させる。
  // ノーツが判定線を自動で通過しただけでは立てない（自動通過で出るのは着水点の局所の消滅エフェクト burst のみ）。
  const ripple: RippleField = createRippleField({ renderOrder: RENDER_ORDER_RIPPLE });
  group.add(ripple.object);

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

  function laneWidthOverlay(aspect: number): number {
    // レーンの正規化幅を2次元層の長さへ直す（横は 1単位の正規化X が 2×縦横比 の長さに当たる）。
    return laneWidthNormalizedX(slotCount) * 2 * aspect;
  }

  function computeCoreRadius(laneWidth: number, viewportPixelHeight: number): number {
    const base = laneWidth * CORE_RADIUS_OVER_LANE_WIDTH;
    const half = laneWidth / 2;
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
    topY: NOTE_TOP_OVERLAY_Y,
    judgmentLineY: JUDGMENT_LINE_OVERLAY_Y,
    update(input): void {
      const { gameTimeMs, aspect, viewportPixelHeight } = input;
      if (Number.isFinite(aspect)) {
        lastAspect = aspect;
      }
      currentChannelLeftX = laneBoundaryX(0, slotCount, lastAspect);
      currentChannelRightX = laneBoundaryX(slotCount, slotCount, lastAspect);
      const laneWidth = laneWidthOverlay(lastAspect);
      const coreRadius = computeCoreRadius(laneWidth, viewportPixelHeight);
      const maxRadius = laneWidth * RING_MAX_RADIUS_OVER_LANE_WIDTH;

      // 画面全体の波紋を視錐台（縦横比）へ合わせる。
      ripple.layout(lastAspect);

      // 消滅エフェクトと画面全体の波紋の寿命を進める。前回処理した時刻から現在時刻までの差を経過時間として用いる。
      if (lastGameTimeMs !== null && Number.isFinite(gameTimeMs)) {
        const deltaSeconds = Math.max(0, (gameTimeMs - lastGameTimeMs) / 1000);
        burst.update(deltaSeconds);
        ripple.update(deltaSeconds);
      }

      // 判定線へ到達したノーツ（前回時刻以上・現在時刻未満）で消滅エフェクトを発火する。
      if (lastGameTimeMs !== null) {
        const reached = reachedNoteRange(sortedNotes, lastGameTimeMs, gameTimeMs);
        for (let i = reached.start; i < reached.end; i += 1) {
          const note = sortedNotes[i];
          const slot0 = slotIndex0Of(note);
          burst.spawn({
            x: columnCenterX(slot0, slotCount, lastAspect),
            y: JUDGMENT_LINE_OVERLAY_Y,
            phase: notePhaseRadians(i),
            coreRadius,
            maxRadius,
            color: laneColor(slot0),
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
        const y = laneNoteY(progress, { topY: NOTE_TOP_OVERLAY_Y, targetY: JUDGMENT_LINE_OVERLAY_Y });
        const x = columnCenterX(slot0, slotCount, lastAspect);
        const approach = progress < 0 ? 1 : progress > 1 ? 0 : 1 - progress;
        const [r, g, b] = laneColor(slot0);

        // 画面全体の波紋がこのノーツの位置を通過するとき、波面の向きへ小さく揺らし明るさを脈動させる（他ノーツとの干渉）。
        const influence = ripple.sampleNoteInfluence(x, y);

        const sprite = sprites[slot];
        sprite.setPosition(x + influence.offsetX, y + influence.offsetY);
        sprite.setCoreRadius(coreRadius);
        sprite.setApproach(approach);
        sprite.setColor(r, g, b);
        sprite.setBrightness(1 + influence.brightnessPulse);
        sprite.setVisible(true);
        slot += 1;
      }
      for (let s = slot; s < capacity; s += 1) {
        sprites[s].setVisible(false);
      }
    },
    spawnTapRipple(slotIndex0: number): void {
      // タップしたレーンの中心・判定線の高さから波紋を立てる。レーン番号は安全のため帯の端へ丸める（失敗のない床）。
      let s = Math.floor(slotIndex0);
      if (!Number.isFinite(s) || s < 0) {
        s = 0;
      } else if (s > slotCount - 1) {
        s = slotCount - 1;
      }
      ripple.spawn(columnCenterX(s, slotCount, lastAspect), JUDGMENT_LINE_OVERLAY_Y);
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
    rippleActiveCount(): number {
      return ripple.activeCount();
    },
    burstSuppressedCount(): number {
      return burst.suppressedCount();
    },
    burstSample(): NoteBurstSample | null {
      return burst.sample();
    },
    probe(gameTimeMs): FallingLaneProbeNote[] {
      const range = visibleNoteRange(sortedNotes, gameTimeMs, TIMING_WINDOW);
      const result: FallingLaneProbeNote[] = [];
      for (let i = range.start; i < range.end; i += 1) {
        const note = sortedNotes[i];
        const slot0 = slotIndex0Of(note);
        const progress = laneProgress(note.timeMs, gameTimeMs, LANE_LEAD_MS);
        result.push({
          id: note.id,
          slotIndex: note.slotIndex,
          y: laneNoteY(progress, { topY: NOTE_TOP_OVERLAY_Y, targetY: JUDGMENT_LINE_OVERLAY_Y }),
          x: columnCenterX(slot0, slotCount, lastAspect),
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
      ripple.dispose();
    },
  };
}
