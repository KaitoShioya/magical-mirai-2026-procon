// 開発ツールがブラウザの window に公開するグローバルの宣言。
// scripts/dump-songmap.mjs と scripts/prototype-fps.mjs が参照する実行時契約を型付けする。
// 契約の形は変えない（型を付けるだけ）。
export {};

declare global {
  interface Window {
    /** 楽曲解析ツールが公開する songMap（scripts/dump-songmap.mjs が取得する） */
    __songMap?: unknown;
    /** 直近の毎秒フレーム数を返す（scripts/prototype-fps.mjs が取得する） */
    __fps?: () => number;
    /** 平均の毎秒フレーム数を返す */
    __avgFps?: () => number;
    /** 毎秒フレーム数の標本をリセットする */
    __resetFps?: () => void;
    /**
     * 検証用の状態履歴アクセサ。診断モード（URLに ?smoke=1）のときだけ統括が取り付ける。
     * 進入した画面状態のキーを進入順に返す。scripts/screens-smoke.mjs が取得する。
     * 共有型ディレクトリが screens に依存しないよう、ScreenKey 型ではなく文字列配列に留める。
     */
    __screenHistory?: () => readonly string[];
    /**
     * 検証用のエンジン状態アクセサ。診断モード（URLに ?smoke=1）のときだけ統括が取り付ける。
     * ゲーム時刻・固定刻み回数・再同期回数・超過回数・時間源確定・時計初期化を返す。
     * scripts/engine-loop-smoke.mjs が取得する。共有型が engine に依存しないよう素の構造で宣言する。
     */
    __engineState?: () => {
      gameTimeMs: number;
      stepCount: number;
      resyncCount: number;
      overflowCount: number;
      ready: boolean;
      hasClockSample: boolean;
    };
  }
}
