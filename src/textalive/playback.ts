// 再生抽象 Playback の型と、単体検証できる純粋ロジック。
// engine は TextAlive を直接 import せず、TimeSource（src/engine/timeSource.ts）を通じて再生位置を受け取る。
// ここには TextAlive 実体への依存を持ち込まない（実プレイヤーの結線は textAlivePlayback.ts、擬似再生は fakePlayback.ts）。
// 依存規則の出典: docs/decisions/architecture.md §5、src/textalive/README.md。

import type { TimeSource } from "../engine";

/**
 * 再生の読み込み状態。
 * - loading: 楽曲の読み込み中。
 * - ready: 再生タイマーが準備でき、再生位置が取得できる（TextAlive の onTimerReady 後）。
 * - error(config): トークン未設定などの設定エラー。再試行では復旧しない。
 * - error(load): 通信や読み込みの失敗。再試行で復旧し得る。
 */
export type PlaybackState =
  | { readonly status: "loading" }
  | { readonly status: "ready" }
  | { readonly status: "error"; readonly kind: "config" | "load"; readonly message?: string };

/** 統括（src/app）が用いる再生抽象の外部契約。 */
export interface Playback {
  /** engine のループへ渡す時間源。 */
  readonly timeSource: TimeSource;
  /** 現在の読み込み状態を返す。 */
  getState(): PlaybackState;
  /** 読み込み状態の変化を購読する。返り値は購読解除関数。 */
  subscribe(listener: (state: PlaybackState) => void): () => void;
  /** プレイ進入時に、先頭へ戻してから再生を開始する。 */
  beginFromStart(): void;
  /** 楽曲再生を止める（タブ非表示・ページ退避）。 */
  pause(): void;
  /** 楽曲再生を始める（タブ表示・ページ復元、または「触れて再生」の操作）。 */
  play(): void;
  /** 再生が実際に始まっているか（再生開始の成立確認に使う）。 */
  hasStarted(): boolean;
  /** 楽曲が終了したか。 */
  hasEnded(): boolean;
  /** 読み込み失敗からの再試行（同一プレイヤーで再ロード）。 */
  retry(): void;
  /** 音声再生の許可を確立する最善努力（題名の操作の最中に呼ぶ）。 */
  primeAudioPermission(): void;
  /** 後始末。購読解除と実体の破棄を行う。 */
  dispose(): void;
}

/**
 * 楽曲終了の主条件の余白（ミリ秒）。
 * 採用理由を先に述べる。再生位置は毎フレーム離散的に標本化され、末尾で楽曲長へ厳密に到達せず
 * 数十ミリ秒手前で更新が止まり得るため、再生位置更新の間隔（約50ミリ秒）の2回ぶんに相当する
 * 120ミリ秒を、終了とみなす再生位置の余白とする。★暫定（実楽曲で調整する）。
 */
export const SONG_END_MARGIN_MS = 120;

/**
 * 楽曲終了の補助条件（onStop）の許容（ミリ秒）。
 * 採用理由を先に述べる。自然終了で再生が止まるとき、末尾の音声と楽曲長の値の差により再生位置が
 * 楽曲長より手前で更新を止める場合があるため、停止イベントが楽曲長から1秒以内に起きたときは
 * 自然終了とみなし、それより手前での停止は終了として扱わない。1秒は、明らかに曲の途中での停止を
 * 除外しつつ末尾近傍の停止を拾う区切りとして採る。★暫定（実楽曲で調整する）。
 */
export const SONG_END_STOP_TOLERANCE_MS = 1000;

/** 再生位置・再生中を読み取る最小の口。実プレイヤーと擬似再生の双方がこれを満たす。 */
export interface PlaybackReader {
  /** 再生位置（ミリ秒）。 */
  positionMs(): number;
  /** 再生中なら真。 */
  isPlaying(): boolean;
}

/**
 * 読み取り口と確定判定から TimeSource を作る。
 * isReady が偽のあいだ engine は positionMs を呼ばない契約のため、ここでは確定判定だけを差し込む。
 */
export function createReadyGatedTimeSource(
  reader: PlaybackReader,
  isReady: () => boolean
): TimeSource {
  return {
    positionMs: () => reader.positionMs(),
    isPlaying: () => reader.isPlaying(),
    isReady,
  };
}

/** 楽曲終了判定の入力。 */
export interface SongEndCheck {
  /** 再生タイマーが確定しているか。 */
  ready: boolean;
  /** 再生が実際に始まったか。 */
  playStarted: boolean;
  /** 現在の再生位置（ミリ秒）。 */
  positionMs: number;
  /** 楽曲長（ミリ秒）。 */
  durationMs: number;
  /** 再生開始後に停止イベントが起きたか。 */
  stopped: boolean;
  /** 主条件の余白（ミリ秒）。 */
  endMarginMs: number;
  /** 補助条件（停止イベント）の許容（ミリ秒）。 */
  stopToleranceMs: number;
}

/**
 * 楽曲が終了したかを判定する純粋関数。
 * 確定し再生が始まり楽曲長が正のときに限り判定する。
 * 主条件は「再生位置 ≥ 楽曲長 − 余白」。補助条件は「停止イベントが起き、かつ再生位置が楽曲長近傍」。
 * 停止イベントが楽曲長近傍でない（曲の途中の停止）ときは終了として扱わない。
 */
export function isSongEnded(check: SongEndCheck): boolean {
  if (!check.ready || !check.playStarted || check.durationMs <= 0) {
    return false;
  }
  if (check.positionMs >= check.durationMs - check.endMarginMs) {
    return true;
  }
  if (check.stopped && check.positionMs >= check.durationMs - check.stopToleranceMs) {
    return true;
  }
  return false;
}

/** 読み込み状態の遷移を司る小さな状態機械の外部契約。 */
export interface LoadStateMachine {
  /** 現在の状態を返す。 */
  getState(): PlaybackState;
  /** 状態の変化を購読する。返り値は購読解除関数。 */
  subscribe(listener: (state: PlaybackState) => void): () => void;
  /** 最初の読み込みを始める（試行番号を1つ増やして読み込み中にする）。返り値はその試行番号。 */
  beginAttempt(): number;
  /**
   * 再試行を始める。読み込み失敗の状態のときだけ新しい試行を始め、試行番号を返す。
   * それ以外（読み込み中・確定・設定エラー）では何もせず null を返す。
   * これにより、同時に複数の読み込みを進行させない（読み込み中の再試行や多重ロードを防ぐ）。
   */
  beginRetryAttempt(): number | null;
  /** 確定にする。読み込み中のときだけ反映する（確定・エラー後の遅延通知は無視）。 */
  markReady(): void;
  /** 読み込み失敗にする。読み込み中のときだけ反映する。 */
  markLoadError(message?: string): void;
  /** 設定エラーにする。状態に依らず反映する（読み込み開始前のトークン未設定など）。 */
  markConfigError(message?: string): void;
  /** 渡した試行番号が最新かを返す（createFromSongUrl の遅延した結果の判定に使う）。 */
  isLatestAttempt(attempt: number): boolean;
}

/**
 * 読み込み状態の状態機械を作る。
 * 「読み込み中のときだけ確定・読み込み失敗を反映する」規約により、確定またはエラーの後に届いた
 * ライフサイクル通知を無視する。同時に複数の読み込みを進行させない運用（再試行はエラー状態でのみ可能、
 * 読み込み中は再試行不可）と合わせ、各通知は常に最新の試行に対応する。
 */
export function createLoadStateMachine(initial: PlaybackState = { status: "loading" }): LoadStateMachine {
  let state: PlaybackState = initial;
  let attempt = 0;
  const listeners = new Set<(state: PlaybackState) => void>();

  function emit(): void {
    for (const listener of listeners) {
      listener(state);
    }
  }

  function set(next: PlaybackState): void {
    state = next;
    emit();
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    beginAttempt() {
      attempt += 1;
      set({ status: "loading" });
      return attempt;
    },
    beginRetryAttempt() {
      if (state.status !== "error" || state.kind !== "load") {
        return null;
      }
      attempt += 1;
      set({ status: "loading" });
      return attempt;
    },
    markReady() {
      if (state.status !== "loading") {
        return;
      }
      set({ status: "ready" });
    },
    markLoadError(message) {
      if (state.status !== "loading") {
        return;
      }
      set({ status: "error", kind: "load", message });
    },
    markConfigError(message) {
      set({ status: "error", kind: "config", message });
    },
    isLatestAttempt(value) {
      return value === attempt;
    },
  };
}
