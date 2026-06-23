// 自己ベストと成長履歴の表示部品（Issue #67）。保存層（scoring の scoreHistoryStore）が読み出した履歴を受け取り、
// 自己ベストの見出しと直近プレイの成長を文書要素で描く。結果画面（#74）が後から載せ、診断ページが今すぐ実証する。
//
// 依存の理由を先に述べる。本層は得点系の値を文書要素で表示するだけで得点の論理を持たない（src/ui/README.md・
// docs/decisions/architecture.md）。よって取り込みは scoring の型だけで、three・rendering・profiles・tools を取り込まない。
// 値の保存・判定は保存層が済ませ、本部品は受け取った値を描くことに徹する。

import type { PlayRecord, ScoreHistory } from "../scoring/scoreHistoryStore";
import type { Rank } from "../scoring/rank";

// 強調・棒の識別に使う標識（診断の問い合わせと検査が依拠する契約）。
const CLASS_EMPTY = "score-history__empty";
const CLASS_BEST = "score-history__best";
const CLASS_BAR = "score-history__bar";
const CLASS_BAR_BEST = "score-history__bar--best";

// 表示の直前に百分位を 0以上100以下へ丸める理由を先に述べる。保存層は百分位の有限性だけを検査し範囲を保証しない
// ため、範囲外や非有限が表示に出ないよう本部品で防ぐ。非有限のときは数値を出さず「—」を返す。
export function formatPercentile(percentile: number): string {
  if (!Number.isFinite(percentile)) {
    return "—";
  }
  const clamped = Math.min(100, Math.max(0, percentile));
  return `上位 ${Math.round(100 - clamped)}%`;
}

function formatScore(totalScore: number): string {
  if (!Number.isFinite(totalScore)) {
    return "—";
  }
  return String(Math.round(totalScore));
}

// recent（古い順）の各棒を自己ベストとして強調するかの真偽配列を返す。自己ベストは単一の記録のため、表示でも
// ちょうど1本だけ強調する。同定は総合得点かつ記録時刻の両方の一致で行う（得点だけだと同点の棒が複数該当する）。
// 同点かつ同時刻の記録が複数あっても1本に保証する方法と理由を先に述べる。自己ベストは「最初に最高得点へ達した
// プレイ」であり、古い順に並べた中で最初に一致した1本だけを強調する。退避で best が recent に無いときは全て偽になる。
export function markBestBars(recentOldestFirst: readonly PlayRecord[], best: PlayRecord): boolean[] {
  let alreadyMarked = false;
  return recentOldestFirst.map((record) => {
    if (
      !alreadyMarked &&
      record.totalScore === best.totalScore &&
      record.recordedAtMs === best.recordedAtMs
    ) {
      alreadyMarked = true;
      return true;
    }
    return false;
  });
}

function createBestHeading(best: PlayRecord): HTMLElement {
  const box = document.createElement("div");
  box.className = CLASS_BEST;

  const label = document.createElement("span");
  label.className = "score-history__best-label";
  label.textContent = "自己ベスト";

  const score = document.createElement("span");
  score.className = "score-history__best-score";
  score.textContent = formatScore(best.totalScore);

  const rank = document.createElement("span");
  rank.className = "score-history__best-rank";
  rank.textContent = `ランク ${best.rank as Rank}`;

  const percentile = document.createElement("span");
  percentile.className = "score-history__best-percentile";
  percentile.textContent = formatPercentile(best.percentile);

  box.append(label, score, rank, percentile);
  return box;
}

// 成長の可視化。recent を古い順（左から右）に並べた横棒で描く。棒の長さの正規化の理由を先に述べる。総合得点の
// 理論最大は曲ごとに異なり絶対値では棒の長さが比較できないため、表示窓内の最大総合得点を分母に各プレイを
// 0以上1以下へ正規化し、相対的な成長を読み取れるようにする。最大が0以下のときは比較の基準が無いため一律に最小幅とする。
function createGrowthChart(history: ScoreHistory): HTMLElement {
  const chart = document.createElement("div");
  chart.className = "score-history__chart";

  // recent は新しい順で保持されるため、左から右を古い順にするよう反転して並べる。
  const oldestFirst = [...history.recent].reverse();
  const finiteScores = oldestFirst
    .map((record) => record.totalScore)
    .filter((value) => Number.isFinite(value) && value > 0);
  const maxScore = finiteScores.length > 0 ? Math.max(...finiteScores) : 0;
  const bestFlags = markBestBars(oldestFirst, history.best);

  oldestFirst.forEach((record, index) => {
    const bar = document.createElement("div");
    bar.className = CLASS_BAR;
    if (bestFlags[index]) {
      bar.classList.add(CLASS_BAR_BEST);
    }
    const ratio =
      maxScore > 0 && Number.isFinite(record.totalScore) && record.totalScore > 0
        ? record.totalScore / maxScore
        : 0;
    // 棒は高さで成長を示す。0%でも棒の存在が分かるよう下限を 4% に置く（成長の有無の比較は相対高さで読む）。
    const heightPercent = 4 + ratio * 96;
    bar.style.height = `${heightPercent}%`;
    bar.title = `得点 ${formatScore(record.totalScore)} / ランク ${record.rank as Rank}`;
    chart.append(bar);
  });
  return chart;
}

/**
 * 自己ベストと成長履歴を host へ描く。先頭で host の中身を消してから描き直すため、同じ入力で同じ結果になり再呼び出しできる。
 * history が null（記録なし・初回）のときは記録なしの表示を出す。事象listenerやタイマーは持たない。
 */
export function renderScoreHistory(host: HTMLElement, history: ScoreHistory | null): void {
  host.replaceChildren();

  if (history === null) {
    const empty = document.createElement("p");
    empty.className = CLASS_EMPTY;
    empty.textContent = "まだ記録がありません";
    host.append(empty);
    return;
  }

  host.append(createBestHeading(history.best), createGrowthChart(history));
}
