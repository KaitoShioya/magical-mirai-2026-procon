// 結果画面（成果物タスク #71）。楽曲終了後、湖の情景（ライブの3D描画）の上に薄く重ねてスコア・ランク・百分位を表示し、
// 「保存・共有」で現在のカメラ構図の成果物画像を共有または保存する。撮影モード（#68）の開始・終了を進入・退出で結線する。
// 「タイトルに戻る」で再挑戦状態を経て題名へ戻る。
//
// 画面を透過にする理由を先に述べる。コンセプト §13 は「楽曲終了後、プレイヤーがカメラを調整して写真に保存する」と定め、
// 結果画面ではライブの3D情景を見せながらカメラを手で動かす。よって本画面は背面の描画を覆わず、空き領域はポインタを
// 透過させて撮影モードの操作（背面のカメラ操作）へ届け、スコアの欄とボタンだけがポインタを受ける。
//
// 百分位が作品内推定（固定分布）で実際のオンライン順位ではない旨（Issue #66）を本画面に明記する。文言は得点ロジックを持つ
// scoring が所有する表示用定数 PERCENTILE_ESTIMATE_DISCLAIMER を取り込む（論理ではなく文言の取り込みのため src/screens/README.md の依存規則に整合）。
// 表示文字列は scoring の単一整形 formatResultText を用い、成果物画像の焼き込みと同じ関数を通すことで数値の一致を担保する。

import type { Screen, ScreenContext, ScreenFactory } from "./types";
import { PERCENTILE_ESTIMATE_DISCLAIMER, formatResultText } from "../scoring";

export const createResultScreen: ScreenFactory = (context: ScreenContext): Screen => {
  const element = document.createElement("section");
  element.className = "screen screen--result";
  element.dataset.screen = "result";

  // 上部のスコアの欄（ポインタを受ける）。
  const scorePanel = document.createElement("div");
  scorePanel.className = "screen__result-panel screen__result-panel--top";

  // スコア欄を畳む閉じるボタン。畳むと情景が広く見え、撮影の構図を決めやすくなる。data-no-camera で撮影操作の対象から除く。
  const closeButton = document.createElement("button");
  closeButton.className = "screen__result-close";
  closeButton.type = "button";
  closeButton.dataset.action = "close-result-panel";
  closeButton.dataset.noCamera = "";
  closeButton.setAttribute("aria-label", "スコア表示を閉じる");
  closeButton.textContent = "✕";

  const heading = document.createElement("h1");
  heading.className = "screen__title screen__result-heading";
  heading.textContent = "結果";

  const scoreRow = document.createElement("p");
  scoreRow.className = "screen__text";
  scoreRow.dataset.role = "result-score";

  const rankRow = document.createElement("p");
  rankRow.className = "screen__text";
  rankRow.dataset.role = "result-rank";

  const percentileRow = document.createElement("p");
  percentileRow.className = "screen__text";
  percentileRow.dataset.role = "result-percentile";

  // 百分位の注意文言（Issue #66）。後続の結果画面（Issue #74）へ引き継ぐため、本画面でも表示する。
  const disclaimer = document.createElement("p");
  disclaimer.className = "screen__text screen__result-disclaimer";
  disclaimer.dataset.role = "percentile-disclaimer";
  disclaimer.textContent = PERCENTILE_ESTIMATE_DISCLAIMER;

  scorePanel.append(heading, scoreRow, rankRow, percentileRow, disclaimer);

  // 撮影の案内（ライブの情景をカメラで調整して保存できることを伝える）。
  const photoHint = document.createElement("p");
  photoHint.className = "screen__text screen__result-hint";
  photoHint.textContent = "画面をなぞってカメラを動かし、好みの構図で保存できます。";
  scorePanel.append(closeButton, photoHint);

  // スコア欄を畳んだときに再表示するためのボタン（畳むまでは隠す）。撮影操作の対象から除く。
  const reopenButton = document.createElement("button");
  reopenButton.className = "screen__button screen__result-reopen";
  reopenButton.type = "button";
  reopenButton.dataset.action = "reopen-result-panel";
  reopenButton.dataset.noCamera = "";
  reopenButton.textContent = "スコアを表示";
  reopenButton.hidden = true;

  // 下部のボタンの欄（ポインタを受ける）。
  const buttonBar = document.createElement("div");
  buttonBar.className = "screen__result-panel screen__result-panel--bottom";

  // 保存・共有ボタン（成果物タスク #70）。押下で現在の構図の画像を作って共有または保存する。
  // data-no-camera を付ける理由を先に述べる。撮影モード（#68）の操作がボタン押下をカメラ操作と誤認しないよう、
  // 撮影モードの結線側がこの目印で操作対象から除く。
  const saveShareButton = document.createElement("button");
  saveShareButton.className = "screen__button";
  saveShareButton.type = "button";
  saveShareButton.dataset.action = "save-share";
  saveShareButton.dataset.noCamera = "";
  saveShareButton.textContent = "保存・共有";

  const returnButton = document.createElement("button");
  returnButton.className = "screen__button";
  returnButton.type = "button";
  returnButton.dataset.action = "return-title";
  returnButton.dataset.noCamera = "";
  returnButton.textContent = "タイトルに戻る";

  buttonBar.append(saveShareButton, returnButton);
  element.append(scorePanel, reopenButton, buttonBar);

  const onReturnTitle = (): void => {
    context.requestTransition("retry");
  };

  // スコア欄の表示・非表示を切り替える。畳むと情景が広く見え、撮影しやすくなる。再表示で元へ戻す。
  const onClosePanel = (): void => {
    scorePanel.hidden = true;
    reopenButton.hidden = false;
  };
  const onReopenPanel = (): void => {
    scorePanel.hidden = false;
    reopenButton.hidden = true;
  };

  // 確定スコアの写しをDOMへ反映する。値が無いときは欄を空にする。
  const renderScores = (): void => {
    const snapshot = context.result?.getFinalResult() ?? null;
    if (snapshot === null) {
      scoreRow.textContent = "";
      rankRow.textContent = "";
      percentileRow.textContent = "";
      return;
    }
    const text = formatResultText(snapshot);
    scoreRow.textContent = `スコア ${text.scoreText}`;
    rankRow.textContent = `ランク ${text.rankText}`;
    percentileRow.textContent = text.percentileText;
  };

  // 保存・共有。利用者の操作の活性化が切れないよう、押下ハンドラ内で画像化と共有を長い待機を入れず連続実行する。
  const onSaveShare = (): void => {
    const result = context.result;
    if (!result) {
      return;
    }
    // 二重押下を防ぐため処理中は無効化する。
    saveShareButton.disabled = true;
    void (async (): Promise<void> => {
      try {
        const blob = await result.captureArtifact();
        await result.shareArtifact(blob);
      } finally {
        saveShareButton.disabled = false;
      }
    })();
  };

  return {
    element,
    onEnter(): void {
      renderScores();
      // 進入時はスコア欄を表示・再表示ボタンは隠す（再進入で前回の畳んだ状態を持ち越さない）。
      scorePanel.hidden = false;
      reopenButton.hidden = true;
      // 撮影モード（#68）を始める（結果画面でのみライブの情景をカメラで動かせるようにする）。
      context.result?.beginPhotoMode();
      saveShareButton.addEventListener("click", onSaveShare);
      returnButton.addEventListener("click", onReturnTitle);
      closeButton.addEventListener("click", onClosePanel);
      reopenButton.addEventListener("click", onReopenPanel);
    },
    onUpdate(): void {
      // 結果画面は時間進行を持たない（撮影モードのカメラ操作は別系統で駆動する）。
    },
    onExit(): void {
      // 撮影モードを終える。
      context.result?.endPhotoMode();
      saveShareButton.removeEventListener("click", onSaveShare);
      returnButton.removeEventListener("click", onReturnTitle);
      closeButton.removeEventListener("click", onClosePanel);
      reopenButton.removeEventListener("click", onReopenPanel);
    },
  };
};
