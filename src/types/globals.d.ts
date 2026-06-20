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
    /**
     * 検証用の発光点診断アクセサ。発光点診断ページ（rendering.html）だけが取り付ける。
     * 発光点のみのシーンを1フレーム描いた直後の描画命令の回数（drawCalls）と三角形の数（triangles）を
     * 同一スナップショットで返す。scripts/rendering-glow-smoke.mjs が取得する。
     * 共有型が rendering に依存しないよう素の構造で宣言する。
     */
    __glowState?: () => {
      drawCalls: number;
      triangles: number;
    };
    /**
     * 検証用の入力イベント履歴アクセサ。入力診断ページ（input.html）だけが取り付ける。
     * これまでに受けた入力イベントを受けた順に返す。scripts/input-smoke.mjs が取得する。
     * 共有型が input に依存しないよう素の構造で宣言し、入力源は文字列で表す。
     */
    __inputReactions?: () => readonly {
      source: string;
      pointerId: number | null;
      normalizedX: number;
      normalizedY: number;
      slotIndex: number;
      slotCount: number;
      colorX01: number;
      eventTimeMs: number;
    }[];
    /**
     * 検証用の入力状態アクセサ。入力診断ページ（input.html）だけが取り付ける。
     * 追跡中の接触数・キーボード仮想カーソルのX位置・入力面要素の算出 touch-action を返す。
     * scripts/input-smoke.mjs が取得する。
     */
    __inputState?: () => {
      activePointerCount: number;
      keyboardColorX01: number;
      touchAction: string;
    };
    /** 可読性診断（readability.html）の計測が終わったら真を返す。scripts/readability-contrast.mjs が待つ。 */
    __readabilityReady?: () => boolean;
    /**
     * 可読性診断（readability.html）の計測結果。発光・ブルーム後処理を通した最終描画画素から、文字内部と
     * 縁取りのコントラスト比を背景種別ごとに返す。scripts/readability-contrast.mjs が 4.5:1 以上を判定する。
     * 共有型が typography に依存しないよう素の構造で宣言する。
     */
    __readability?: () => {
      passRatio: number;
      capability: { stroke: boolean; outlineOffset: boolean; outlineBlur: boolean };
      mode: string;
      backing: string;
      fillPixelCount: number;
      fillBorderContrastOverall: number;
      backgrounds: {
        kind: string;
        fillBorderContrast: number;
        conservativeFillBorder: number;
        fillVsBackground: number;
        borderVsBackground: number;
      }[];
    };
  }
}
