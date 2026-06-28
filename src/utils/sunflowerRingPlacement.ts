// 持続配置のひまわりの放射状リング配置（本タスク）。初音ミク（湖の中心）を中心とする同心円の領域へ、反応の正確さに
// 応じてひまわりを置く位置（水平の x・z）を決める純粋な状態機械である。three.js にも文書要素にも依存せず、乱数も使わない
// ため、node 環境で決定的に単体検証できる（Math.random は node のテストを非決定にするため使わない方針。butterflyFigures と同根拠）。
//
// 規則（ユーザー決定）:
//  - 反応が正確であるほど中心に近い半径へ置く（正確さ1で最小半径、0で最大半径へ線形対応）。
//  - 半径を等幅の同心円帯（リング）に分け、各帯に「自然な密度」になる収容上限を設ける（上限＝帯の中央円周÷最小間隔）。
//  - 目標の帯が満杯なら、その外側の最も近い空きのある帯へ置く（外向きに最初の空き帯を探す）。
//  - すべての帯が満杯なら最大半径の外側へ置く（安全側。全帯の合計上限は得点タップの最大数を上回るため通常は起きない）。
//  - 帯内の半径と角度は、見た目が散らばるよう黄金角・黄金比の決定的な数列で与える（乱数を使わない）。

// 黄金角（ラジアン）。連番に掛けて剰余を取ると少数でも均等に散らばる（butterflyFigures と同じ値・同根拠）。
const GOLDEN_ANGLE = 2.399963229728653;
// 黄金比の共役（1÷黄金比）。連番に掛けた小数部は0以上1未満で均等に散らばるため、帯内の半径ゆらぎに使う。
const GOLDEN_RATIO_CONJUGATE = 0.618033988749895;
const TAU = Math.PI * 2;

/** 放射状リング配置の生成設定。 */
export interface SunflowerRingPlacementOptions {
  /** 中心（ミク）の水平座標。 */
  centerX: number;
  centerZ: number;
  /** 最も正確な反応のときの半径（最小）。 */
  radiusMin: number;
  /** 最も不正確な反応のときの半径（最大）。 */
  radiusMax: number;
  /** 同心円帯の数（正の整数）。 */
  ringCount: number;
  /** 同一帯内でひまわりが取り得る最小間隔（帯の収容上限の算出に使う。正）。 */
  minSpacing: number;
}

/** 放射状リング配置の状態機械。 */
export interface SunflowerRingPlacement {
  /** 反応の正確さ（0以上1以下。1が最も正確）から、次のひまわりの水平位置を1つ決めて返す。 */
  place(accuracy: number): { x: number; z: number };
  /** 配置状態（各帯の現在数・連番）を初期化する（リトライ用）。 */
  reset(): void;
  /** 各帯の収容上限（検査用に複製して返す）。 */
  ringCapacities(): readonly number[];
}

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return value >= 1 ? 1 : value;
}

/**
 * 放射状リング配置を生成する。生成時に各帯の内外半径・中央半径・収容上限を一度だけ求める。
 */
export function createSunflowerRingPlacement(
  options: SunflowerRingPlacementOptions,
): SunflowerRingPlacement {
  const { centerX, centerZ, radiusMin, radiusMax, ringCount, minSpacing } = options;
  if (!Number.isInteger(ringCount) || ringCount <= 0) {
    throw new Error(`帯の数は正の整数でなければなりません（受領: ${ringCount}）`);
  }
  if (!(radiusMax > radiusMin) || radiusMin < 0) {
    throw new Error(`半径は 0 以上かつ 最大>最小 でなければなりません（受領: 最小 ${radiusMin}・最大 ${radiusMax}）`);
  }
  if (!(minSpacing > 0)) {
    throw new Error(`最小間隔は正でなければなりません（受領: ${minSpacing}）`);
  }

  const bandWidth = (radiusMax - radiusMin) / ringCount;
  const ringInner: number[] = [];
  const capacity: number[] = [];
  for (let k = 0; k < ringCount; k += 1) {
    const inner = radiusMin + k * bandWidth;
    const outer = inner + bandWidth;
    ringInner.push(inner);
    // 帯（円環領域）の収容上限を面積ベースで決める。帯の面積 π(外半径²−内半径²) を、1個あたりが占める面積（最小間隔の
    // 2乗）で割った数とする。円周ベース（1列ぶん）ではなく面積ベースにすることで、帯の領域を密に敷き詰められる。
    // 最低でも1は置けるようにする。
    const bandArea = Math.PI * (outer * outer - inner * inner);
    capacity.push(Math.max(1, Math.floor(bandArea / (minSpacing * minSpacing))));
  }

  const ringCounts: number[] = new Array(ringCount).fill(0);
  let placementCounter = 0;
  let overflowCount = 0;

  function place(accuracy: number): { x: number; z: number } {
    const acc = clamp01(accuracy);
    // 正確さ1で最も内側（帯0）、0で最も外側（帯 ringCount-1）。
    let targetRing = Math.floor((1 - acc) * ringCount);
    if (targetRing < 0) {
      targetRing = 0;
    } else if (targetRing > ringCount - 1) {
      targetRing = ringCount - 1;
    }
    // 目標帯から外向きに、空きのある最初の帯を探す（満杯帯はその外側の最も近い帯へ送る）。
    let ring = targetRing;
    while (ring < ringCount && ringCounts[ring] >= capacity[ring]) {
      ring += 1;
    }

    // 角度は黄金角の決定的数列で与える（散らばって見えるが乱数ではない。Math.random は使わない方針）。
    const angle = (placementCounter * GOLDEN_ANGLE) % TAU;
    placementCounter += 1;

    let radius: number;
    if (ring >= ringCount) {
      // すべての帯が満杯。最大半径の外側へ置く（安全側）。重ならないよう外向きへ最小間隔ずつ広げる。
      const overflowFraction = (overflowCount * GOLDEN_RATIO_CONJUGATE) % 1;
      radius =
        radiusMax + minSpacing * (0.5 + overflowFraction) + Math.floor(overflowCount / ringCount) * minSpacing;
      overflowCount += 1;
    } else {
      // 帯（内外2つの同心円で囲まれる円環領域）の内部に、面積的に均一へ散らす。半径は面積一様（内外半径の二乗を線形
      // 補間して平方根を取る）で与え、補間の割合は黄金比共役の低食い違い列にする。これにより、置く数が少なくても円環の
      // 面積全体へ広がり（内側に固まらない）、数が増えるほど隙間を埋めて密になる。これを黄金角の角度と組み合わせると、
      // 円環の面積全体へよく散らばる（同一半径の同心円上に偏らない）。
      const fillIndex = ringCounts[ring];
      ringCounts[ring] += 1;
      const inner = ringInner[ring];
      const outer = inner + bandWidth;
      const areaFraction = ((fillIndex + 0.5) * GOLDEN_RATIO_CONJUGATE) % 1;
      radius = Math.sqrt(inner * inner + areaFraction * (outer * outer - inner * inner));
    }

    return {
      x: centerX + radius * Math.cos(angle),
      z: centerZ + radius * Math.sin(angle),
    };
  }

  function reset(): void {
    ringCounts.fill(0);
    placementCounter = 0;
    overflowCount = 0;
  }

  return {
    place,
    reset,
    ringCapacities: () => capacity.slice(),
  };
}
