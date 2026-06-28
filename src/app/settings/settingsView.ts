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
  /** 保存済みの操作音ON/OFFを読む（初期状態に使う）。 */
  loadSoundEnabled(): boolean;
  /** 操作音ON/OFFを保存する。 */
  saveSoundEnabled(enabled: boolean): void;
  /** 操作音ON/OFFを操作音エンジンへ反映する。 */
  setSoundEnabled(enabled: boolean): void;
  /** 較正を開く。 */
  openCalibration(): void;
  /** クレジットを開く。 */
  openCredits(): void;
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

  // 操作音のON/OFF。チェックを入れると鳴らす。初期状態は保存済みの選択を反映する。
  const soundRow = document.createElement("label");
  soundRow.className = "settings-panel__row";
  const soundCheckbox = document.createElement("input");
  soundCheckbox.type = "checkbox";
  soundCheckbox.className = "settings-panel__checkbox";
  soundCheckbox.dataset.role = "sound-enabled";
  soundCheckbox.checked = deps.loadSoundEnabled();
  const soundText = document.createElement("span");
  soundText.className = "settings-panel__row-text";
  soundText.textContent = "操作音を鳴らす";
  soundRow.append(soundCheckbox, soundText);

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
    panel.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    closeButton.focus();
  }

  function close(): void {
    panel.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    toggle.focus();
  }

  const onToggleClick = (): void => {
    if (panel.hidden) {
      open();
    } else {
      close();
    }
  };
  const onCloseClick = (): void => {
    close();
  };
  const onSoundChange = (): void => {
    const enabled = soundCheckbox.checked;
    deps.saveSoundEnabled(enabled);
    deps.setSoundEnabled(enabled);
  };
  const onCalibrationClick = (): void => {
    close();
    deps.openCalibration();
  };
  const onCreditsClick = (): void => {
    close();
    deps.openCredits();
  };
  // Escキーは、開いている間だけ閉じる。閉じている間はゲームの操作を妨げない。
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && !panel.hidden) {
      close();
    }
  };

  toggle.addEventListener("click", onToggleClick);
  closeButton.addEventListener("click", onCloseClick);
  soundCheckbox.addEventListener("change", onSoundChange);
  calibrationButton.addEventListener("click", onCalibrationClick);
  creditsButton.addEventListener("click", onCreditsClick);
  document.addEventListener("keydown", onKeyDown);

  host.append(toggle, panel);

  return {
    close(): void {
      // 開いているときだけ閉じる。閉じているときに焦点を奪わないため、内部の close は呼ばない。
      if (!panel.hidden) {
        close();
      }
    },
    dispose(): void {
      toggle.removeEventListener("click", onToggleClick);
      closeButton.removeEventListener("click", onCloseClick);
      soundCheckbox.removeEventListener("change", onSoundChange);
      calibrationButton.removeEventListener("click", onCalibrationClick);
      creditsButton.removeEventListener("click", onCreditsClick);
      document.removeEventListener("keydown", onKeyDown);
      toggle.remove();
      panel.remove();
    },
  };
}
