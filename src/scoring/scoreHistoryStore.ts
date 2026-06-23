// 自己ベスト履歴の端末内保存（localStorage への読み書き）。プレイ終了の結線（#74・#59）が1回のプレイの得点要約
// ScoreResult を渡して記録し、結果画面と成長表示が自己ベストと直近履歴を読み出す。
//
// 配置と依存の理由を先に述べる。アーキテクチャ正典（docs/decisions/architecture.md）と src/scoring/README.md は
// 自己最高記録（localStorage）を scoring 層の責務に割り当てる。本モジュールは判定・得点の値を保存するだけで、
// profiles・rendering・tools・three を取り込まない（architecture.md §依存規則）。曲一覧 src/config/songs も取り込まない。
// 曲キーは名前空間の文字列として不透明に扱い、その妥当性は呼び出し側の責務とする（保存層を曲の追加・無効化から独立させるため）。
//
// 前例は較正値の保存 calibrationStore.ts（#50）。版を持つ記録・安全な取得関数・あらゆる失敗で安全側へ倒れる読出・
// 容量超過例外を握りつぶす保存、という同じ形を踏襲する。

import { RANKS_ASCENDING, type Rank } from "./rank";
import type { ScoreResult } from "./scoreResult";

// localStorage のキーの接頭辞。曲ごとに分離する理由を先に述べる。localStorage は同一オリジンで共有されるため、
// ある曲の記録の破損や容量超過が他の曲の記録を巻き込まないよう、曲ごとに独立したキーへ保存する。
export const SCORE_HISTORY_KEY_PREFIX = "mm2026.scoreHistory.";

/** 曲キーから保存キーを作る。 */
export function scoreHistoryKey(songKey: string): string {
  return SCORE_HISTORY_KEY_PREFIX + songKey;
}

// 保存形式の版。版を持つ理由を先に述べる。将来形式が変わったとき古い記録を安全に無視できるよう版番号を添える。
export const SCORE_HISTORY_VERSION = 1;

// 直近履歴の上限件数。50件とする理由を先に述べる。localStorage の容量は有限（オリジン当たり概ね5メガバイト）で、
// 1件は数値3つと時刻1つで約70バイトのため50件でも約3.5キロバイトに収まり容量を圧迫しない。一方50件あれば
// 複数回プレイの成長を十分に見せられる。上限はこの層が所有する定数とし tuning.ts には置かない。
export const SCORE_HISTORY_RECENT_MAX = 50;

/** 1回のプレイの記録。ScoreResult のうち履歴表示に要る値だけを持つ（bounds・percentileBasis は保存しない）。 */
export interface PlayRecord {
  totalScore: number; // 総合得点 S
  percentile: number; // 百分位 [0,100]
  rank: Rank; // C/B/A/S
  recordedAtMs: number; // 記録時刻（ミリ秒、Date.now() 由来、有限）
}

// 保存形式（内部）。best を recent と別欄に持つ理由を先に述べる。直近履歴は上限で古いものから退避するため、
// 全期間の自己ベストが退避で消えないよう独立した欄に保持する。
interface ScoreHistoryRecord {
  version: typeof SCORE_HISTORY_VERSION;
  best: PlayRecord;
  recent: PlayRecord[]; // 新しい順
}

/** 読出の戻り。自己ベストと直近履歴（新しい順）。 */
export interface ScoreHistory {
  best: PlayRecord;
  recent: PlayRecord[]; // 新しい順
}

/** 記録の結果。 */
export interface RecordPlayOutcome {
  /** 今回の記録。 */
  record: PlayRecord;
  /** 今回自己ベストを更新したか。persisted が偽のとき端末内に残らない一時判定。 */
  isNewBest: boolean;
  /** 今回プレイ前の自己ベスト（更新演出・差分表示用）。記録が無ければ null。 */
  previousBest: PlayRecord | null;
  /**
   * ローカルストレージへ保存できたか。偽のとき record・isNewBest・previousBest は読込済みの状態に対する
   * 一時判定であり端末内に残らず次回読出と一致しない。呼び出し側はそれを保存済みの記録として提示しない。
   */
  persisted: boolean;
}

// 端末内保存の取得。無い環境（サーバ側描画・一部の単体テスト）や、アクセス自体が例外を投げる環境では null を返す。
function getStorage(): Storage | null {
  try {
    if (typeof globalThis.localStorage === "undefined") {
      return null;
    }
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

// 1件の記録の妥当性。総合得点・百分位・時刻が有限の数値で、ランクが正準集合の要素であることだけを見る。
// 範囲（百分位の0以上100以下など）を見ない理由を先に述べる。calibrationStore と同じく構造の健全性だけを守り、
// 得点側の不変条件（#55 が保証する範囲）をこの層で再実装しない。
function isValidPlayRecord(value: unknown): value is PlayRecord {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.totalScore === "number" &&
    Number.isFinite(record.totalScore) &&
    typeof record.percentile === "number" &&
    Number.isFinite(record.percentile) &&
    typeof record.recordedAtMs === "number" &&
    Number.isFinite(record.recordedAtMs) &&
    typeof record.rank === "string" &&
    (RANKS_ASCENDING as readonly string[]).includes(record.rank)
  );
}

// 得点要約と時刻から1件の記録を作る。
function playRecordFromResult(result: ScoreResult, recordedAtMs: number): PlayRecord {
  return {
    totalScore: result.totalScore,
    percentile: result.percentile,
    rank: result.rank,
    recordedAtMs,
  };
}

/**
 * 自己ベストと直近履歴を読み出す。保存が無い・壊れている・形式の版が違う・自己ベストが妥当でない・直近が配列でない
 * のいずれでも null を返す。直近履歴の個々の不正要素は全体を捨てず該当要素だけ落とす（自己ベストは合否に効く中核値の
 * ため壊れていれば全体失敗、直近履歴は付随情報のため健全分を救う）。
 * 戻りが null のとき呼び出し側は初回・記録なしとして扱う。較正値が未較正の既定値（0）を返すのと異なり、自己ベストには
 * 意味ある既定値が無いため null が「記録なし」を一意に表す。
 */
export function loadScoreHistory(songKey: string): ScoreHistory | null {
  const storage = getStorage();
  if (!storage) {
    return null;
  }
  let raw: string | null;
  try {
    raw = storage.getItem(scoreHistoryKey(songKey));
  } catch {
    return null;
  }
  if (raw === null) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const candidate = parsed as Partial<ScoreHistoryRecord>;
  if (candidate.version !== SCORE_HISTORY_VERSION) {
    return null;
  }
  if (!isValidPlayRecord(candidate.best)) {
    return null;
  }
  if (!Array.isArray(candidate.recent)) {
    return null;
  }
  // 妥当な要素だけに絞り、上限件数へ切り詰める（改ざんや将来版で過剰に長い配列が来ても表示窓を超えないようにする）。
  const recent = candidate.recent.filter(isValidPlayRecord).slice(0, SCORE_HISTORY_RECENT_MAX);
  return { best: candidate.best, recent };
}

/** 自己ベストだけを読み出す。記録が無ければ null。読出経路を1つにするため履歴読出を経由する。 */
export function loadBestScore(songKey: string): PlayRecord | null {
  return loadScoreHistory(songKey)?.best ?? null;
}

/**
 * 1回のプレイを記録する。新しい総合得点が過去の自己ベストを厳密に上回ったときだけ自己ベストを更新する
 * （「更新」は改善を意味するため同点は更新としない）。直近履歴は新しいものを先頭へ足し、上限を超えた分は
 * 最古から退避する。自己ベストは退避で消えないよう独立欄に保持する。
 * 保存に失敗（ローカルストレージ非対応・容量超過例外）しても戻り値は得られるが、persisted が偽のとき
 * それらは端末内に残らない一時判定である。
 * @param recordedAtMs 記録時刻。既定は現在時刻。テストが決まった時刻を注入して往復を厳密に検証できるよう引数で受ける。
 */
export function recordPlay(
  songKey: string,
  result: ScoreResult,
  recordedAtMs: number = Date.now()
): RecordPlayOutcome {
  const record = playRecordFromResult(result, recordedAtMs);
  const prior = loadScoreHistory(songKey);
  const previousBest = prior?.best ?? null;
  // 非有限値（総合得点・百分位・記録時刻の NaN や無限大）を保存しない理由を先に述べる。非有限値は JSON.stringify で
  // null へ化け、次回読出の妥当性検査で記録ごと捨てられるため、保存したのに消える（persisted が真なのに読出で失われ、
  // 既存の自己ベストまで壊す）矛盾が起きる。較正値の保存（calibrationStore.ts）が保存時にも非有限を拒否するのと同じ方針で、
  // 不正な記録は保存も更新もせず既存の履歴を守り、persisted を偽にする。
  if (!isValidPlayRecord(record)) {
    return { record, isNewBest: false, previousBest, persisted: false };
  }
  const isNewBest = previousBest === null || record.totalScore > previousBest.totalScore;
  const best = isNewBest ? record : previousBest;
  const recent = [record, ...(prior?.recent ?? [])].slice(0, SCORE_HISTORY_RECENT_MAX);

  const persisted = saveScoreHistory(songKey, { version: SCORE_HISTORY_VERSION, best, recent });

  return { record, isNewBest, previousBest, persisted };
}

// 記録を保存する。localStorage が無い・例外を投げる（容量超過など）ときは握りつぶして false を返す。成功で true。
function saveScoreHistory(songKey: string, record: ScoreHistoryRecord): boolean {
  const storage = getStorage();
  if (!storage) {
    return false;
  }
  try {
    storage.setItem(scoreHistoryKey(songKey), JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

/** 当該曲の履歴を消す（やり直し・診断の初期化用）。例外は握りつぶす。 */
export function clearScoreHistory(songKey: string): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(scoreHistoryKey(songKey));
  } catch {
    // 消去できない環境でも処理を止めない。
  }
}
