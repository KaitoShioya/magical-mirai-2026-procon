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
    /** 区間ごとの毎秒フレーム数の生標本を複製して返す（scripts/harness が下位パーセンタイル算出に取得する） */
    __fpsSamples?: () => readonly number[];
    /** 毎秒フレーム数の標本をリセットする */
    __resetFps?: () => void;
    /** 下位5パーセンタイルの毎秒フレーム数を返す（kineticText 診断 typography.html が公開する） */
    __p5Fps?: () => number;
    /** 定常区間で1フレームの所要時間が33ミリ秒を超えた回数を返す（kineticText 診断が公開する） */
    __frameDrops?: () => number;
    /** 初回表示遅延（暖め後の最初の出現要求から最初の描画完了まで、ミリ秒）を返す（kineticText 診断が公開する） */
    __initLatencyMs?: () => number;
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
    /**
     * 検証用の描画状態アクセサ。診断モード（URLに ?smoke=1）のときだけ統括が取り付ける。
     * WebGL生成可否・画素密度倍率・描画バッファ寸法・クリアカラー16進・カメラ縦横比を返す。
     * scripts/rendering-smoke.mjs が取得する。共有型が rendering に依存しないよう素の構造で宣言する。
     */
    __renderState?: () => {
      webglAvailable: boolean;
      pixelRatio: number;
      drawingBufferWidth: number;
      drawingBufferHeight: number;
      clearColorHex: string;
      cameraAspect: number;
      cameraPosition: { x: number; y: number; z: number };
      cameraDirection: { x: number; y: number; z: number };
      cameraPoseRejectedCount: number;
    };
    /** カメラ軌跡の受け入れ診断 camera-trajectory.html が公開する掃引結果。scripts/camera-trajectory-smoke.mjs が取得する。 */
    __cameraTrajectory?: () => {
      startTimeMs: number;
      endTimeMs: number;
      maxStepDistance: number;
      meanStepDistance: number;
      minSpeed: number;
      cameraPosition: { x: number; y: number; z: number };
      cameraDirection: { x: number; y: number; z: number };
      cameraPoseRejectedCount: number;
      expectedEndPosition: { x: number; y: number; z: number };
      expectedEndDirection: { x: number; y: number; z: number };
    };
  }
}
