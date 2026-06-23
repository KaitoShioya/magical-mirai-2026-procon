// 自己ベスト履歴（Issue #67）の受け入れ診断ページ（score-history.html の入口）。
// 保存層（scoreHistoryStore）へ得点を記録し、表示部品（scoreHistoryView）で自己ベストと成長を描く。受け入れ判定の
// 数値は window.__scoreHistoryProbe（描画した文書要素から導く副作用の無い問い合わせ）で公開する。スモークが
// 決定的な得点列を投入できるよう window.__scoreHistoryControl で初期化と1件記録を公開する。本ページは本番ビルド
// （--mode app）では配信しない。
//
// 診断専用の曲キーを使う理由を先に述べる。実在曲（takeover など）のキーを使うと本編の自己ベスト記録を書き換えて
// しまうため、実データに混ざらない専用キー __diagnostic を使い、開始時に初期化する。

import {
  recordPlay,
  loadScoreHistory,
  clearScoreHistory,
} from "../../../scoring/scoreHistoryStore";
import { rankFromScore } from "../../../scoring/rank";
import { renderScoreHistory } from "../../scoreHistoryView";

const DIAGNOSTIC_SONG_KEY = "__diagnostic";

// 表示部品が百分位を扱うため、診断の記録にも妥当な百分位とランクを与える。得点を 0以上1000以下の理論端に対する
// 位置とみなして百分位を作る理由を先に述べる。診断は表示の成立だけを見るため、得点の大小と整合する単調な百分位が
// あれば十分で、本編の理論端（曲プロファイル由来）に厳密一致させる必要はない。
const DIAGNOSTIC_BOUNDS = { min: 0, max: 1000 };

function percentileForScore(totalScore: number): number {
  const span = DIAGNOSTIC_BOUNDS.max - DIAGNOSTIC_BOUNDS.min;
  const ratio = span > 0 ? (totalScore - DIAGNOSTIC_BOUNDS.min) / span : 0;
  return Math.min(100, Math.max(0, ratio * 100));
}

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`#${id} 要素が見つかりません`);
  }
  return element as T;
}

const view = requireElement<HTMLElement>("view");
const hud = requireElement<HTMLElement>("hud");

let nextTimeMs = 1000;

function render(): void {
  renderScoreHistory(view, loadScoreHistory(DIAGNOSTIC_SONG_KEY));
  const history = loadScoreHistory(DIAGNOSTIC_SONG_KEY);
  hud.textContent =
    `自己ベスト=${history ? Math.round(history.best.totalScore) : "なし"} ` +
    `直近=${history ? history.recent.length : 0}件`;
}

function record(totalScore: number, recordedAtMs: number): void {
  const percentile = percentileForScore(totalScore);
  recordPlay(
    DIAGNOSTIC_SONG_KEY,
    {
      totalScore,
      percentile,
      rank: rankFromScore(totalScore, DIAGNOSTIC_BOUNDS),
      bounds: DIAGNOSTIC_BOUNDS,
      percentileBasis: "fixed-uniform",
    },
    recordedAtMs
  );
  render();
}

function reset(): void {
  clearScoreHistory(DIAGNOSTIC_SONG_KEY);
  nextTimeMs = 1000;
  render();
}

// 人手の目視確認用のボタン。得点はランダムでなく時刻に連動した決まった値を使い、観察を再現しやすくする。
requireElement<HTMLButtonElement>("add").addEventListener("click", () => {
  const totalScore = 100 + ((nextTimeMs / 1000) % 9) * 100;
  record(totalScore, nextTimeMs);
  nextTimeMs += 1000;
});
requireElement<HTMLButtonElement>("reset").addEventListener("click", () => {
  reset();
});

// 実データに混ざらないよう開始時に初期化してから描く。
reset();

window.__scoreHistoryProbe = () => {
  // 描画した文書要素から構造的事実を読む。保存・判定の状態は変えない。
  const hasEmpty = view.querySelector(".score-history__empty") !== null;
  const bestScoreText = view.querySelector(".score-history__best-score")?.textContent ?? null;
  const bestScore = bestScoreText !== null ? Number(bestScoreText) : null;
  const barCount = view.querySelectorAll(".score-history__bar").length;
  const bestBarCount = view.querySelectorAll(".score-history__bar--best").length;
  return {
    hasEmpty,
    bestScore: bestScore !== null && Number.isFinite(bestScore) ? bestScore : null,
    barCount,
    bestBarCount,
  };
};

window.__scoreHistoryControl = {
  reset,
  record,
};

window.addEventListener("beforeunload", () => {
  delete window.__scoreHistoryProbe;
  delete window.__scoreHistoryControl;
});
