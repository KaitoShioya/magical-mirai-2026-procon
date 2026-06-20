// 雨パーティクル（環境演出）の本番実装。深夜・雨の湖の世界観を作る（docs/idea/concept-final.md §2）。
// 試作 src/tools/perf/main.ts の雨を本番描画層へ昇格させたもの。判定・得点・時刻の論理を持たず、
// 更新は時間差（ミリ秒）を受け取るだけにする（依存規則 docs/decisions/architecture.md §5）。
// three.js は必要部品のみを名前付きで取り込む（profiles・tools は import しない）。

import { BufferAttribute, BufferGeometry, Points, PointsMaterial } from "three";
import {
  RAIN_AREA_SIZE,
  RAIN_COLOR,
  RAIN_FALL_SPEED_PER_SECOND,
  RAIN_MAX_DELTA_MS,
  RAIN_OPACITY,
  RAIN_PARTICLE_COUNT_DEFAULT,
  RAIN_POINT_SIZE,
  RAIN_WRAP_HEIGHT,
} from "./constants";

/** 雨パーティクルシステムの外部契約。後続Issue（#15層合成・#59通し統合）が object をシーンへ追加して使う。 */
export interface RainSystem {
  /** シーンへ追加する描画対象。粒数0でも有効な Points を返す（頂点数0で何も描画されない）。 */
  readonly object: Points;
  /** 1フレーム分、雨を落下させる。時間差はミリ秒。粒数0または有効な時間差が無いときは何もしない。 */
  update(deltaMs: number): void;
  /** ジオメトリとマテリアルを破棄する。二回以上呼んでも安全（冪等）。 */
  dispose(): void;
}

/**
 * 粒数を安全な値へ正規化する。
 * 採用理由を先に述べる。負・非整数・非数の粒数は型付き配列 Float32Array の確保で例外になる、または
 * 意味を持たないため、安全な値へ畳む。有限の数値は0以上の整数へ切り詰め（負は0＝雨なし）、数値として
 * 解釈できない値（非数・正負の無限大）のときだけ fallback を返す。Number.isFinite を切り詰めの前に使う
 * 理由を先に述べる。Math.trunc(Infinity) は Infinity のままで配列確保を壊すため、先に有限性で無限大を除く。
 * fallback は呼び出し側が有限の非負整数を渡す前提である（本モジュールでは既定粒数か0）。
 */
export function normalizeCount(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.trunc(value));
}

/**
 * 1フレームの時間差を安全な範囲へ正規化する。
 * 採用理由を先に述べる。時間が進んでいない（0以下）または時計の異常（非数・無限大）では位置を動かすべき
 * でなく、極端に大きい時間差は巻き戻しの保証を壊すため、有効な範囲へ畳む。有限かつ正のときだけ上限
 * RAIN_MAX_DELTA_MS（100ミリ秒）で抑え、それ以外は0を返す。上限値の根拠は constants.ts に記す。
 */
export function normalizeDeltaMs(deltaMs: number): number {
  if (Number.isFinite(deltaMs) && deltaMs > 0) {
    return Math.min(deltaMs, RAIN_MAX_DELTA_MS);
  }
  return 0;
}

/**
 * 雨粒の初期位置配列（粒ごとに x・y・z の3要素）を生成する。
 * 粒数は冒頭で normalizeCount(count, 0) により0以上の整数へ畳む。関数内で正規化する理由を先に述べる。
 * createRainSystem 経由では正規化済みの値が渡るが、ユニットテストから直接呼ばれた場合に非数や負の粒数で
 * Float32Array の確保が例外になるのを防ぐ。fallback を0にする理由を先に述べる。位置生成器にとって
 * 解釈できない粒数は「粒なし」が安全側の既定だからである。
 * 各粒の X・Z は中心から±（RAIN_AREA_SIZE/2）、Y は0以上 RAIN_WRAP_HEIGHT 未満に散らす。
 * 乱数源 random を差し替え可能にする理由を先に述べる。ユニットテストで境界値を返す関数を注入し、配置範囲の
 * 端を厳密に検証できるようにするためである。random は Math.random と同じく「0以上1未満」を返す前提とし、
 * 範囲外値への防御はしない（テスト用の差し替え口である）。
 */
export function initRainPositions(count: number, random: () => number = Math.random): Float32Array {
  const particleCount = normalizeCount(count, 0);
  const positions = new Float32Array(particleCount * 3);
  for (let index = 0; index < particleCount; index += 1) {
    positions[index * 3] = (random() - 0.5) * RAIN_AREA_SIZE;
    positions[index * 3 + 1] = random() * RAIN_WRAP_HEIGHT;
    positions[index * 3 + 2] = (random() - 0.5) * RAIN_AREA_SIZE;
  }
  return positions;
}

/**
 * 雨粒のY座標を1フレーム分落下させ、地面（Y<0）に達した粒を上端へ巻き戻す。
 * 時間差は normalizeDeltaMs で畳み、結果が0なら何もしない。
 * 処理する有効粒数は Math.min(Math.max(0, Math.trunc(count)), Math.floor(positions.length / 3)) で確定する。
 * この式にする理由を先に述べる。非整数の count（例として2.7）をそのままループ上限に使うと配列の境界を
 * またいで書き込む恐れがあるため、まず0以上の整数へ畳み、さらに配列が持てる粒数を上限にして範囲外書き込みを
 * 防ぐ。この式は非数の count にも安全である理由を先に述べる。Math.trunc(非数) は非数のままで、それを含む
 * Math.min の結果も非数になり、ループ条件「番号が有効粒数より小さい」が偽になるため、一度も書き込まずに終わる。
 * 落下量は「落下速度（毎秒 RAIN_FALL_SPEED_PER_SECOND）×（畳んだ時間差/1000）」である。1000で割る理由を
 * 先に述べる。落下速度は毎秒のワールド単位であり、時間差はミリ秒で受け取るため、秒へ換算して掛ける。
 * 巻き戻しは Y<0 のとき RAIN_WRAP_HEIGHT を一度だけ加算する（上限100ミリ秒の下で有効範囲へ必ず戻る。
 * 根拠は constants.ts）。
 */
export function stepRainColumn(positions: Float32Array, count: number, deltaMs: number): void {
  const deltaSeconds = normalizeDeltaMs(deltaMs) / 1000;
  if (deltaSeconds === 0) {
    return;
  }
  const effectiveCount = Math.min(Math.max(0, Math.trunc(count)), Math.floor(positions.length / 3));
  const fall = RAIN_FALL_SPEED_PER_SECOND * deltaSeconds;
  for (let index = 0; index < effectiveCount; index += 1) {
    const yIndex = index * 3 + 1;
    let y = positions[yIndex] - fall;
    if (y < 0) {
      y += RAIN_WRAP_HEIGHT;
    }
    positions[yIndex] = y;
  }
}

/**
 * 雨パーティクルシステムを生成する。
 * 粒数は normalizeCount で正規化してから配列長を決める。BufferAttribute は initRainPositions が返した
 * Float32Array と同一の配列を包む。同一参照にする理由を先に述べる。別の配列へ複製すると update の書き換えが
 * 描画へ反映されないため、保持した同一配列を包む。粒数0なら長さ0の配列で頂点数0の Points を返す
 * （three.js は頂点数0を何も描画せず例外も出さないため、視覚的に消滅を満たす）。
 */
export function createRainSystem(options?: { count?: number }): RainSystem {
  const particleCount = normalizeCount(
    options?.count ?? RAIN_PARTICLE_COUNT_DEFAULT,
    RAIN_PARTICLE_COUNT_DEFAULT
  );
  const positions = initRainPositions(particleCount);

  const geometry = new BufferGeometry();
  const positionAttribute = new BufferAttribute(positions, 3);
  geometry.setAttribute("position", positionAttribute);

  const material = new PointsMaterial({
    color: RAIN_COLOR,
    size: RAIN_POINT_SIZE,
    transparent: true,
    opacity: RAIN_OPACITY,
    depthWrite: false,
  });

  const object = new Points(geometry, material);

  let disposed = false;

  return {
    object,
    update(deltaMs: number): void {
      if (disposed) {
        return;
      }
      // 位置が変わらないとき（有効な時間差が無い・粒なし）は書き換え通知もしない。
      if (normalizeDeltaMs(deltaMs) === 0 || particleCount === 0) {
        return;
      }
      stepRainColumn(positions, particleCount, deltaMs);
      positionAttribute.needsUpdate = true;
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      geometry.dispose();
      material.dispose();
    },
  };
}
