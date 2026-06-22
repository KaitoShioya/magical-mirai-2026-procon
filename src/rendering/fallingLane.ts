// 判定UI（落下式レーン Issue #57）の表示物。画面右下に直線の落下式レーン（レーン帯・目標線・上から落ちる
// ノーツ点・各点の音程番号1〜9）を2次元層へ載せる。落下速度は実時刻に一致し、ノーツが目標線に重なる瞬間が
// ノーツの実時刻に一致する。状態を読んで描くビューであり、判定・得点・時刻の論理を持たない
// （依存規則 docs/decisions/architecture.md §5）。profiles は import しない（曲プロファイルの値は LaneNote として
// 統括から渡される）。設計の出典は docs/idea/concept-final.md §4。

import {
  CircleGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  PlaneGeometry,
  type Texture,
} from "three";
import type { LaneNote } from "../types/judgmentLane";
import {
  createDigitAtlas,
  DIGIT_ATLAS_CELL_COUNT,
  type DigitAtlas,
} from "./digitAtlas";
import {
  digitCellIndex,
  laneNoteY,
  laneProgress,
  lanePoolCapacity,
  sortLaneNotesByTime,
  visibleNoteRange,
  type LaneGeometryY,
  type LaneTimingWindow,
} from "./fallingLaneLayout";

// --- 時間の定数（採用理由は各所に先述、★暫定は実機調整で確定） ---

/** 出現から目標線到達までの時間（ミリ秒、★暫定）。採用理由を先に述べる。数字を読んで狙う時間として数百
 *  ミリ秒では短く、毎分175拍の約5〜6拍ぶん（約1715〜2057ミリ秒）あれば落下中に番号を読み高さを定められる。
 *  長すぎると画面に多数のノーツが同時に並び密集するため、約2000ミリ秒（約5.8拍）を初期値とする。 */
export const LANE_LEAD_MS = 2000;

/** 目標線を越えた後も表示し続ける時間（ミリ秒）。採用理由を先に述べる。ノーツ点の円板が消える時点は、円板の
 *  中心が目標線に一致した時点とする。すなわち円板の中心が目標線を越えて下へ進む表示は行わない。よって目標線
 *  通過後の表示時間は0とする。これにより、円板は上端から目標線まで落ち、中心が目標線に一致した瞬間に消える。 */
export const POST_TARGET_VISIBLE_MS = 0;

const TIMING_WINDOW: LaneTimingWindow = {
  leadMs: LANE_LEAD_MS,
  postTargetMs: POST_TARGET_VISIBLE_MS,
};

// --- 2次元層上の寸法の定数（高さ基準2.0が画面全体の高さに相当する単位、★暫定） ---
// 採用理由を先に述べる。画面の隅で操作の妨げにならず、かつ番号が読める大きさとして、画面高さの約6割の
// 縦長・細い帯を右下隅へ小さな余白で寄せる。

const LANE_HEIGHT = 1.2;
const LANE_WIDTH = 0.18;
const LANE_RIGHT_MARGIN = 0.08;
const LANE_BOTTOM_MARGIN = 0.1;
/** 目標線をレーン帯の下端からどれだけ上に置くか。採用理由を先に述べる。目標線を下端側に置きノーツを上端から
 *  落とすことで「上から落ちて目標線に重なる」動きを成立させる。目標線を最下端ちょうどでなく少し上へ置くのは、
 *  目標線が帯の縁に埋もれず明確に見えるようにするためである。 */
const LANE_TARGET_OFFSET = 0.1;

const BAND_BOTTOM_Y = -1 + LANE_BOTTOM_MARGIN; // -0.90
const BAND_TOP_Y = BAND_BOTTOM_Y + LANE_HEIGHT; // 0.30
const BAND_CENTER_Y = (BAND_TOP_Y + BAND_BOTTOM_Y) / 2;
/** ノーツが出現するレーン上端の縦位置。 */
const NOTE_TOP_Y = BAND_TOP_Y;
/** 目標線の縦位置。 */
const NOTE_TARGET_Y = BAND_BOTTOM_Y + LANE_TARGET_OFFSET; // -0.80

const LANE_GEOMETRY_Y: LaneGeometryY = { topY: NOTE_TOP_Y, targetY: NOTE_TARGET_Y };

/** 目標線の太さ（2次元層の単位、★暫定）。 */
const TARGET_LINE_THICKNESS = 0.012;
/** ノーツ点の円板の半径（2次元層の単位、★暫定）。レーン幅に収まる小さな点。 */
const DISC_RADIUS = LANE_WIDTH * 0.18;
/** 円板の分割数。小さな円を滑らかに見せる最小限。 */
const DISC_SEGMENTS = 16;

/** 数字の画面上の高さの下限（デバイス画素、★暫定）。採用理由を先に述べる。文字可読性ゲート
 *  （src/typography/kineticText/readability.ts の既定 minPixelHeight が18）が読める最小高さをデバイス画素18と
 *  しており、同じ基準を数字へ適用する。 */
export const MIN_DIGIT_DEVICE_PIXELS = 18;
/** 数字の基準の大きさ（2次元層の単位）。レーン幅に収まる大きさ。 */
const DIGIT_BASE_UNITS = LANE_WIDTH * 0.6;
/** 数字の大きさの上限（2次元層の単位）。レーン幅をはみ出さないよう抑える。 */
const DIGIT_MAX_UNITS = LANE_WIDTH * 0.9;

/** ノーツ点プールの容量の余裕。窓境界の丸めや実機の時刻揺れで瞬間的に増える分への備え。 */
const POOL_MARGIN = 4;

// --- 重ね順の定数 ---
// 採用理由を先に述べる。2次元層は深度を消した平面の重ね合わせのため、深度比較に任せると同一平面の競合が
// 起きうる。レーンの全マテリアルで深度試験と深度書き込みを無効にし、描画順序の番号で奥から手前へ塗り重ねる。
// 基準値を持たせ、2次元層に載る他の表示物（左端Y軸音程帯 #58・反応位置の光点）と番号帯が重ならないようにする。
const RENDER_ORDER_BASE = 10;
const RENDER_ORDER_BAND = RENDER_ORDER_BASE;
const RENDER_ORDER_TARGET_LINE = RENDER_ORDER_BASE + 1;
const RENDER_ORDER_DISC = RENDER_ORDER_BASE + 2;
const RENDER_ORDER_DIGIT = RENDER_ORDER_BASE + 3;

// --- 色（2次元層の表示物の色、★暫定） ---
const BAND_COLOR = 0x0a0a14;
const BAND_OPACITY = 0.35;
const TARGET_LINE_COLOR = 0x7ec8e3;
const TARGET_LINE_OPACITY = 0.9;
const DISC_COLOR = 0x7ec8e3;
const DISC_OPACITY = 0.85;

/** 指定時刻における可視ノーツ1個ぶんの計算値（描画状態を変えない問い合わせの結果）。 */
export interface FallingLaneProbeNote {
  readonly id: string;
  readonly slotIndex: number;
  /** 表示する数字。slotIndex がセル範囲外で表示しないときは null。 */
  readonly digit: number | null;
  /** 2次元層上の縦位置。 */
  readonly y: number;
}

/** 落下式レーンの外部契約。 */
export interface FallingLane {
  /** 2次元層へ載せる本体。統括（プレイ画面）が renderRoot.addOverlayObject で載せる。 */
  readonly object: Object3D;
  /** ノーツが出現するレーン上端の縦位置。 */
  readonly topY: number;
  /** 目標線の縦位置。 */
  readonly targetY: number;
  /**
   * 毎フレームの更新。ゲーム時刻で可視ノーツの落下位置を求めて表示し、横位置を縦横比から画面右下へ追従させ、
   * 数字の大きさを縦のデバイス画素数から最小読み取りサイズ以上に保つ。
   */
  update(input: { gameTimeMs: number; aspect: number; viewportPixelHeight: number }): void;
  /** 横位置（2次元層のx座標）。直近の update が縦横比から定めた値。受け入れ診断が読む。 */
  currentGroupX(): number;
  /** 指定時刻の可視ノーツの計算値を返す副作用の無い問い合わせ（落下位置の純粋関数で計算し描画状態を変えない）。 */
  probe(gameTimeMs: number): FallingLaneProbeNote[];
  /** 後始末。生成した形状・材質・テクスチャを解放する。冪等。2次元層からの取り外しは載せた側が行う。 */
  dispose(): void;
}

function makeOverlayMaterial(options: { color: number; opacity: number; map?: Texture }): MeshBasicMaterial {
  // 2次元層の重ね順は描画順序の番号で決めるため、深度試験と深度書き込みを無効にする。
  // 透明な重ね合わせのため transparent を真にする。色をそのまま出すためトーンマップを無効にする。
  return new MeshBasicMaterial({
    color: options.color,
    map: options.map,
    transparent: true,
    opacity: options.opacity,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
}

/**
 * 落下式レーンを生成する。
 * notes は曲プロファイルのノーツ列（時刻と音程番号と識別子）。内部で時刻昇順へ複製して並べ替え、最も密集する
 * 時間窓の同時数からノーツ点プールの容量を定める。生成直後は何も可視でなく、update で時刻に応じて表示する。
 */
export function createFallingLane(options: { notes: readonly LaneNote[] }): FallingLane {
  const sortedNotes = sortLaneNotesByTime(options.notes);
  const capacity = lanePoolCapacity(sortedNotes, TIMING_WINDOW, POOL_MARGIN);

  const group = new Group();

  // 数字図版（透明背景・白塗り・暗い縁取り）。
  const atlas: DigitAtlas = createDigitAtlas();

  // 数字1〜9に対応する固定UVのジオメトリ9個。各ノーツ点の数字メッシュへ、そのノーツの数字のジオメトリを
  // 割り当てる。1個のジオメトリを共有してUVを書き換えると全ノーツの数字が同じになるため、数字ごとに用意する。
  // ジオメトリは単位正方形にし、表示の大きさはメッシュの拡大率で与える。
  const digitGeometries: PlaneGeometry[] = [];
  for (let cell = 0; cell < DIGIT_ATLAS_CELL_COUNT; cell += 1) {
    const geometry = new PlaneGeometry(1, 1);
    const uv = atlas.cellUv(cell);
    // PlaneGeometry の頂点は左上・右上・左下・右下の順。各頂点のテクスチャ座標を該当セルの矩形へ写す。
    const uvAttribute = geometry.getAttribute("uv");
    uvAttribute.setXY(0, uv.u0, uv.v1); // 左上
    uvAttribute.setXY(1, uv.u1, uv.v1); // 右上
    uvAttribute.setXY(2, uv.u0, uv.v0); // 左下
    uvAttribute.setXY(3, uv.u1, uv.v0); // 右下
    uvAttribute.needsUpdate = true;
    digitGeometries.push(geometry);
  }

  // 共有の材質。
  const bandMaterial = makeOverlayMaterial({ color: BAND_COLOR, opacity: BAND_OPACITY });
  const targetLineMaterial = makeOverlayMaterial({
    color: TARGET_LINE_COLOR,
    opacity: TARGET_LINE_OPACITY,
  });
  const discMaterial = makeOverlayMaterial({ color: DISC_COLOR, opacity: DISC_OPACITY });
  const digitMaterial = makeOverlayMaterial({ color: 0xffffff, opacity: 1, map: atlas.texture });

  // 静的なレーン帯。
  const bandGeometry = new PlaneGeometry(LANE_WIDTH, LANE_HEIGHT);
  const band = new Mesh(bandGeometry, bandMaterial);
  band.position.set(0, BAND_CENTER_Y, 0);
  band.renderOrder = RENDER_ORDER_BAND;
  group.add(band);

  // 静的な目標線。
  const targetGeometry = new PlaneGeometry(LANE_WIDTH, TARGET_LINE_THICKNESS);
  const targetLine = new Mesh(targetGeometry, targetLineMaterial);
  targetLine.position.set(0, NOTE_TARGET_Y, 0);
  targetLine.renderOrder = RENDER_ORDER_TARGET_LINE;
  group.add(targetLine);

  // ノーツ点プール。各スロットは円板メッシュ（点）と数字メッシュ（番号）の一組。生成直後は不可視。
  const discGeometry = new CircleGeometry(1, DISC_SEGMENTS);
  const discMeshes: Mesh[] = [];
  const digitMeshes: Mesh[] = [];
  for (let i = 0; i < capacity; i += 1) {
    const disc = new Mesh(discGeometry, discMaterial);
    disc.scale.setScalar(DISC_RADIUS);
    disc.renderOrder = RENDER_ORDER_DISC;
    disc.visible = false;
    group.add(disc);
    discMeshes.push(disc);

    const digit = new Mesh(digitGeometries[0], digitMaterial);
    digit.renderOrder = RENDER_ORDER_DIGIT;
    digit.visible = false;
    group.add(digit);
    digitMeshes.push(digit);
  }

  let currentGroupX = 0;
  let disposed = false;

  function computeDigitSize(viewportPixelHeight: number): number {
    // 2次元層の縦は上端+1・下端-1の2単位ぶんが画面の縦デバイス画素数に対応するため、縦1単位はデバイス画素で
    // viewportPixelHeight ÷ 2。数字の2次元層上の高さ H をデバイス画素へ直すと H × viewportPixelHeight ÷ 2 で、
    // これを下限以上に保つには H ≥ 2 × MIN_DIGIT_DEVICE_PIXELS ÷ viewportPixelHeight が必要。
    // 画素数が不正なときは基準値を使う。
    if (!Number.isFinite(viewportPixelHeight) || viewportPixelHeight <= 0) {
      return DIGIT_BASE_UNITS;
    }
    const minUnits = (2 * MIN_DIGIT_DEVICE_PIXELS) / viewportPixelHeight;
    const wanted = Math.max(DIGIT_BASE_UNITS, minUnits);
    return Math.min(DIGIT_MAX_UNITS, wanted);
  }

  return {
    object: group,
    topY: NOTE_TOP_Y,
    targetY: NOTE_TARGET_Y,
    update(input): void {
      const { gameTimeMs, aspect, viewportPixelHeight } = input;

      // 横位置を縦横比から画面右端へ寄せる。レーンの中心を右端から余白とレーン幅の半分だけ内側に置く。
      // 縦横比が不正なときは前回の横位置を保つ。
      if (Number.isFinite(aspect)) {
        currentGroupX = aspect - LANE_RIGHT_MARGIN - LANE_WIDTH / 2;
        group.position.x = currentGroupX;
      }

      const digitSize = computeDigitSize(viewportPixelHeight);

      const range = visibleNoteRange(sortedNotes, gameTimeMs, TIMING_WINDOW);
      let slot = 0;
      for (let i = range.start; i < range.end && slot < capacity; i += 1) {
        const note = sortedNotes[i];
        const cellIndex = digitCellIndex(note.slotIndex, DIGIT_ATLAS_CELL_COUNT);
        if (cellIndex === null) {
          // セル範囲外の音程番号は表示しない（防御。読込時の検証で通常は起きない）。
          continue;
        }
        const progress = laneProgress(note.timeMs, gameTimeMs, LANE_LEAD_MS);
        const y = laneNoteY(progress, LANE_GEOMETRY_Y);

        const disc = discMeshes[slot];
        disc.position.set(0, y, 0);
        disc.visible = true;

        const digit = digitMeshes[slot];
        digit.geometry = digitGeometries[cellIndex];
        digit.position.set(0, y, 0);
        digit.scale.set(digitSize, digitSize, 1);
        digit.visible = true;

        slot += 1;
      }
      // 使わないスロットを隠す。
      for (let s = slot; s < capacity; s += 1) {
        discMeshes[s].visible = false;
        digitMeshes[s].visible = false;
      }
    },
    currentGroupX(): number {
      return currentGroupX;
    },
    probe(gameTimeMs): FallingLaneProbeNote[] {
      const range = visibleNoteRange(sortedNotes, gameTimeMs, TIMING_WINDOW);
      const result: FallingLaneProbeNote[] = [];
      for (let i = range.start; i < range.end; i += 1) {
        const note = sortedNotes[i];
        const cellIndex = digitCellIndex(note.slotIndex, DIGIT_ATLAS_CELL_COUNT);
        const progress = laneProgress(note.timeMs, gameTimeMs, LANE_LEAD_MS);
        result.push({
          id: note.id,
          slotIndex: note.slotIndex,
          digit: cellIndex === null ? null : cellIndex + 1,
          y: laneNoteY(progress, LANE_GEOMETRY_Y),
        });
      }
      return result;
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      // 形状を解放する。
      bandGeometry.dispose();
      targetGeometry.dispose();
      discGeometry.dispose();
      for (const geometry of digitGeometries) {
        geometry.dispose();
      }
      // 材質を解放する。
      bandMaterial.dispose();
      targetLineMaterial.dispose();
      discMaterial.dispose();
      digitMaterial.dispose();
      // テクスチャを解放する。
      atlas.dispose();
    },
  };
}
