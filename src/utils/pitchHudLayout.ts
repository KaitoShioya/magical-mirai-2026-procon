// プレイ画面左側の音程ガイド（番号と線分）と落下ノーツの通路の、横方向の配置を決める純粋関数群。
// 番号の右端＝通路の左端、線分の右端＝通路の右端、という横方向の対応を必ず一致させるため、
// 横方向の定数と寸法をここで単一に所有し、音程ガイド（src/rendering/pitchAxisGuide.ts）と
// 落下ノーツ（src/rendering/fallingLane.ts）の双方がこの定義を共有する。
// 共有の数値計算を utils へ置く根拠は src/utils/README.md。three.js にも文書要素にも依存しない。
// 縦方向の帯の割合（音程スロットが画面縦に占める割合）は src/utils/pitchSlotAxis.ts が単一に所有するため、
// 番号の枠の高さの算出にはそこから取り込む（共有数値計算どうしの取り込みであり依存規則に反しない）。

import { PITCH_AXIS_HEIGHT_FRACTION } from "./pitchSlotAxis";

// 2次元層は高さを基準軸に上下が +1〜−1 で正規化されるため、画面の全高は 2 の長さに当たる。
const OVERLAY_FULL_HEIGHT = 2;

/** 番号の左端余白（2次元層の長さ）。画面左端からこの量だけ内側へ番号を寄せる。
 * 採用理由を先に述べる。左4分の1の中で7列の通路幅を確保するため、番号領域の横方向の占有を小さく抑える。
 * 端末の表示端の切れ落ちで番号が見えなくなるのを避けるため、左端ぴったりにはしない。 */
const NUMBER_LEFT_MARGIN = 0.03;

/** 番号の左端余白の位置から番号の左端までの距離（2次元層の長さ）。番号の手前に短い助走を持たせる。 */
const NUMBER_LEFT_INSET = 0.02;

/** 1つのスロットの帯の高さに対する番号文字の高さの割合。文字は帯の高さ全体ではなく一部を占めるため割合で持つ。 */
const LABEL_HEIGHT_FRACTION = 0.5;

/** 番号の枠の横幅÷縦幅。数字の字形は縦長で、枠をこの比に絞ると数字が枠の幅をほぼ満たす。 */
const DIGIT_BOX_ASPECT = 0.62;

/** ノーツが流れる通路の右端の正規化X。ユーザー確定の「画面の横幅4分の1」。 */
const CHANNEL_RIGHT_NORMALIZED_X = 0.25;

/** 横方向の配置の計算結果。すべて2次元層の横位置（左端 −縦横比、右端 +縦横比）または長さ。 */
export interface PitchHudHorizontalLayout {
  /** 番号の枠の高さ（縦横比に依らない）。 */
  numberBoxHeight: number;
  /** 番号の枠の幅（縦横比に依らない）。 */
  numberBoxWidth: number;
  /** 番号の中心の横位置。 */
  numberCenterX: number;
  /** 番号の右端の横位置（＝通路の左端）。 */
  numberRightEdgeX: number;
  /** 通路の左端の横位置（番号の右端と同じ）。 */
  channelLeftX: number;
  /** 通路の右端の横位置（正規化X 0.25 に対応）。 */
  channelRightX: number;
  /** 通路の幅。 */
  channelWidth: number;
  /** 1列の幅（通路の幅をスロット数で割った値）。 */
  columnWidth: number;
}

/**
 * 番号の枠の高さ（2次元層の長さ、縦横比に依らない）を返す。
 * 帯の1スロット分の高さ（画面全高 × 帯割合 ÷ スロット数）に、文字の高さ割合を掛ける。
 */
export function numberBoxHeight(slotCount: number): number {
  return ((OVERLAY_FULL_HEIGHT * PITCH_AXIS_HEIGHT_FRACTION) / slotCount) * LABEL_HEIGHT_FRACTION;
}

/** 番号の枠の幅（2次元層の長さ、縦横比に依らない）を返す。番号の枠の高さに字形比を掛ける。 */
export function numberBoxWidth(slotCount: number): number {
  return numberBoxHeight(slotCount) * DIGIT_BOX_ASPECT;
}

/**
 * 縦横比とスロット数から、横方向の配置をまとめて返す。
 * 通路の右端は正規化X 0.25 を2次元層へ写した位置（写像式 x = (nx − 0.5) × 2 × 縦横比 に 0.25 を代入）。
 */
export function pitchHudHorizontalLayout(
  aspect: number,
  slotCount: number
): PitchHudHorizontalLayout {
  const boxHeight = numberBoxHeight(slotCount);
  const boxWidth = numberBoxWidth(slotCount);
  const leftAnchorX = -aspect + NUMBER_LEFT_MARGIN;
  const numberCenterX = leftAnchorX + NUMBER_LEFT_INSET + boxWidth / 2;
  const numberRightEdgeX = numberCenterX + boxWidth / 2;
  const channelRightX = (CHANNEL_RIGHT_NORMALIZED_X - 0.5) * 2 * aspect;
  const channelLeftX = numberRightEdgeX;
  const channelWidth = channelRightX - channelLeftX;
  return {
    numberBoxHeight: boxHeight,
    numberBoxWidth: boxWidth,
    numberCenterX,
    numberRightEdgeX,
    channelLeftX,
    channelRightX,
    channelWidth,
    columnWidth: channelWidth / slotCount,
  };
}

/**
 * 0始まりのスロット番号の、ノーツ列の中心の横位置を返す。
 * 通路 [通路の左端, 通路の右端] を slotCount 等分した各列の中央であり、
 * 通路の左端 + ((slotIndex0 + 0.5) / slotCount) × 通路の幅。
 * slotIndex0 = 0（番号1）が最も左、slotIndex0 = slotCount − 1（番号 slotCount）が最も右。
 * 最も右の列の中心は通路の右端そのものではなく、右端から半列分内側にある。
 */
export function columnCenterX(
  layout: PitchHudHorizontalLayout,
  slotIndex0: number,
  slotCount: number
): number {
  return layout.channelLeftX + ((slotIndex0 + 0.5) / slotCount) * layout.channelWidth;
}
