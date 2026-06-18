// 環境層。ブラウザ機能（描画合図とタブ表示状態）を1か所に閉じ込め、検証で差し替えられるようにする。
// loop 本体はこの接合面を通じてのみブラウザ機能に触れる（毎フレーム判定を決定的に単体検証するため）。

export interface Environment {
  /** いま表示中か（タブが前面で可視か）。 */
  isVisible(): boolean;
  /** 描画合図を予約し、取り消し用の識別番号を返す。callback は時刻（ミリ秒）を受け取る。 */
  requestFrame(callback: (timeMs: number) => void): number;
  /** 予約した描画合図を取り消す。 */
  cancelFrame(handle: number): void;
  /**
   * 停止の契機（タブ非表示・ページ退避）と再開の契機（表示・ページ復元）を購読し、解除関数を返す。
   * onHide は非表示・退避で、onShow は表示・復元で呼ばれる。
   */
  subscribe(onHide: () => void, onShow: () => void): () => void;
}

/** 既定のブラウザ実装。描画合図に requestAnimationFrame、表示状態に visibilitychange と pagehide/pageshow を使う。 */
export function createBrowserEnvironment(): Environment {
  return {
    isVisible(): boolean {
      return document.visibilityState === "visible";
    },
    requestFrame(callback: (timeMs: number) => void): number {
      return requestAnimationFrame(callback);
    },
    cancelFrame(handle: number): void {
      cancelAnimationFrame(handle);
    },
    subscribe(onHide: () => void, onShow: () => void): () => void {
      const onVisibilityChange = (): void => {
        if (document.hidden) {
          onHide();
        } else {
          onShow();
        }
      };
      const onPageHide = (): void => onHide();
      const onPageShow = (): void => onShow();
      document.addEventListener("visibilitychange", onVisibilityChange);
      window.addEventListener("pagehide", onPageHide);
      window.addEventListener("pageshow", onPageShow);
      return (): void => {
        document.removeEventListener("visibilitychange", onVisibilityChange);
        window.removeEventListener("pagehide", onPageHide);
        window.removeEventListener("pageshow", onPageShow);
      };
    },
  };
}
