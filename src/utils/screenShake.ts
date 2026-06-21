// 画面拡大・減衰揺れの純粋な演出評価器（曲非依存・Issue #76）。
// 拍ごとに画面を一瞬拡大し、拡大は長い余韻で、揺れは短い衝撃で減衰させる。three.js もDOMも import せず、
// (拍の発火, 現在時刻, 画面寸法) から画面空間の相似変換（倍率と画素移動）だけを計算する。
//
// 配置の理由を先に述べる。本モジュールは時刻に基づく純粋な数値計算であり、rendering は「時刻の論理を
// 持たない」（docs/decisions/architecture.md §3.3・§5）ため rendering には置かない。src/utils の責務は
// 「数値計算・イベントの仲介」を含み（src/utils/README.md）、拍同期スケジューラ（#16）やカメラ軌跡評価器
// （#13）と同じ配置とする。実際に変換を canvas へ当てるのは描画基盤（renderRoot.setScreenTransform）で、
// 拍の発火を供給するのは統括（src/app）と診断ページである。
//
// 時刻の単位はミリ秒で統一する。理由を先に述べる。拍時刻（beatScheduler の timeMs）と再生位置
// （world.gameTimeMs）がともにミリ秒であり、単位変換を挟まない。
// 寸法と移動量の単位はCSS画素で統一する。理由を先に述べる。描画基盤がこの変換を canvas の表示変換
// （CSSのtransform）として当て、移動量・canvas表示寸法・動きを減らす設定の判定がいずれもCSS画素を
// 単位とするため、画素密度の高い端末でも換算を挟まない。

/** 画面空間の相似変換。原点は画面中心。倍率と画素移動を持つ。 */
export interface ScreenTransform {
  /** 拡大倍率（1以上）。 */
  scale: number;
  /** 横方向の移動量（CSS画素、倍率の後段に加わる平行移動）。 */
  offsetX: number;
  /** 縦方向の移動量（CSS画素、倍率の後段に加わる平行移動）。 */
  offsetY: number;
}

/** 小節頭の拍の拡大量。倍率は 1 + 拡大量。
 *  採用理由: Issue #76 の範囲「1.05〜1.15倍」（拡大量0.05〜0.15）の内側に収め、小節頭を強くする。★暫定。 */
export const BEAT_AMPLITUDE_DOWNBEAT = 0.12;

/** 小節頭以外の拍の拡大量。
 *  採用理由: 同じ帯の内側で小節頭より弱くし、単調さを避ける（研究 docs/research/02-non-text-expression.md §1）。★暫定。 */
export const BEAT_AMPLITUDE_OFFBEAT = 0.05;

/** 拡大の減衰の時定数（ミリ秒、指数関数が約0.368へ下がる時間）。
 *  採用理由: Issue #76 が時定数200〜300ミリ秒と与えるため中央値250を採る。拡大は揺れより長く緩く残り、
 *  毎分175拍（1拍342.9ミリ秒）では次拍まで完全には戻らず連続した緩いパルス＝疾走感の土台になる。★暫定。 */
export const DECAY_ZOOM_TAU_MS = 250;

/** 揺れの減衰の時定数（ミリ秒）。
 *  採用理由: 研究§2は各揺れの出来事を80〜150ミリ秒に収めると定める。指数減衰は3×時定数で約5パーセント
 *  （視認上ほぼ消える）に達するため、3×時定数=150ミリ秒となる50を採り、揺れが150ミリ秒で消えるようにする。★暫定。 */
export const DECAY_SHAKE_TAU_MS = 50;

/** 揺れ係数（揺れの移動量が画面外余白に占める割合の上限、0以上1未満）。
 *  採用理由: 1未満なら移動量が余白未満になり画面端に隙間が出ない。0.6は揺れを感じる大きさを保ちつつ、
 *  画素の丸めでも1画素の隙間が出ないよう4割の余裕を残す値である。★暫定。 */
export const SHAKE_MARGIN_FRACTION = 0.6;

/** 揺れの振動周期（ミリ秒）。
 *  採用理由: 二条件で50を採る。条件1（揺れに見える）: 包絡が約10パーセントへ下がる時刻は 50×ln(10)≒115
 *  ミリ秒で、周期50なら約2.3回振動して一発のずれでなく揺れと読める。条件2（毎秒60フレームで滑らか）:
 *  1フレーム約16.7ミリ秒で、周期50は1周期あたり約3.0回標本化され粗いちらつきを避けられる。★暫定。 */
export const SHAKE_OSCILLATION_PERIOD_MS = 50;

/** 揺れ方向を拍ごとに散らす角度（ラジアン、黄金角 π(3-√5)）。
 *  採用理由: 連続する拍で方向が一方へ偏らず満遍なく散る。乱数を使わず拍の索引から決定的に定め、検証を再現可能にする。 */
export const GOLDEN_ANGLE_RAD = Math.PI * (3 - Math.sqrt(5));

/** 拡大強度がこの値以下なら恒等へ吸着する閾値（拡大量）。
 *  採用理由: 0.0005（倍率で0.05パーセント）は視認できない拡大であり、ここで恒等へ丸めると、拡大していない
 *  大半のフレームで変換が恒等で一定になり、描画基盤側の「前回値と一致なら書き換えない」省略が効く。
 *  この拡大では揺れの移動量も余白の0.6倍＝0.15画素未満であり、移動も視認できないため同時に恒等とできる。 */
const ZOOM_IDENTITY_EPSILON = 0.0005;

/** 倍率の丸めの小数桁数（4桁＝0.01パーセント、視認できない精度）。微小なちらつきを止め、前回値一致の判定を有効にする。 */
const SCALE_DECIMALS = 4;
/** 移動量の丸めの小数桁数（1桁＝0.1画素、視認できない精度）。 */
const OFFSET_DECIMALS = 1;

const IDENTITY: ScreenTransform = { scale: 1, offsetX: 0, offsetY: 0 };

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** 値の大きさを上限以内に切り詰める（上限は0以上）。符号は保つ。 */
function clampMagnitude(value: number, limit: number): number {
  if (value > limit) {
    return limit;
  }
  if (value < -limit) {
    return -limit;
  }
  return value;
}

/** 拍の最小情報（小節内位置のみ）。profiles を import せず構造的に受ける。 */
interface BeatPositionLike {
  position: number;
}

/**
 * 拍配列から拍ごとの拡大量配列を前計算する。
 * 小節頭の判定は減少検出による。小節内では拍位置が増え、小節境界で先頭値へ戻る（出典 docs/analysis/takeover.songmap.json）。
 * 「曲頭の索引0」と「拍位置が前の拍より小さくなる点」を小節頭とみなせば、拍位置の起点（0でも1でも）と小節長
 * （アウフタクトや変拍子で異なっても）に依存せず小節頭を判定できる。
 * 拍位置が有限でない異常データは小節頭とみなさない（他拍扱い）。例外を投げず安全側へ倒す。
 */
export function resolveBeatAmplitudes(beats: readonly BeatPositionLike[]): number[] {
  const amplitudes: number[] = [];
  for (let i = 0; i < beats.length; i += 1) {
    const isDownbeat =
      i === 0 ||
      (Number.isFinite(beats[i].position) &&
        Number.isFinite(beats[i - 1].position) &&
        beats[i].position < beats[i - 1].position);
    amplitudes.push(isDownbeat ? BEAT_AMPLITUDE_DOWNBEAT : BEAT_AMPLITUDE_OFFBEAT);
  }
  return amplitudes;
}

/**
 * 画面座標を変換前のcanvas座標へ戻す（操作同期の逆変換）。
 * 順変換は 画面位置 = 中心 + 倍率×(canvas位置 - 中心) + 移動 であり、その逆を返す。
 * 入力結線（#59）がポインタ座標へこれを当ててから判定面写像へ渡すと、拡大中もタップが見えている対象に一致する。
 */
export function inverseScreenPoint(
  transform: ScreenTransform,
  pointerX: number,
  pointerY: number,
  viewportWidthPx: number,
  viewportHeightPx: number
): { x: number; y: number } {
  const centerX = viewportWidthPx / 2;
  const centerY = viewportHeightPx / 2;
  return {
    x: centerX + (pointerX - centerX - transform.offsetX) / transform.scale,
    y: centerY + (pointerY - centerY - transform.offsetY) / transform.scale,
  };
}

/** 画面拡大・減衰揺れの評価器。trigger（拍の登録）・evaluate（変換の評価）・reset（初期化）を持つ。 */
export interface ScreenShake {
  /** 拍を登録する。拡大は最大値で更新、揺れは最新の拍へ貼り直す。 */
  trigger(beatStartTimeMs: number, amplitude: number, beatIndex: number): void;
  /** 現在時刻と画面寸法から変換を評価する。動きを減らす設定が真、または有効な拍が無いとき恒等を返す。 */
  evaluate(
    currentTimeMs: number,
    viewportWidthPx: number,
    viewportHeightPx: number,
    reducedMotion: boolean
  ): ScreenTransform;
  /** 初期状態（基準未確定・恒等）へ戻す。 */
  reset(): void;
  /** 直近 evaluate の結果（診断・契約公開用）。 */
  readonly lastTransform: ScreenTransform;
}

export function createScreenShake(options?: {
  zoomTauMs?: number;
  shakeTauMs?: number;
  shakeMarginFraction?: number;
  shakeOscillationPeriodMs?: number;
}): ScreenShake {
  const zoomTauMs = options?.zoomTauMs ?? DECAY_ZOOM_TAU_MS;
  const shakeTauMs = options?.shakeTauMs ?? DECAY_SHAKE_TAU_MS;
  const shakeMarginFraction = options?.shakeMarginFraction ?? SHAKE_MARGIN_FRACTION;
  const shakePeriodMs = options?.shakeOscillationPeriodMs ?? SHAKE_OSCILLATION_PERIOD_MS;

  // 拡大の状態（最大値更新）。
  let zoomPeak = 0;
  let zoomAnchorMs: number | null = null;
  // 揺れの状態（最新拍へ貼り直し）。
  let shakeAnchorMs: number | null = null;
  let shakeDirX = 0;
  let shakeDirY = 0;
  let shakeStrength = 0;

  let lastTransform: ScreenTransform = IDENTITY;

  function zoomIntensityAt(timeMs: number): number {
    if (zoomAnchorMs === null) {
      return 0;
    }
    // 経過は0以上に丸める。基準は拍開始時刻のため通常は経過0以上だが、時刻が後退しても拡大を増幅させない。
    const elapsed = Math.max(0, timeMs - zoomAnchorMs);
    return zoomPeak * Math.exp(-elapsed / zoomTauMs);
  }

  return {
    trigger(beatStartTimeMs: number, amplitude: number, beatIndex: number): void {
      if (!Number.isFinite(beatStartTimeMs) || !Number.isFinite(amplitude)) {
        return;
      }
      // 拡大は最大値で更新する（強拍直後の弱拍で急に下がらない）。残存強度は新しい拍の時刻で評価する。
      const residual = zoomIntensityAt(beatStartTimeMs);
      zoomPeak = Math.max(amplitude, residual);
      zoomAnchorMs = beatStartTimeMs;
      // 揺れは最新の拍へ貼り直す。方向は黄金角、強さ比は小節頭の拡大量で正規化（0以上1以下に切り詰める）。
      const angle = beatIndex * GOLDEN_ANGLE_RAD;
      shakeDirX = Math.cos(angle);
      shakeDirY = Math.sin(angle);
      shakeStrength = Math.min(1, Math.max(0, amplitude / BEAT_AMPLITUDE_DOWNBEAT));
      shakeAnchorMs = beatStartTimeMs;
    },

    evaluate(
      currentTimeMs: number,
      viewportWidthPx: number,
      viewportHeightPx: number,
      reducedMotion: boolean
    ): ScreenTransform {
      // 動きを減らす設定、時刻が有効でない、拍が未発火のときは恒等。
      if (reducedMotion || !Number.isFinite(currentTimeMs) || zoomAnchorMs === null) {
        lastTransform = IDENTITY;
        return IDENTITY;
      }
      const zoom = zoomIntensityAt(currentTimeMs);
      // 拡大がほぼ消えた領域は恒等へ吸着する（揺れの移動量も余白の0.6倍未満で視認できない）。
      if (zoom <= ZOOM_IDENTITY_EPSILON) {
        lastTransform = IDENTITY;
        return IDENTITY;
      }

      const scale = 1 + zoom;
      // 画面外へ広がる片側余白（画素）。寸法が有効でなければ揺れを出さない（余白0）。
      const usableViewport =
        Number.isFinite(viewportWidthPx) &&
        Number.isFinite(viewportHeightPx) &&
        viewportWidthPx > 0 &&
        viewportHeightPx > 0;
      const marginX = usableViewport ? (zoom / 2) * viewportWidthPx : 0;
      const marginY = usableViewport ? (zoom / 2) * viewportHeightPx : 0;

      let offsetX = 0;
      let offsetY = 0;
      if (marginX > 0 || marginY > 0) {
        const shakeElapsed = shakeAnchorMs === null ? 0 : Math.max(0, currentTimeMs - shakeAnchorMs);
        const envelope = Math.exp(-shakeElapsed / shakeTauMs);
        const osc = Math.sin((2 * Math.PI * shakeElapsed) / shakePeriodMs);
        const factor = shakeMarginFraction * shakeStrength * envelope * osc;
        // |factor| ≤ 0.6 < 1 のため |offset| ≤ margin が常に成り立ち、画面端に隙間が出ない。
        offsetX = factor * marginX * shakeDirX;
        offsetY = factor * marginY * shakeDirY;
      }

      // 実際に当てる倍率（丸めた値）から余白を求め、丸めた移動量をその余白以内へ切り詰める。
      // 採用理由を先に述べる。倍率は4桁・移動量は1桁に丸めるため、丸めの増減で移動量が余白をわずかに
      // 超える境界がありうる。適用する倍率と適用する移動量どうしで切り詰めれば、当てる値で
      // |移動量| ≤ 余白 が厳密に成り立ち、画面端に隙間が出ないことを丸めの後も保証できる。
      const roundedScale = roundTo(scale, SCALE_DECIMALS);
      const appliedMarginX = ((roundedScale - 1) / 2) * (usableViewport ? viewportWidthPx : 0);
      const appliedMarginY = ((roundedScale - 1) / 2) * (usableViewport ? viewportHeightPx : 0);
      const result: ScreenTransform = {
        scale: roundedScale,
        offsetX: clampMagnitude(roundTo(offsetX, OFFSET_DECIMALS), appliedMarginX),
        offsetY: clampMagnitude(roundTo(offsetY, OFFSET_DECIMALS), appliedMarginY),
      };
      lastTransform = result;
      return result;
    },

    reset(): void {
      zoomPeak = 0;
      zoomAnchorMs = null;
      shakeAnchorMs = null;
      shakeDirX = 0;
      shakeDirY = 0;
      shakeStrength = 0;
      lastTransform = IDENTITY;
    },

    get lastTransform(): ScreenTransform {
      return lastTransform;
    },
  };
}
