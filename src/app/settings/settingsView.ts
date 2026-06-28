// 設定画面（Issue #77）。操作音のON/OFF、較正のやり直し、クレジット表示への到達を1つの常設トグルへまとめる。
// 画面状態は増やさず、文書本体直下の常設トグルとパネルとして置く（credits/calibration/howTo と同じ作法）。
// 較正・クレジットは既存ビューを開く。同じ重なり順のパネルが重ならないよう、開く前に設定パネル自身を閉じる。

/** 設定画面の外部契約。 */
export interface SettingsView {
  /** 設定パネルが開いていれば閉じる（プレイ突入時に閉じるため。Issue #112）。 */
  close(): void;
  /** 後始末。生成した表示要素と取り付けた監視を取り除く。 */
  dispose(): void;
}

/** 設定画面の注入依存。保存・反映・他画面を開く副作用を差し替え可能にする。 */
export interface SettingsViewDeps {
  /** 保存済みの操作音の音量（0〜100）を読む（つまみの初期位置に使う）。 */
  loadSoundVolume(): number;
  /** 操作音の音量（0〜100）を保存する。 */
  saveSoundVolume(volume: number): void;
  /** 操作音の音量（0〜100）を操作音エンジンへ反映する。 */
  setSoundVolume(volume: number): void;
  /** 較正を開く。 */
  openCalibration(): void;
  /** クレジットを開く。 */
  openCredits(): void;
  /** 他の全画面パネル（クレジット・較正・使い方説明）を閉じる。設定パネルを開く前に呼び、同じ重なり順のパネルの二重表示を防ぐ。 */
  closeOtherPanels(): void;
}

/**
 * 設定画面を生成して host（既定は document.body）へ取り付ける。
 * 小さな開閉ボタンと、初期は隠したパネルを作り、ボタンで開閉する。開閉ボタンは常に操作を受け取る。
 */
export function createSettingsView(
  deps: SettingsViewDeps,
  host: HTMLElement = document.body
): SettingsView {
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "settings-toggle";
  toggle.textContent = "設定";
  toggle.setAttribute("aria-haspopup", "dialog");
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-label", "設定を開く");

  const panel = document.createElement("div");
  panel.className = "settings-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "設定");
  panel.hidden = true;

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "settings-panel__close";
  closeButton.textContent = "閉じる";
  closeButton.setAttribute("aria-label", "設定を閉じる");

  const title = document.createElement("h1");
  title.className = "settings-panel__title";
  title.textContent = "設定";

  // 操作音の音量つまみ。0で無音、100で最大。初期位置は保存済みの音量を反映する。0にできることで効果音のOFFを満たす。
  const soundRow = document.createElement("label");
  soundRow.className = "settings-panel__row";
  const soundText = document.createElement("span");
  soundText.className = "settings-panel__row-text";
  soundText.textContent = "操作音の音量";
  const soundSlider = document.createElement("input");
  soundSlider.type = "range";
  soundSlider.min = "0";
  soundSlider.max = "100";
  soundSlider.step = "1";
  soundSlider.className = "settings-panel__slider";
  soundSlider.dataset.role = "sound-volume";
  soundSlider.value = String(deps.loadSoundVolume());
  soundSlider.setAttribute("aria-label", "操作音の音量");
  soundRow.append(soundText, soundSlider);

  // 較正のやり直し。設定パネルを閉じてから較正を開く（パネルの重なりを避けるため）。
  const calibrationButton = document.createElement("button");
  calibrationButton.type = "button";
  calibrationButton.className = "settings-panel__button";
  calibrationButton.dataset.action = "open-calibration";
  calibrationButton.textContent = "タイミング較正をやり直す";

  // クレジット表示への到達。設定パネルを閉じてからクレジットを開く。
  const creditsButton = document.createElement("button");
  creditsButton.type = "button";
  creditsButton.className = "settings-panel__button";
  creditsButton.dataset.action = "open-credits";
  creditsButton.textContent = "クレジットを見る";

  panel.append(closeButton, title, soundRow, calibrationButton, creditsButton);

  function open(): void {
    // 同じ重なり順の他のパネルが開いていれば閉じてから開き、パネルの二重表示を防ぐ。
    deps.closeOtherPanels();
    panel.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    closeButton.focus();
  }

  // focusToggle が真のときだけトグルへ焦点を戻す（利用者がトグル・閉じる・Esc で閉じたとき）。
  // 偽のときはトグルへ焦点を戻さない（プレイ突入時の自動クローズではトグルがCSSで非表示になり得るため、非表示要素へ
  // 焦点を残さない）。
  function close(focusToggle: boolean): void {
    panel.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
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
  const onSoundInput = (): void => {
    const volume = Number(soundSlider.value);
    deps.saveSoundVolume(volume);
    deps.setSoundVolume(volume);
  };
  const onCalibrationClick = (): void => {
    // 設定パネルを閉じてから較正を開く。開いた較正がトグルへ焦点を移すため、設定トグルへ焦点を戻さない。
    close(false);
    deps.openCalibration();
  };
  const onCreditsClick = (): void => {
    close(false);
    deps.openCredits();
  };
  // Escキーは、開いている間だけ閉じる。閉じている間はゲームの操作を妨げない。
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && !panel.hidden) {
      close(true);
    }
  };

  toggle.addEventListener("click", onToggleClick);
  closeButton.addEventListener("click", onCloseClick);
  soundSlider.addEventListener("input", onSoundInput);
  calibrationButton.addEventListener("click", onCalibrationClick);
  creditsButton.addEventListener("click", onCreditsClick);
  document.addEventListener("keydown", onKeyDown);

  host.append(toggle, panel);

  return {
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
      toggle.removeEventListener("click", onToggleClick);
      closeButton.removeEventListener("click", onCloseClick);
      soundSlider.removeEventListener("input", onSoundInput);
      calibrationButton.removeEventListener("click", onCalibrationClick);
      creditsButton.removeEventListener("click", onCreditsClick);
      document.removeEventListener("keydown", onKeyDown);
      toggle.remove();
      panel.remove();
    },
  };
}
