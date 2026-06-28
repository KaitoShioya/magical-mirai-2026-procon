// 結果画面（Issue #74）。プレイの最終スコア・ランク・百分位・自己ベスト履歴を表示し、再挑戦の導線を持つ。
// 地を透過させ、プレイ中に配置された灯し（蝶・ひまわり）の3Dシーンを背景の成果物プレビューとして見せる
// （成果物のPNG書き出し・撮影モード・楽曲終了後の灯し一括演出は別Issue #69/#68/#63 の範囲で本画面には含めない）。
//
// 表示する「今回の結果」は文脈の result.getFinalResult()（プレイ進行セッションの最終結果。端末内保存の可否に依存しない）から、
// 「自己ベスト・成長履歴」は result.getScoreHistory()（端末内に実際に保存された内容を読み出した値）から作る。
// 保存に失敗した回が履歴へ混ざらないよう、両者を別の口から受け取る。
//
// 依存方針: 得点の論理は持たず、表示用の値・文言・表示部品だけを取り込む（src/screens/README.md の依存規則に整合）。
// 百分位が作品内推定（固定分布）で実際のオンライン順位ではない旨（Issue #66）を明記する。文言は scoring が所有する
// PERCENTILE_ESTIMATE_DISCLAIMER を取り込む。自己ベスト・成長履歴の表示部品 renderScoreHistory と百分位の整形 formatPercentile は
// src/ui の表示部品を取り込む（scoreHistoryView は結果画面が載せることを前提に作られている）。

import type { Screen, ScreenContext, ScreenFactory } from "./types";
import { PERCENTILE_ESTIMATE_DISCLAIMER } from "../scoring";
import { renderScoreHistory, formatPercentile } from "../ui/scoreHistoryView";

// 数値が無い・非有限のときの代替表示。得点・ランク・百分位のいずれにも使う。
const PLACEHOLDER = "—";

// 1項目（見出しと値）の行を作る。見出しは小さく、値を大きく見せる。
function statRow(labelText: string, valueText: string, valueRole: string): HTMLElement {
  const row = document.createElement("div");
  row.className = "result-stat";

  const label = document.createElement("span");
  label.className = "result-stat__label";
  label.textContent = labelText;

  const value = document.createElement("span");
  value.className = "result-stat__value";
  value.dataset.role = valueRole;
  value.textContent = valueText;

  row.append(label, value);
  return row;
}

export const createResultScreen: ScreenFactory = (context: ScreenContext): Screen => {
  const element = document.createElement("section");
  element.className = "screen screen--result";
  element.dataset.screen = "result";

  // 半透明パネルで得点群をまとめ、暗い湖の情景の上でも読めるようにする（体裁は src/style.css の .result-panel）。
  const panel = document.createElement("div");
  panel.className = "result-panel";

  const heading = document.createElement("h1");
  heading.className = "screen__title";
  heading.textContent = "結果";

  // 今回の結果。プレイ未完了の異常時は null のため、各値を代替表示にして遷移だけは成立させる。
  const result = context.result?.getFinalResult() ?? null;
  const scoreText = result !== null ? String(Math.round(result.totalScore)) : PLACEHOLDER;
  const rankText = result !== null ? result.rank : PLACEHOLDER;
  const percentileText = result !== null ? formatPercentile(result.percentile) : PLACEHOLDER;

  const score = statRow("スコア", scoreText, "score");
  const rank = statRow("ランク", rankText, "rank");
  const percentile = statRow("百分位", percentileText, "percentile");

  // 百分位の注意文言（Issue #66）。data-role はスモークが辿る契約のため維持する。
  const disclaimer = document.createElement("p");
  disclaimer.className = "screen__text";
  disclaimer.dataset.role = "percentile-disclaimer";
  disclaimer.textContent = PERCENTILE_ESTIMATE_DISCLAIMER;

  // 自己ベストと成長履歴（Issue #67）。保存済みの内容を読み出した値を表示部品へ渡す。記録が無ければ null で「記録なし」表示。
  const history = document.createElement("div");
  history.className = "result-history";
  renderScoreHistory(history, context.result?.getScoreHistory() ?? null);

  // 「もう一度」は同じ曲の再プレイのためウォームアップへ戻す（許可遷移 result→warmup）。
  const replayButton = document.createElement("button");
  replayButton.className = "screen__button";
  replayButton.type = "button";
  replayButton.dataset.action = "replay";
  replayButton.textContent = "もう一度";

  // 「タイトルに戻る」は再挑戦状態を経て題名へ戻す（result→retry→title）。
  const returnButton = document.createElement("button");
  returnButton.className = "screen__button";
  returnButton.type = "button";
  returnButton.dataset.action = "return-title";
  returnButton.textContent = "タイトルに戻る";

  const buttons = document.createElement("div");
  buttons.className = "result-buttons";
  buttons.append(replayButton, returnButton);

  panel.append(heading, score, rank, percentile, disclaimer, history, buttons);
  element.append(panel);

  const onReplay = (): void => {
    context.requestTransition("warmup");
  };
  const onReturnTitle = (): void => {
    context.requestTransition("retry");
  };

  return {
    element,
    onEnter(): void {
      replayButton.addEventListener("click", onReplay);
      returnButton.addEventListener("click", onReturnTitle);
    },
    onUpdate(): void {
      // 結果画面は時間進行を持たない。
    },
    onExit(): void {
      replayButton.removeEventListener("click", onReplay);
      returnButton.removeEventListener("click", onReturnTitle);
    },
  };
};
