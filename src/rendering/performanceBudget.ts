// 性能バジェットの自動劣化制御の判定器（Issue #18）。毎フレームの実経過時間からFPSの時間窓を作り、平均と
// 最低を求め、ヒステリシスと非対称な滞留時間で劣化段階を1段ずつ決める。three.js も window も import しない
// 純粋モジュールであり、node 環境の単体テストで決定的に検証できる（src/rendering/viewport.ts と同じ方針）。
// 描画設定の具体値（画素密度倍率やブルーム）は一切持たない。段階の適用は src/rendering/renderRoot.ts が、
// 段階の数値（描画設定）は src/rendering/constants.ts が持つ。設計の出典は docs/decisions/architecture.md §3.8。

import {
  PERF_DOWNSHIFT_DWELL_MS,
  PERF_DOWNSHIFT_FPS,
  PERF_FRAME_DELTA_CLAMP_MS,
  PERF_MAX_LEVEL,
  PERF_RECOVERY_DWELL_MS,
  PERF_UPSHIFT_FPS,
  PERF_WINDOW_MS,
} from "./constants";

/** recordFrame の戻り値。現在の段階と、この呼び出しで段階が変化したかを返す。 */
export interface PerfBudgetDecision {
  /** 現在の劣化段階（0以上 PERF_MAX_LEVEL 以下）。 */
  level: number;
  /** この呼び出しで段階が変化したなら真。呼び出し側は真のときだけ描画へ適用する。 */
  changed: boolean;
}

/** 診断・検証用の制御器の状態。 */
export interface PerfBudgetState {
  /** 現在の劣化段階。 */
  level: number;
  /** 時間窓内の平均の毎秒フレーム数（標本が無ければ0）。 */
  avgFps: number;
  /** 時間窓内の最低の毎秒フレーム数＝最悪の1フレーム（標本が無ければ0）。 */
  minFps: number;
  /** 時間窓内の標本数。 */
  sampleCount: number;
  /** 時間窓の長さ（ミリ秒）。 */
  windowMs: number;
}

/** 性能バジェット判定器の外部契約。 */
export interface PerfBudget {
  /**
   * 1フレームの実経過時間（ミリ秒）を取り込み、現在の段階と段階変化の有無を返す。
   * 非有限値・0以下は無視し、過大な経過は PERF_FRAME_DELTA_CLAMP_MS で頭打ちにしてから取り込む。
   */
  recordFrame(realDeltaMs: number): PerfBudgetDecision;
  /**
   * 直前に適用した段階変更が、描画上で実際に何かを変えたかを受け取る。
   * 端末の画素密度倍率が1以下で段階0→1が無変化になる場合に、次の下降の滞留を短縮するために使う。
   */
  notifyApplied(effectiveChanged: boolean): void;
  /** 診断・検証用の現在状態を返す。 */
  state(): PerfBudgetState;
  /** 標本（時間窓）を初期化する。段階は保持する。タブ復帰や計測再開で呼ぶ。 */
  reset(): void;
}

// 時間窓に保持する最大フレーム数。採用理由を先に述べる。時間窓2秒のあいだに入りうるフレーム数は端末の
// リフレッシュレートで決まり、512フレーム毎秒でも1024フレームに収まる。この上限を超える極端な高頻度では
// 最古の窓内標本を捨てて最新を残す（直近のFPSを代表させる退避）。
const CAPACITY = 1024;

/**
 * 性能バジェット判定器を生成する。内部時刻は recordFrame に与えられた経過の累積だけで進み、現在時刻にも
 * 乱数にも依存しないため決定的である。
 */
export function createPerfBudget(): PerfBudget {
  // 時間窓の循環バッファ。time は内部累積時刻、delta はその区間の経過時間。
  const times = new Float64Array(CAPACITY);
  const deltas = new Float64Array(CAPACITY);
  let head = 0; // 次に書き込む位置
  let count = 0; // 窓内の標本数
  let runningSum = 0; // 窓内の delta の合計（平均をO(1)で求めるため）

  let nowMs = 0; // 内部累積時刻
  let resetAtMs = 0; // 直近 reset 時点の内部累積時刻（窓が満ちたかの判断に使う）
  let level = 0; // 現在の劣化段階
  // 直近の段階変更の内部時刻。初期は負の無限大にして、最初の判定が滞留で阻まれないようにする。
  let lastChangeMs = Number.NEGATIVE_INFINITY;
  // 次の下降に要する滞留時間。既定は下降の滞留。実効変化なしの下降の後は時間窓まで短縮する。
  let downshiftDwellMs: number = PERF_DOWNSHIFT_DWELL_MS;
  // 直近の下降に対する notifyApplied を待っているか。待機中の通知だけを受け付ける。
  let awaitingApplyResult = false;

  function oldestIndex(): number {
    return (head - count + CAPACITY) % CAPACITY;
  }

  // 時間窓より古い標本を窓から外す。窓内は (nowMs - PERF_WINDOW_MS, nowMs] の区間に保つ。
  function evictOld(): void {
    const cutoff = nowMs - PERF_WINDOW_MS;
    while (count > 0) {
      const idx = oldestIndex();
      if (times[idx] <= cutoff) {
        runningSum -= deltas[idx];
        count -= 1;
      } else {
        break;
      }
    }
  }

  function push(deltaMs: number): void {
    if (count === CAPACITY) {
      // 容量超過時は最古を捨ててから書く（極端な高頻度での退避）。
      const idx = oldestIndex();
      runningSum -= deltas[idx];
      count -= 1;
    }
    times[head] = nowMs;
    deltas[head] = deltaMs;
    head = (head + 1) % CAPACITY;
    count += 1;
    runningSum += deltaMs;
  }

  // 判定を始める条件。reset 以降に時間窓ぶんの時間が経ち、窓に標本があること。起動直後とタブ復帰直後の
  // 雑音を判定から除くために、窓が満ちるまで判定しない。
  function windowReady(): boolean {
    return nowMs - resetAtMs >= PERF_WINDOW_MS && count > 0;
  }

  function currentAvgFps(): number {
    if (count === 0) {
      return 0;
    }
    const meanDelta = runningSum / count;
    return meanDelta > 0 ? 1000 / meanDelta : 0;
  }

  function currentMinFps(): number {
    if (count === 0) {
      return 0;
    }
    let maxDelta = 0;
    let idx = oldestIndex();
    for (let i = 0; i < count; i += 1) {
      if (deltas[idx] > maxDelta) {
        maxDelta = deltas[idx];
      }
      idx = (idx + 1) % CAPACITY;
    }
    return maxDelta > 0 ? 1000 / maxDelta : 0;
  }

  function recordFrame(realDeltaMs: number): PerfBudgetDecision {
    if (!Number.isFinite(realDeltaMs) || realDeltaMs <= 0) {
      return { level, changed: false };
    }
    const clamped = Math.min(realDeltaMs, PERF_FRAME_DELTA_CLAMP_MS);
    nowMs += clamped;
    push(clamped);
    evictOld();

    let changed = false;
    if (windowReady()) {
      const avgFps = currentAvgFps();
      const sinceChangeMs = nowMs - lastChangeMs;
      if (
        avgFps < PERF_DOWNSHIFT_FPS &&
        level < PERF_MAX_LEVEL &&
        sinceChangeMs >= downshiftDwellMs
      ) {
        // 下降。時間窓の平均が下側閾値を下回り続けている。1段だけ下げる。
        level += 1;
        lastChangeMs = nowMs;
        changed = true;
        awaitingApplyResult = true;
        // 既定の滞留へ戻す。実効変化なしの通知が来たら次の下降のために短縮する。
        downshiftDwellMs = PERF_DOWNSHIFT_DWELL_MS;
      } else if (
        avgFps > PERF_UPSHIFT_FPS &&
        level > 0 &&
        sinceChangeMs >= PERF_RECOVERY_DWELL_MS
      ) {
        // 復帰。時間窓の平均が上側閾値を上回り続けている。1段だけ戻す。
        level -= 1;
        lastChangeMs = nowMs;
        changed = true;
        awaitingApplyResult = false;
        downshiftDwellMs = PERF_DOWNSHIFT_DWELL_MS;
      }
    }
    return { level, changed };
  }

  function notifyApplied(effectiveChanged: boolean): void {
    if (!awaitingApplyResult) {
      return;
    }
    awaitingApplyResult = false;
    // 実効変化なしの下降の後は、次の下降を時間窓ぶんだけ待てば許す。窓が満ちる最小時間であり、無変化の段階に
    // 下降の滞留を費やす無駄を避ける。実効変化ありなら既定の下降の滞留へ戻す。
    downshiftDwellMs = effectiveChanged ? PERF_DOWNSHIFT_DWELL_MS : PERF_WINDOW_MS;
  }

  function state(): PerfBudgetState {
    return {
      level,
      avgFps: currentAvgFps(),
      minFps: currentMinFps(),
      sampleCount: count,
      windowMs: PERF_WINDOW_MS,
    };
  }

  function reset(): void {
    head = 0;
    count = 0;
    runningSum = 0;
    resetAtMs = nowMs;
    // 段階は保持する。窓が満ちるまで判定しないため、滞留の基準時刻 lastChangeMs も変えない。
  }

  return { recordFrame, notifyApplied, state, reset };
}
