// 表示同期ゲート（Issue #99）の受け入れ診断ページ（display-sync.html の入口）。
// 描画を要しないため描画器・canvas は生成しない。楽曲データを実行時に取得（import でなく fetch のため本番束に
// 取り込まれない）し、既定の記録源アダプタで記録とアンカーを作り、記録源非依存の判定 evaluateDisplaySync を実行する。
// 結果を window.__displaySyncReady / window.__displaySyncVerdict に公開する。手元のゲート本体
// scripts/display-sync-quality.mjs がこれを読む。本ページは本番ビルド（--mode app）では配信しない。
//
// 依存規則: 本体・診断は src/tools を import しないため、要素取得は内製する。

import { runDefaultDisplaySyncGate, DEFAULT_THRESHOLDS } from "../displaySyncGate";
import type { DisplaySyncDiagnostic, DisplaySyncThresholds, SongmapLike } from "../displaySyncGate";

const SONGMAP_URL = "/docs/analysis/takeover.songmap.json";

// 検証用の閾値上書き。起動時パラメータ（URLの検索文字列）で初期閾値の数値項目を上書きできる（spatial.html の
// refl・bloom と同じ方針）。閾値を変えた場合の合否を手元で確かめるための診断用であり、本番では配信しない。
function resolveThresholds(): DisplaySyncThresholds {
  const query = new URLSearchParams(window.location.search);
  const merged: Record<string, number> = { ...DEFAULT_THRESHOLDS };
  for (const key of Object.keys(DEFAULT_THRESHOLDS)) {
    const raw = query.get(key);
    if (raw !== null) {
      const value = Number(raw);
      if (Number.isFinite(value)) {
        merged[key] = value;
      }
    }
  }
  return merged as unknown as DisplaySyncThresholds;
}

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`#${id} 要素が見つかりません`);
  }
  return element as T;
}

const hud = requireElement<HTMLElement>("hud");

let ready = false;
let diagnostic: DisplaySyncDiagnostic | null = null;
let runError: string | null = null;

function formatStat(label: string, stat: { medianBeats: number | null; p95Beats: number | null; maxBeats: number | null }): string {
  const fmt = (v: number | null): string => (v === null ? "なし" : v.toFixed(2));
  return `${label}: 中央値=${fmt(stat.medianBeats)}拍 95パーセンタイル=${fmt(stat.p95Beats)}拍 最大=${fmt(stat.maxBeats)}拍`;
}

function renderHud(d: DisplaySyncDiagnostic): void {
  const r = d.ratios;
  const lines = [
    `表示同期ゲート（Issue #99）: ${d.acceptable ? "合格" : "不成立"}`,
    `件数: 粒度切替=${d.counts.switchCount} 発火=${d.counts.fireCount}`,
    "",
    "接地率（合否対象、寛容）:",
    `  粒度切替=${r.switchGroundedRatio.toFixed(3)}  発火=${r.fireGroundedRatio.toFixed(3)}`,
    "名前付き同期率（情報）:",
    `  粒度切替→構造境界=${r.granularityStructureSync.toFixed(3)}  発火→ビート=${r.fireBeatSync.toFixed(3)}  発火→声量の山=${r.fireLoudnessPeakSync.toFixed(3)}`,
    "最近傍距離（情報、拍単位）:",
    `  ${formatStat("粒度切替→構造境界∪ビート", d.distances.switchToStructureOrBeat)}`,
    `  ${formatStat("発火→ビート∪声量の山", d.distances.fireToBeatOrPeak)}`,
    `  ${formatStat("発火→文字開始", d.distances.fireToVocalOnset)}`,
  ];
  if (d.reasons.length > 0) {
    lines.push("", "不成立の理由:");
    for (const reason of d.reasons) {
      lines.push(`  ・${reason}`);
    }
  }
  if (d.warnings.length > 0) {
    lines.push("", "警告（合否は変えない）:");
    for (const warning of d.warnings) {
      lines.push(`  ・${warning}`);
    }
  }
  if (d.sourceIssues.length > 0) {
    lines.push("", "既定記録源の整合検査の不整合:");
    for (const issue of d.sourceIssues) {
      lines.push(`  ・${issue}`);
    }
  }
  hud.textContent = lines.join("\n");
}

async function run(): Promise<void> {
  const response = await fetch(SONGMAP_URL);
  if (!response.ok) {
    throw new Error(`楽曲データの取得に失敗しました（${response.status}）`);
  }
  const songmap = (await response.json()) as SongmapLike;
  diagnostic = runDefaultDisplaySyncGate(songmap, resolveThresholds());
  renderHud(diagnostic);
  ready = true;
}

run().catch((error: unknown) => {
  runError = error instanceof Error ? error.message : String(error);
  hud.textContent = `実行に失敗しました: ${runError}`;
  ready = true;
});

window.__displaySyncReady = () => ready;
window.__displaySyncVerdict = () => {
  if (runError !== null) {
    throw new Error(runError);
  }
  if (diagnostic === null) {
    throw new Error("診断がまだ完了していません");
  }
  return diagnostic;
};

window.addEventListener("beforeunload", () => {
  delete window.__displaySyncReady;
  delete window.__displaySyncVerdict;
});
