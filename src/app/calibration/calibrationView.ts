// レイテンシ較正のオーバーレイ（Issue #50）。入力の遅れの補正値を、一定周期の点滅と基準音に拍を合わせるタップで
// 測り、確認段階で点滅の一致を見ながらつまみで微調整し、端末内へ保存する。較正方式の正典は
// docs/research/04-ux-and-chart-design.md §1「較正の方法」（4回のタップによる測定と手動の調整つまみ、視覚の一致の
// 即時の手応え）。
//
// 配置と画面状態の理由を先に述べる。題名・ウォームアップ・プレイ・結果・再挑戦の5状態は維持する（Issue #2）ため、
// 較正は新しい画面状態を増やさず、状態機械が置換する画面表示領域の外側（document.body 直下）に重ねる開閉
// オーバーレイにする（src/app/credits/creditsView.ts と同じ作法）。
//
// 依存の理由を先に述べる。副作用や状態を持つ音エンジンと端末内保存は差し替え・検査を容易にするため deps 注入で
// 受け取る。一方、補正値の推定（src/utils/calibrationOffset.ts）は純関数、調整範囲（src/config/tuning.ts）は定数で
// あり、app 層からの直接の取り込みが依存規則（docs/decisions/architecture.md §3）で許される。

import { estimateCalibrationOffsetMs } from "../../utils/calibrationOffset";
import {
  CALIBRATION_OFFSET_DEFAULT_MS,
  CALIBRATION_OFFSET_MIN_MS,
  CALIBRATION_OFFSET_MAX_MS,
  CALIBRATION_OFFSET_STEP_MS,
} from "../../config/tuning";

export interface CalibrationViewDeps {
  /** 音声出力の遅れの参考値（ミリ秒、取得不能なら null）。初期つまみ位置の目安に使い、自動採用はしない。 */
  getOutputLatencyMs(): number | null;
  /** 点滅と同時に鳴らす基準音。音エンジンの発音を束ねて渡す。 */
  playReferenceTone(): void;
  /** 音エンジンを起動する（冪等）。較正開始の操作で呼ぶ。 */
  unlockAudio(): Promise<unknown>;
  /** 保存済みの補正値を読み出す（ミリ秒）。 */
  loadOffsetMs(): number;
  /** 補正値を保存する（ミリ秒）。成功で true。 */
  saveOffsetMs(offsetMs: number): boolean;
}

export interface CalibrationView {
  /** 較正を開く（設定画面から到達するため。Issue #77）。 */
  open(): void;
  /** 較正を閉じる（プレイ突入時に開いていれば閉じるため。Issue #112）。 */
  close(): void;
  /** 後始末。生成した表示要素・取り付けた監視・描画の繰り返しを取り除く。 */
  dispose(): void;
}

// 点滅の周期（ミリ秒）。曲非依存で拍を合わせやすい間隔。詳細な採用理由はプランと §1 に基づく。
const BLINK_PERIOD_MS = 600;
// 点滅の点灯時間（ミリ秒）。周期の一部で、点いた瞬間がはっきり分かる長さ。
const BLINK_FLASH_MS = 140;
// 助走の拍数。4分の4拍子の1小節にあたる慣例的な予備拍で、周期600ミリ秒のテンポに乗るのに十分。
const LEAD_IN_BEATS = 4;
// 測定で集めるタップ数。Issue #50 の規定。
const REQUIRED_TAPS = 4;
// 外れ値とみなす最近傍点滅との差の上限（ミリ秒）。周期600の約3分の1かつ判定外端90の2倍超で、これを超えるタップは
// その点滅を狙っていないとみなす。
const OUTLIER_THRESHOLD_MS = 200;
// 「合った」と知らせる残差の窓（ミリ秒）。満点窓の前後40ミリ秒に合わせ、本番の満点と同じずれ幅で一致を感じられる。
const MATCH_WINDOW_MS = 40;
// 入力時刻と描画時刻の原点が一致しているかを確かめる差の上限（ミリ秒）。pointerdown のハンドラは入力イベントと
// 同じ描画フレーム内で実行されるため、event.timeStamp とハンドラ内の performance.now() の真の差は1点滅周期より
// 十分小さい。これを超える差は両時刻が別の原点であることを直接示す。
const ORIGIN_GAP_LIMIT_MS = BLINK_PERIOD_MS;
// 信頼できる最小の採用サンプル数。4個の中央値は3件以上が正常なときだけ頑健で、2件以下では信頼できない。
const MIN_CONFIDENT_SAMPLES = 3;

type Phase = "idle" | "leadIn" | "measuring" | "confirming";

// 補正値を調整範囲へ収める。つまみの上下限と保存時のクランプを一致させる。
function clampOffset(offsetMs: number): number {
  if (offsetMs < CALIBRATION_OFFSET_MIN_MS) {
    return CALIBRATION_OFFSET_MIN_MS;
  }
  if (offsetMs > CALIBRATION_OFFSET_MAX_MS) {
    return CALIBRATION_OFFSET_MAX_MS;
  }
  return offsetMs;
}

// 数値を整数ミリ秒の文言にする（表示用）。
function formatMs(value: number): string {
  return `${Math.round(value)} ミリ秒`;
}

/**
 * 較正オーバーレイを生成して host（既定は document.body）へ取り付ける。
 * 小さな開閉ボタンと、初期は隠したパネルを作り、待機・助走・測定・確認の段階を内部で進める。
 */
export function createCalibrationView(
  deps: CalibrationViewDeps,
  host: HTMLElement = document.body
): CalibrationView {
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "calibration-toggle";
  toggle.textContent = "較正";
  toggle.setAttribute("aria-haspopup", "dialog");
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-label", "レイテンシ較正を開く");

  const panel = document.createElement("div");
  panel.className = "calibration-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "レイテンシ較正");
  panel.hidden = true;

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "calibration-panel__close";
  closeButton.textContent = "閉じる";
  closeButton.setAttribute("aria-label", "較正を閉じる");

  const heading = document.createElement("h2");
  heading.className = "calibration-panel__heading";
  heading.textContent = "レイテンシ較正";

  // 案内文。段階ごとに書き換える。文言は反応タップの混入を防ぐため確定値にする。
  const instruction = document.createElement("p");
  instruction.className = "calibration-panel__text";

  // 点滅とタップを受ける領域。pointerdown の時刻をここで取る。
  const tapArea = document.createElement("div");
  tapArea.className = "calibration-taparea";
  const blink = document.createElement("div");
  blink.className = "calibration-blink";
  tapArea.append(blink);

  // 確認段階の偏差メーター。中央が残差0で、針が左右にずれて補正の過不足を示す。
  const meter = document.createElement("div");
  meter.className = "calibration-meter";
  meter.hidden = true;
  const meterNeedle = document.createElement("div");
  meterNeedle.className = "calibration-meter__needle";
  meter.append(meterNeedle);
  const meterText = document.createElement("p");
  meterText.className = "calibration-panel__text";
  meterText.hidden = true;

  // 音声出力の遅れの目安と、それをつまみへ入れるボタン（参考値であり自動採用しない）。
  const hintRow = document.createElement("p");
  hintRow.className = "calibration-panel__text";
  const useHintButton = document.createElement("button");
  useHintButton.type = "button";
  useHintButton.className = "calibration-panel__button";
  useHintButton.textContent = "目安をつまみに入れる";

  // 採用中の補正値の表示。
  const currentValue = document.createElement("p");
  currentValue.className = "calibration-panel__text";

  // 補正値のつまみ。範囲と刻みは tuning の定数に従う。
  const slider = document.createElement("input");
  slider.type = "range";
  slider.className = "calibration-slider";
  slider.min = String(CALIBRATION_OFFSET_MIN_MS);
  slider.max = String(CALIBRATION_OFFSET_MAX_MS);
  slider.step = String(CALIBRATION_OFFSET_STEP_MS);
  slider.setAttribute("aria-label", "補正値（ミリ秒）");

  // 測定の信頼度が低いときの注意。
  const confidenceNote = document.createElement("p");
  confidenceNote.className = "calibration-panel__note";
  confidenceNote.hidden = true;

  // 操作ボタン。段階に応じて出し入れする。
  const startButton = document.createElement("button");
  startButton.type = "button";
  startButton.className = "calibration-panel__button";
  startButton.textContent = "較正をはじめる";

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = "calibration-panel__button";
  saveButton.textContent = "保存";
  saveButton.hidden = true;

  const redoButton = document.createElement("button");
  redoButton.type = "button";
  redoButton.className = "calibration-panel__button";
  redoButton.textContent = "やり直し";
  redoButton.hidden = true;

  panel.append(
    closeButton,
    heading,
    instruction,
    tapArea,
    meter,
    meterText,
    hintRow,
    useHintButton,
    currentValue,
    slider,
    confidenceNote,
    startButton,
    saveButton,
    redoButton
  );

  // 内部状態。
  let phase: Phase = "idle";
  let rafId: number | null = null;
  let phaseStartMs = 0;
  let lastBlinkIndex = -1;
  let blinkOffAtMs = 0;
  let blinkTimes: number[] = [];
  let tapTimes: number[] = [];
  let originMismatch = false;

  // つまみの現在値（ミリ秒）。
  function sliderValue(): number {
    return Number(slider.value);
  }

  function updateCurrentValueLabel(): void {
    currentValue.textContent = `採用中の補正値: ${formatMs(sliderValue())}`;
  }

  function updateHintRow(): void {
    // 目安欄を出すのは、つまみを操作する段階（待機での開始前と確認での微調整）に限る。理由を先に述べる。
    // 音声出力の遅れの目安はつまみの参考値であり、タップでリズムを測る助走・測定の間はつまみを触らないため、
    // その間は隠して操作を紛らわしくしない。音エンジン起動完了の通知が助走・測定中に届いた場合もここで隠れる。
    if (phase !== "idle" && phase !== "confirming") {
      hintRow.hidden = true;
      useHintButton.hidden = true;
      return;
    }
    hintRow.hidden = false;
    const hint = deps.getOutputLatencyMs();
    if (hint === null) {
      hintRow.textContent = "音声出力の遅れの目安: 測定できません";
      useHintButton.hidden = true;
      return;
    }
    hintRow.textContent = `音声出力の遅れの目安（参考値）: ${formatMs(hint)}`;
    useHintButton.hidden = false;
  }

  // 案内文を書き換える。
  function setInstruction(text: string): void {
    instruction.textContent = text;
  }

  // 描画の繰り返しを止める。
  function stopLoop(): void {
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
    blink.classList.remove("calibration-blink--on");
  }

  // 待機へ戻す（点滅停止）。notice を与えると案内文を保存結果などの通知に差し替える（後から setInstruction すると
  // この関数が上書きするため、通知は引数で渡して状態遷移と同時に表示する）。
  function enterIdle(notice?: string): void {
    phase = "idle";
    stopLoop();
    meter.hidden = true;
    meterText.hidden = true;
    confidenceNote.hidden = true;
    startButton.hidden = false;
    saveButton.hidden = true;
    redoButton.hidden = true;
    setInstruction(
      notice ?? "点滅に合わせて叩き、遅れを測ります。「較正をはじめる」を押してください。"
    );
    updateHintRow();
    updateCurrentValueLabel();
  }

  // 助走へ入る（点滅開始、測定はしない）。notice を与えると破棄の理由を案内文の先頭に添える（後から setInstruction
  // するとこの関数が上書きするため、理由は引数で渡して状態遷移と同時に表示する）。
  function enterLeadIn(notice?: string): void {
    phase = "leadIn";
    blinkTimes = [];
    tapTimes = [];
    lastBlinkIndex = -1;
    originMismatch = false;
    phaseStartMs = performance.now();
    meter.hidden = true;
    meterText.hidden = true;
    confidenceNote.hidden = true;
    startButton.hidden = true;
    saveButton.hidden = true;
    redoButton.hidden = true;
    // 助走・測定の間は目安欄を隠す（つまみを操作しない段階のため）。
    updateHintRow();
    setInstruction(
      notice
        ? `${notice} もう一度、点滅のリズムを覚えてください。`
        : "点滅のリズムを覚えてください。"
    );
    if (rafId === null) {
      rafId = window.requestAnimationFrame(tick);
    }
  }

  // 測定へ入る（タップ採取開始）。
  function enterMeasuring(): void {
    phase = "measuring";
    tapTimes = [];
    originMismatch = false;
    setInstruction(
      "次に来る点滅を予測して、点滅と同時に叩いてください。光ってから反応するのではありません。"
    );
  }

  // 確認へ入る（偏差メーター表示、微調整・保存）。
  function enterConfirming(): void {
    phase = "confirming";
    meter.hidden = false;
    meterText.hidden = false;
    saveButton.hidden = false;
    redoButton.hidden = false;
    // 確認段階までに音エンジンは起動済みのため、音声出力の遅れの目安を最新化して「目安をつまみに入れる」を出す。
    updateHintRow();
    setInstruction(
      "点滅に合わせて叩き、ずれが中央に寄るようつまみで微調整してください。よければ保存します。"
    );
    showResidual(null);
  }

  // 測定を破棄してやり直す（原点不一致・推定不能）。破棄の理由を助走の案内文へ引き継ぐ。
  function rejectAndRedo(message: string): void {
    enterLeadIn(message);
  }

  // 4タップ集まった後の確定処理。
  function finishMeasuring(): void {
    if (originMismatch) {
      rejectAndRedo("時刻の基準がそろいませんでした。もう一度試してください。");
      return;
    }
    const estimate = estimateCalibrationOffsetMs(blinkTimes, tapTimes, {
      outlierThresholdMs: OUTLIER_THRESHOLD_MS,
      fallbackMs: CALIBRATION_OFFSET_DEFAULT_MS,
    });
    if (estimate.sampleCount === 0) {
      rejectAndRedo("うまく測れませんでした。もう一度試してください。");
      return;
    }
    slider.value = String(clampOffset(estimate.offsetMs));
    updateCurrentValueLabel();
    if (estimate.sampleCount < MIN_CONFIDENT_SAMPLES) {
      confidenceNote.hidden = false;
      confidenceNote.textContent =
        "測定が不安定です。確認で微調整するか、やり直してください。（つまみの値は推定値です）";
    } else {
      confidenceNote.hidden = false;
      confidenceNote.textContent = "つまみの値は推定値です。確認で微調整してください。";
    }
    enterConfirming();
  }

  // 残差を偏差メーターへ表示する。tap が null のときは中央表示に戻す。
  function showResidual(tapTimeMs: number | null): void {
    if (tapTimeMs === null) {
      meterNeedle.style.left = "50%";
      meterText.textContent = "点滅に合わせて叩いてください。";
      return;
    }
    const nearest = nearestBlinkTime(tapTimeMs);
    if (nearest === null) {
      return;
    }
    const residual = tapTimeMs - nearest - sliderValue();
    // 残差を [-OUTLIER, OUTLIER] の範囲で針の左右位置（百分率）へ写す。範囲外は端に張り付かせる。
    const ratio = Math.max(-1, Math.min(1, residual / OUTLIER_THRESHOLD_MS));
    meterNeedle.style.left = `${50 + ratio * 50}%`;
    if (Math.abs(residual) <= MATCH_WINDOW_MS) {
      meterText.textContent = `合っています（ずれ ${formatMs(residual)}）`;
    } else if (residual > 0) {
      meterText.textContent = `タップが遅いです（ずれ ${formatMs(residual)}）`;
    } else {
      meterText.textContent = `タップが早いです（ずれ ${formatMs(residual)}）`;
    }
  }

  // 記録した点滅のうち、指定時刻に最も近いものの時刻を返す。無ければ null。
  function nearestBlinkTime(timeMs: number): number | null {
    let nearest: number | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const blinkTime of blinkTimes) {
      const distance = Math.abs(timeMs - blinkTime);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = blinkTime;
      }
    }
    return nearest;
  }

  // 描画フレームごとの処理。点滅を一定周期で出し、助走から測定への移行を進める。
  function tick(): void {
    const now = performance.now();
    const index = Math.floor((now - phaseStartMs) / BLINK_PERIOD_MS);
    if (index > lastBlinkIndex) {
      lastBlinkIndex = index;
      blinkTimes.push(now);
      blink.classList.add("calibration-blink--on");
      blinkOffAtMs = now + BLINK_FLASH_MS;
      deps.playReferenceTone();
      if (phase === "leadIn" && index >= LEAD_IN_BEATS) {
        enterMeasuring();
      }
    }
    if (now >= blinkOffAtMs) {
      blink.classList.remove("calibration-blink--on");
    }
    rafId = window.requestAnimationFrame(tick);
  }

  // タップ（pointerdown）の処理。時刻は event.timeStamp、同時に performance.now() を取って原点の一致を確かめる。
  function onPointerDown(event: PointerEvent): void {
    const eventTimeMs = event.timeStamp;
    const performanceNowMs = performance.now();
    if (Math.abs(eventTimeMs - performanceNowMs) > ORIGIN_GAP_LIMIT_MS) {
      originMismatch = true;
    }
    if (phase === "measuring") {
      tapTimes.push(eventTimeMs);
      if (tapTimes.length >= REQUIRED_TAPS) {
        finishMeasuring();
      }
    } else if (phase === "confirming") {
      showResidual(eventTimeMs);
    }
  }

  function open(): void {
    panel.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    // 開いた時点では保存済みの値をつまみに反映し、待機段階にする。
    slider.value = String(clampOffset(deps.loadOffsetMs()));
    enterIdle();
    closeButton.focus();
  }

  // focusToggle が真のときだけトグルへ焦点を戻す（利用者がトグル・閉じる・Esc で閉じたとき）。
  // 偽のときはトグルへ焦点を戻さない（プレイ突入時の自動クローズではトグルがCSSで非表示になり得るため、非表示要素へ
  // 焦点を残さない）。
  function close(focusToggle: boolean): void {
    panel.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    enterIdle();
    if (focusToggle) {
      toggle.focus();
    }
  }

  const onToggleClick = (): void => {
    if (panel.hidden) {
      open();
    } else {
      close(true);
    }
  };
  const onCloseClick = (): void => {
    close(true);
  };
  const onStartClick = (): void => {
    // 最初の操作で音エンジンを起動する（冪等）。起動の成否が確定した後に音声出力の遅れの目安を更新する。
    // 理由を先に述べる。起動前は outputLatencyMs が測定不能（null）であり、起動後に再表示しないと目安が出ない。
    // 成功・失敗のいずれでも目安欄を更新するため、解決と拒否の両方で updateHintRow を呼ぶ（拒否の握りつぶしも兼ねる）。
    void deps.unlockAudio().then(updateHintRow, updateHintRow);
    enterLeadIn();
  };
  const onSaveClick = (): void => {
    const saved = deps.saveOffsetMs(sliderValue());
    // 保存結果の案内を待機段階へ引き継ぐ（enterIdle が案内文を上書きするため、結果は引数で渡す）。
    enterIdle(saved ? "保存しました。" : "保存できませんでした。");
  };
  const onRedoClick = (): void => {
    enterLeadIn();
  };
  const onUseHintClick = (): void => {
    const hint = deps.getOutputLatencyMs();
    if (hint === null) {
      return;
    }
    slider.value = String(clampOffset(hint));
    updateCurrentValueLabel();
  };
  const onSliderInput = (): void => {
    updateCurrentValueLabel();
  };
  // Escキーは、開いている間だけ閉じる。閉じている間はゲームの操作を妨げない。
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && !panel.hidden) {
      close(true);
    }
  };

  toggle.addEventListener("click", onToggleClick);
  closeButton.addEventListener("click", onCloseClick);
  startButton.addEventListener("click", onStartClick);
  saveButton.addEventListener("click", onSaveClick);
  redoButton.addEventListener("click", onRedoClick);
  useHintButton.addEventListener("click", onUseHintClick);
  slider.addEventListener("input", onSliderInput);
  tapArea.addEventListener("pointerdown", onPointerDown);
  document.addEventListener("keydown", onKeyDown);

  host.append(toggle, panel);

  return {
    open(): void {
      open();
    },
    close(): void {
      // 開いているときだけ閉じる。プレイ突入時の自動クローズのため、トグルへ焦点を戻さず（close(false)）、
      // パネル内に焦点があれば外す（CSSで非表示になり得る背面へ焦点を残さない）。
      if (!panel.hidden) {
        const active = document.activeElement;
        if (active instanceof HTMLElement && panel.contains(active)) {
          active.blur();
        }
        close(false);
      }
    },
    dispose(): void {
      stopLoop();
      toggle.removeEventListener("click", onToggleClick);
      closeButton.removeEventListener("click", onCloseClick);
      startButton.removeEventListener("click", onStartClick);
      saveButton.removeEventListener("click", onSaveClick);
      redoButton.removeEventListener("click", onRedoClick);
      useHintButton.removeEventListener("click", onUseHintClick);
      slider.removeEventListener("input", onSliderInput);
      tapArea.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      toggle.remove();
      panel.remove();
    },
  };
}
