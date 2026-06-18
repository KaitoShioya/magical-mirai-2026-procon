// 画面状態の有限状態機械。5状態の生成・遷移・単一画面の保証・状態履歴を担う。
// 判定・得点の論理は持たない（責務の出典 src/screens/README.md、docs/decisions/architecture.md §3.1）。

import { ALLOWED_TRANSITIONS, MAX_TRANSITIONS_PER_DRAIN } from "./constants";
import type { ScreenContext, ScreenFactory, ScreenKey, Screen } from "./types";

/** 状態機械の外部契約。 */
export interface ScreenMachine {
  /** 初期状態で起動する。2回目以降の呼び出しは例外。 */
  start(initial: ScreenKey, context: ScreenContext): void;
  /** 毎フレーム呼ぶ。未開始または破棄後は何もしない。 */
  update(deltaMs: number): void;
  /** 遷移を要求する。許可遷移表に無い遷移は例外。同一状態への要求は何もしない。 */
  requestTransition(to: ScreenKey): void;
  /** 進入した状態キーを進入順に返す（内部配列のコピー。外部からの破壊を防ぐ）。 */
  history(): readonly ScreenKey[];
  /** 後始末。現状態の onExit と要素除去を行う。2回目以降は何もしない。 */
  dispose(): void;
}

/**
 * 状態機械を生成する。
 * factories は状態キーから画面生成関数への対応表。画面の実体は遷移ごとに新規生成し、使い回さない。
 */
export function createScreenMachine(
  root: HTMLElement,
  factories: Record<ScreenKey, ScreenFactory>
): ScreenMachine {
  let started = false;
  let disposed = false;
  let context: ScreenContext | null = null;
  let currentKey: ScreenKey | null = null;
  let currentScreen: Screen | null = null;
  const visited: ScreenKey[] = [];
  const pending: ScreenKey[] = [];
  let draining = false;

  // 単一画面の不変条件を機械側で検証する。受け入れ基準「表示の混在がない」を直接担保する。
  function verifyInvariant(key: ScreenKey, screen: Screen): void {
    if (screen.element.dataset.screen !== key) {
      throw new Error(
        `画面 ${key} の要素の data-screen 属性が "${screen.element.dataset.screen}" で一致しません`
      );
    }
    const count = root.querySelectorAll("[data-screen]").length;
    if (count !== 1) {
      throw new Error(`表示中の画面が ${count} 個あります（ちょうど1個でなければなりません）`);
    }
  }

  // 1つの状態へ遷移する。初回（currentKey が null）は遷移元が無いので許可検証と onExit を行わない。
  // 順序は「現状態の onExit → 新画面を生成して追加 → 単一画面の検証 → 新状態の onEnter → 状態履歴へ追加」。
  // 状態履歴へは onEnter の後に追加する。onEnter が例外を投げた場合に履歴へ残さないためである。
  // onEnter 内でさらに遷移が要求されても、その要求は保留に積まれ、現在の反映処理が現状態の追加を終えてから
  // 順に消化されるため、進入順は崩れない。
  function transitionTo(to: ScreenKey): void {
    if (!context) {
      throw new Error("文脈が未設定のまま画面を生成しようとしました");
    }
    if (currentKey !== null) {
      if (!ALLOWED_TRANSITIONS[currentKey].includes(to)) {
        throw new Error(`許可されない遷移です: ${currentKey} → ${to}`);
      }
      if (currentScreen) {
        currentScreen.onExit();
      }
    }
    const screen = factories[to](context);
    currentKey = to;
    currentScreen = screen;
    root.replaceChildren(screen.element);
    verifyInvariant(to, screen);
    screen.onEnter();
    visited.push(to);
  }

  // 保留に積まれた遷移要求を、保留が尽きるまで順に反映する一連の処理（反映処理）。
  // 反映処理中の追加要求も同じ反映処理で消化する。遷移回数が上限を超えたら無限連鎖として例外。
  // 初回の起動もこの反映処理を通すため、再入の扱いが起動時と遷移時で一貫する。
  function drain(): void {
    if (draining) {
      return;
    }
    draining = true;
    try {
      let applied = 0;
      while (pending.length > 0) {
        const to = pending.shift() as ScreenKey;
        if (to === currentKey) {
          continue;
        }
        applied += 1;
        if (applied > MAX_TRANSITIONS_PER_DRAIN) {
          throw new Error(
            `1回の反映処理での遷移回数が上限 ${MAX_TRANSITIONS_PER_DRAIN} を超えました（無限連鎖の疑い）`
          );
        }
        transitionTo(to);
      }
    } finally {
      draining = false;
    }
  }

  return {
    start(initial: ScreenKey, ctx: ScreenContext): void {
      if (started) {
        throw new Error("状態機械は既に開始されています");
      }
      started = true;
      context = ctx;
      // 初期状態も遷移要求として反映処理に積む。これにより起動時と遷移時の再入の扱いが一貫する。
      pending.push(initial);
      drain();
    },

    update(deltaMs: number): void {
      if (!started || disposed || !currentScreen) {
        return;
      }
      currentScreen.onUpdate(deltaMs);
    },

    requestTransition(to: ScreenKey): void {
      if (!started || disposed) {
        return;
      }
      if (to === currentKey) {
        return;
      }
      pending.push(to);
      drain();
    },

    history(): readonly ScreenKey[] {
      return visited.slice();
    },

    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      if (currentScreen) {
        currentScreen.onExit();
        currentScreen = null;
      }
      currentKey = null;
      root.replaceChildren();
    },
  };
}
