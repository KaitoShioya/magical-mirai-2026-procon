// ランク専用ゲージ（Issue #65・Issue #199）の表示物。画面右端寄りに縦バーを立て、スコア蓄積の
// 百分位に応じて下から上へ満ち、満ちの色をランク4段階（C・B・A・S）で OKLCH 補間し、現在ランクの文字を併記する。
// 縦位置は画面右上のクレジットボタンと重ならない高さに置く。
// 状態を読んで描くビューであり、判定・得点・時刻の論理を持たない（依存規則 docs/decisions/architecture.md §5）。
// scoring を import しない。ランクの帯分け（百分位→ランク）は統括が行い、本物は整数 rankIndex を受け取るだけにする。
// 設計の出典は docs/idea/concept-final.md §9。

import {
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  PlaneGeometry,
  SRGBColorSpace,
} from "three";
import { OVERLAY_RENDER_ORDER } from "./overlay";
import { createRankLetterAtlas, RANK_LETTER_ATLAS_CELL_COUNT, type RankLetterAtlas } from "./rankLetterAtlas";
import { fillFractionFromPercentile, rankGaugeColorAt, type Srgb } from "./rankGaugeColor";

// --- 2次元層上の寸法（高さ基準2.0が画面全体の高さに相当する単位、★暫定。実機調整で確定） ---
// 採用理由を先に述べる。ゲージは画面右端寄り（右端から余白0.08とゲージ幅の半分0.09の内側）に縦バーを立てる。
// 縦位置は、画面右上に固定されたクレジットボタン（文書要素）と重ならないよう、従来位置から一律0.35下げる。
// 最小級の縦640画素の端末でクレジットボタンの下端はおよそ +0.84 にあたり、文字中央を 0.54 に置けば十分下で重ならない。
// 落下ノーツの通路は画面左4分の1にあり、ゲージ（画面右端寄り）と横方向で別領域のため重ならない。

/** ゲージ（トラック）の横幅。 */
const GAUGE_WIDTH = 0.18;
/** 右余白。横位置を画面右端寄りに定めるために使う。 */
const GAUGE_RIGHT_MARGIN = 0.08;
/** トラック下端。従来0.34から0.35下げた値。画面下端の出典表記より十分上に収まる。 */
const TRACK_BOTTOM_Y = -0.01;
/** トラックの高さ。 */
const TRACK_HEIGHT = 0.5;
/** トラック上端（下端＋高さ）。 */
const TRACK_TOP_Y = TRACK_BOTTOM_Y + TRACK_HEIGHT; // 0.49
/** トラックの中心の縦位置。 */
const TRACK_CENTER_Y = (TRACK_BOTTOM_Y + TRACK_TOP_Y) / 2; // 0.24
/** ランク文字の中心の縦位置。トラック上端の上に置く。従来0.89から0.35下げた値。 */
const LETTER_CENTER_Y = 0.54;

/** 文字の縦画素の下限（デバイス画素、★暫定）。可読性ゲート #31 の最小可読画素（落下式レーンの18）に揃える。 */
const MIN_LETTER_DEVICE_PIXELS = 18;
/** 文字の基準の大きさ（2次元層の単位）。ゲージ幅に収まる大きさ。 */
const LETTER_BASE_UNITS = GAUGE_WIDTH * 0.6;
/** 文字の単位高さの上限。採用理由: 中心 0.54 から上端が画面上端 +1 を越えないよう上限0.20で十分（上端は
 *  0.54+0.10=0.64 で +1 未満）。クレジットボタンの下端（最小級の縦640画素端末で約 +0.84）とも重ならない。 */
const LETTER_MAX_UNITS = 0.2;

// --- 重ね順の定数 ---
// 採用理由を先に述べる。2次元層は深度を消した平面の重ね合わせのため、深度比較に任せず描画順序の番号で奥から
// 手前へ塗り重ねる。レーンと同じ操作情報の帯（standardInformation=10）を基準にし、内部はトラック・満ち・文字の順。
// ゲージとレーンは横位置が同じだが縦位置が異なり画面上で重ならないため、同帯でも深度競合は起きない。
const RENDER_ORDER_BASE = OVERLAY_RENDER_ORDER.standardInformation;
const RENDER_ORDER_TRACK = RENDER_ORDER_BASE;
const RENDER_ORDER_FILL = RENDER_ORDER_BASE + 1;
const RENDER_ORDER_LETTER = RENDER_ORDER_BASE + 2;

// --- 色（トラックの色、★暫定） ---
// 採用理由を先に述べる。トラックは満ちの色を引き立てる暗い下地とし、深夜の背景に薄く溶けつつ枠が分かる濃さにする。
const TRACK_COLOR = 0x0a0a14;
const TRACK_OPACITY = 0.35;

/** 直近の update で確定したゲージの表示事実（受け入れ診断・スモークが読む）。 */
export interface RankGaugeState {
  /** ゲージの横位置（2次元層のx座標、トラック中心）。 */
  readonly groupX: number;
  /** ゲージの横幅。 */
  readonly width: number;
  /** トラック下端の縦位置。 */
  readonly trackBottomY: number;
  /** トラック上端の縦位置。 */
  readonly trackTopY: number;
  /** 満ち量（0..1）。 */
  readonly fillFraction: number;
  /** 満ちの上端の縦位置（下端＋高さ×満ち量）。満ち量0のときは下端と同じ。 */
  readonly fillTopY: number;
  /** 現在表示しているランクの添字（0=C, 1=B, 2=A, 3=S）。 */
  readonly rankIndex: number;
  /** ランク文字の中心の縦位置。 */
  readonly letterCenterY: number;
}

/** 指定百分位における色と満ち量の計算値（描画状態を変えない問い合わせの結果）。 */
export interface RankGaugeProbe {
  /** 満ち量・色補間の共通入力 t（0..1）。 */
  readonly t: number;
  /** 満ちの色（ガンマ補正 sRGB、各チャンネル0..1）。 */
  readonly color: Srgb;
}

/** ランク専用ゲージの外部契約。 */
export interface RankGauge {
  /** 2次元層へ載せる本体。統括（プレイ画面）が renderRoot.addOverlayObject で載せる。 */
  readonly object: Object3D;
  /**
   * 毎フレームの更新。百分位から満ち量と色を、rankIndex から表示文字を定め、横位置を縦横比から画面右下へ追従させ、
   * 文字の大きさを縦のデバイス画素数から最小読み取りサイズ以上に保つ。
   */
  update(input: {
    percentile: number;
    rankIndex: number;
    aspect: number;
    viewportPixelHeight: number;
  }): void;
  /** 直近の update で確定した表示事実を返す（描画状態を変えない）。 */
  state(): RankGaugeState;
  /** 指定百分位の色と満ち量を返す副作用の無い問い合わせ（描画状態を変えない）。 */
  probe(percentile: number): RankGaugeProbe;
  /** 後始末。生成した形状・材質・テクスチャを解放する。冪等。2次元層からの取り外しは載せた側が行う。 */
  dispose(): void;
}

function makeOverlayMaterial(options: {
  color: number;
  opacity: number;
  map?: MeshBasicMaterial["map"];
}): MeshBasicMaterial {
  // 2次元層の重ね順は描画順序の番号で決めるため、深度試験と深度書き込みを無効にする。
  // 透明な重ね合わせのため transparent を真にする。色をそのまま出すためトーンマップを無効にする。
  // 画像（map）を持たない材質では map のキー自体を渡さない（undefined を渡すと three が警告を出すため）。
  const material = new MeshBasicMaterial({
    color: options.color,
    transparent: true,
    opacity: options.opacity,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  if (options.map) {
    material.map = options.map;
  }
  return material;
}

/** 値を下限と上限で挟む。 */
function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

/**
 * ランク専用ゲージを生成する。生成時点では横位置・満ち量・色・文字は未確定（update で確定する）。
 */
export function createRankGauge(): RankGauge {
  const group = new Group();

  // ランク文字図版。
  const atlas: RankLetterAtlas = createRankLetterAtlas();

  // ランク文字に対応する固定UVのジオメトリ。1個を共有してUVを書き換えると全文字が同じになるため、文字ごとに用意し、
  // rankIndex でメッシュへ割り当てる。ジオメトリは単位正方形にし、表示の大きさはメッシュの拡大率で与える。
  const letterGeometries: PlaneGeometry[] = [];
  for (let cell = 0; cell < RANK_LETTER_ATLAS_CELL_COUNT; cell += 1) {
    const geometry = new PlaneGeometry(1, 1);
    const uv = atlas.cellUv(cell);
    const uvAttribute = geometry.getAttribute("uv");
    uvAttribute.setXY(0, uv.u0, uv.v1); // 左上
    uvAttribute.setXY(1, uv.u1, uv.v1); // 右上
    uvAttribute.setXY(2, uv.u0, uv.v0); // 左下
    uvAttribute.setXY(3, uv.u1, uv.v0); // 右下
    uvAttribute.needsUpdate = true;
    letterGeometries.push(geometry);
  }

  // 材質。
  const trackMaterial = makeOverlayMaterial({ color: TRACK_COLOR, opacity: TRACK_OPACITY });
  const fillMaterial = makeOverlayMaterial({ color: 0xffffff, opacity: 1 });
  const letterMaterial = makeOverlayMaterial({ color: 0xffffff, opacity: 1, map: atlas.texture });

  // トラック（背景の縦バー）。静的。
  const trackGeometry = new PlaneGeometry(GAUGE_WIDTH, TRACK_HEIGHT);
  const track = new Mesh(trackGeometry, trackMaterial);
  track.position.set(0, TRACK_CENTER_Y, 0);
  track.renderOrder = RENDER_ORDER_TRACK;
  group.add(track);

  // 満ち（下から伸びる縦バー）。単位高さのジオメトリを満ち量で縦に拡大し、下端をトラック下端へ固定する。
  const fillGeometry = new PlaneGeometry(GAUGE_WIDTH, TRACK_HEIGHT);
  const fill = new Mesh(fillGeometry, fillMaterial);
  fill.renderOrder = RENDER_ORDER_FILL;
  fill.visible = false;
  group.add(fill);

  // ランク文字。
  const letter = new Mesh(letterGeometries[0], letterMaterial);
  letter.position.set(0, LETTER_CENTER_Y, 0);
  letter.renderOrder = RENDER_ORDER_LETTER;
  group.add(letter);

  const fillColor = new Color();

  let currentGroupX = 0;
  let currentFillFraction = 0;
  let currentFillTopY = TRACK_BOTTOM_Y;
  let currentRankIndex = 0;
  let disposed = false;

  function computeLetterSize(viewportPixelHeight: number): number {
    // 縦1単位はデバイス画素で viewportPixelHeight ÷ 2。文字の高さ H を最小読み取り画素以上に保つには
    // H ≥ 2 × MIN_LETTER_DEVICE_PIXELS ÷ viewportPixelHeight。上限 LETTER_MAX_UNITS で頭を抑える。
    if (!Number.isFinite(viewportPixelHeight) || viewportPixelHeight <= 0) {
      return LETTER_BASE_UNITS;
    }
    const minUnits = (2 * MIN_LETTER_DEVICE_PIXELS) / viewportPixelHeight;
    const wanted = Math.max(LETTER_BASE_UNITS, minUnits);
    return Math.min(LETTER_MAX_UNITS, wanted);
  }

  return {
    object: group,
    update(input): void {
      const { percentile, rankIndex, aspect, viewportPixelHeight } = input;

      // 横位置を縦横比から画面右端へ寄せる（レーンと同じ式）。縦横比が不正なときは前回の横位置を保つ。
      if (Number.isFinite(aspect)) {
        currentGroupX = aspect - GAUGE_RIGHT_MARGIN - GAUGE_WIDTH / 2;
        group.position.x = currentGroupX;
      }

      // 満ち量と色（共通入力 t）。
      const t = fillFractionFromPercentile(percentile);
      currentFillFraction = t;
      if (t <= 0) {
        // 満ち量0は退化（高さ0）になるため隠す。上端は下端と同じ。
        fill.visible = false;
        currentFillTopY = TRACK_BOTTOM_Y;
      } else {
        const filledHeight = TRACK_HEIGHT * t;
        fill.visible = true;
        fill.scale.y = t;
        // 下端をトラック下端へ固定するため、中心を下端＋満ち高さの半分へ置く。
        fill.position.set(0, TRACK_BOTTOM_Y + filledHeight / 2, 0);
        currentFillTopY = TRACK_BOTTOM_Y + filledHeight;
        // 満ちの色。算出 sRGB を sRGB 色空間として材質へ設定する（レンダラの作業空間へ正しく変換させ、
        // 出力 sRGB で意図どおりの色を出すため）。丸めは rankGaugeColorAt 内の最終段だけで、ここでは再丸めしない。
        const [r, g, b] = rankGaugeColorAt(t);
        fillColor.setRGB(r, g, b, SRGBColorSpace);
        fillMaterial.color.copy(fillColor);
      }

      // ランク文字。rankIndex を整数・範囲内へ丸めて図版のセルを選ぶ。
      const safeIndex = Number.isFinite(rankIndex)
        ? clamp(Math.round(rankIndex), 0, RANK_LETTER_ATLAS_CELL_COUNT - 1)
        : 0;
      currentRankIndex = safeIndex;
      letter.geometry = letterGeometries[safeIndex];
      const letterSize = computeLetterSize(viewportPixelHeight);
      letter.scale.set(letterSize, letterSize, 1);
      letter.position.set(0, LETTER_CENTER_Y, 0);
    },
    state(): RankGaugeState {
      return {
        groupX: currentGroupX,
        width: GAUGE_WIDTH,
        trackBottomY: TRACK_BOTTOM_Y,
        trackTopY: TRACK_TOP_Y,
        fillFraction: currentFillFraction,
        fillTopY: currentFillTopY,
        rankIndex: currentRankIndex,
        letterCenterY: LETTER_CENTER_Y,
      };
    },
    probe(percentile): RankGaugeProbe {
      const t = fillFractionFromPercentile(percentile);
      return { t, color: rankGaugeColorAt(t) };
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      trackGeometry.dispose();
      fillGeometry.dispose();
      for (const geometry of letterGeometries) {
        geometry.dispose();
      }
      trackMaterial.dispose();
      fillMaterial.dispose();
      letterMaterial.dispose();
      atlas.dispose();
    },
  };
}
