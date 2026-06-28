// 起動時のローディング表示・楽曲ロード失敗の導線・自動再生がきかないときの「触れて再生」表示。
// これらは画面状態ではないため src/screens に置かない。状態機械が画面表示領域（screen-root）の配下を
// 毎遷移で置換するため、これらの表示は document.body 直下に置いて遷移の影響を受けないようにする。
// ゲーム中の操作情報UI（src/ui、マイルストーンM5）とは別物のため混在させない。

import type { PlaybackState } from "../textalive";
import { createHowToSectionElements } from "./howTo/howToView";

/** 楽曲ロードの支援ページ（トークン入手先・作法）。エラー表示の誘導先にする。 */
const SUPPORT_PAGE_URL = "https://developer.textalive.jp/events/magicalmirai2026/";

export interface OverlayHandlers {
  /** 読み込み失敗の再試行。 */
  onRetry(): void;
}

export interface Overlays {
  /** 読み込み状態に応じてローディング・エラーの表示を出し入れする。 */
  render(state: PlaybackState, handlers: OverlayHandlers): void;
  /** 「触れて再生」表示を出す。操作で onTap を呼ぶ。 */
  showTapToPlay(onTap: () => void): void;
  /** 「触れて再生」表示を消す。 */
  hideTapToPlay(): void;
  /** 後始末。生成した表示要素を取り除く。 */
  dispose(): void;
}

function createPanel(host: HTMLElement, modifier: string): HTMLElement {
  const overlay = document.createElement("div");
  overlay.className = `overlay overlay--${modifier}`;
  overlay.hidden = true;
  const panel = document.createElement("div");
  panel.className = "overlay__panel";
  overlay.append(panel);
  host.append(overlay);
  return overlay;
}

/** 各表示を生成し、出し入れと後始末の手段を返す。 */
export function createOverlays(host: HTMLElement = document.body): Overlays {
  // ---- ローディング表示 ----
  const loading = createPanel(host, "loading");
  const loadingPanel = loading.querySelector(".overlay__panel") as HTMLElement;
  const loadingText = document.createElement("p");
  loadingText.className = "overlay__text";
  loadingText.textContent = "読み込み中…";
  loadingPanel.append(loadingText);
  // ロード中の待機時間に使い方説明（世界観・操作方法・成果物）を見せる。読み込み文言は固定で見せ、
  // 説明だけをスクロール領域に入れて、縦長の小さな画面でも文言が埋もれないようにする（体裁は src/style.css）。
  const loadingHowTo = document.createElement("div");
  loadingHowTo.className = "overlay__howto";
  loadingHowTo.append(...createHowToSectionElements());
  loadingPanel.append(loadingHowTo);

  // ---- エラー表示（設定エラーと読み込み失敗で内容を出し分ける） ----
  const error = createPanel(host, "error");
  const errorPanel = error.querySelector(".overlay__panel") as HTMLElement;
  const errorMessage = document.createElement("p");
  errorMessage.className = "overlay__text";
  const retryButton = document.createElement("button");
  retryButton.className = "overlay__button";
  retryButton.type = "button";
  retryButton.dataset.action = "retry-load";
  retryButton.textContent = "再試行";
  const supportLink = document.createElement("a");
  supportLink.className = "overlay__link";
  supportLink.href = SUPPORT_PAGE_URL;
  supportLink.target = "_blank";
  supportLink.rel = "noopener noreferrer";
  supportLink.textContent = "楽曲ロードの支援ページを開く";
  errorPanel.append(errorMessage, retryButton, supportLink);

  let retryHandler: (() => void) | null = null;
  const onRetryClick = (): void => {
    retryHandler?.();
  };
  retryButton.addEventListener("click", onRetryClick);

  // ---- 「触れて再生」表示 ----
  const tapToPlay = createPanel(host, "tap-to-play");
  const tapPanel = tapToPlay.querySelector(".overlay__panel") as HTMLElement;
  const tapText = document.createElement("p");
  tapText.className = "overlay__text";
  tapText.textContent = "触れて再生";
  tapPanel.append(tapText);

  let tapHandler: (() => void) | null = null;
  const onTapClick = (): void => {
    tapHandler?.();
  };
  tapToPlay.addEventListener("click", onTapClick);

  return {
    render(state, handlers) {
      retryHandler = handlers.onRetry;
      if (state.status === "loading") {
        loading.hidden = false;
        error.hidden = true;
        return;
      }
      if (state.status === "ready") {
        loading.hidden = true;
        error.hidden = true;
        return;
      }
      // エラー。設定エラーは再試行ボタンを出さず設定案内にする。読み込み失敗は再試行ボタンを出す。
      loading.hidden = true;
      error.hidden = false;
      if (state.kind === "config") {
        errorMessage.textContent =
          state.message ??
          "TextAlive のアプリトークンが設定されていません。READMEの手順でトークンを設定してください。";
        retryButton.hidden = true;
      } else {
        errorMessage.textContent =
          "楽曲の読み込みに失敗しました。通信環境を確認して再試行してください。";
        retryButton.hidden = false;
      }
    },
    showTapToPlay(onTap) {
      tapHandler = onTap;
      tapToPlay.hidden = false;
    },
    hideTapToPlay() {
      tapToPlay.hidden = true;
    },
    dispose() {
      retryButton.removeEventListener("click", onRetryClick);
      tapToPlay.removeEventListener("click", onTapClick);
      loading.remove();
      error.remove();
      tapToPlay.remove();
    },
  };
}
