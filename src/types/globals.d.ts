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
    /** 直近フレームの描画命令の回数を返す（kineticText 診断 typography.html の変形シナリオが公開する）。 */
    __drawCalls?: () => number;
    /** 現在表示中の変形単位（変形テキスト）の数を返す（kineticText 診断 typography.html の変形シナリオが公開する）。 */
    __activeDeformUnits?: () => number;
    /**
     * アニメーション付き診断（typography.html の anim=1）で、文字プール上限超過により出現が無操作になった回数を返す。
     * 0でない場合、計測した負荷が意図した同時数を代表しない（scripts/typography-instances-fps.mjs が取得する）。
     */
    __animNoopCount?: () => number;
    /** 文字エンジンの同期的主スレッド費用（出現時の sync 発火＋向き更新）の1フレーム最大値（ミリ秒）。kineticText 診断が公開する。 */
    __textSyncCostMaxMs?: () => number;
    /** 同上の上位5パーセンタイル（ミリ秒）。 */
    __textSyncCostP95Ms?: () => number;
    /** 同上の上位1パーセンタイル（ミリ秒）。 */
    __textSyncCostP99Ms?: () => number;
    /** 同上が1ミリ秒を超えたフレーム数。 */
    __textSyncCostOverCount?: () => number;
    /** 同期費用を計測した総フレーム数。 */
    __textSyncCostFrames?: () => number;
    /** 参考値: 描画（composer.render）の1フレーム最大所要時間（ミリ秒）。後処理を含むためゲート対象外。 */
    __renderCostMaxMs?: () => number;
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
     * RenderRoot.state() の戻り値（素の構造）と一致させる。scripts/rendering-smoke.mjs が取得する。
     * 共有型が rendering に依存しないよう素の構造で宣言する。
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
      reflectionEnabled: boolean;
      reflectionResolution: number;
      bloom: {
        enabled: boolean;
        strength: number;
        radius: number;
        threshold: number;
        bloomInputWidth: number;
        bloomInputHeight: number;
        outputPassEnabled: boolean;
      } | null;
      centerFigureStatus: "fallback" | "loaded" | "error";
      centerFigureError: string | null;
      overlay: {
        objectCount: number;
        frustumLeft: number;
        frustumRight: number;
        frustumTop: number;
        frustumBottom: number;
      } | null;
      stageTerrainStatus: "none" | "loaded" | "error";
      stageTerrainError: string | null;
      waterSource: "placeholder-plane" | "stage-mesh";
      waterRegion: {
        width: number;
        depth: number;
        centerX: number;
        centerZ: number;
        y: number;
      } | null;
      originalWaterBoundsWorld: {
        minX: number;
        maxX: number;
        minZ: number;
        maxZ: number;
        y: number;
      } | null;
    };
    /**
     * 検証用の舞台土台診断アクセサ。舞台土台の受け入れ診断ページ（stage.html）だけが取り付ける。
     * 地形を読み込んだ描画基盤の状態と、地形メッシュ数を返す。scripts/rendering-stage-smoke.mjs が取得する。
     * 反射面に渡した水面領域（waterRegion）と、水面マーカーの元範囲（originalWaterBoundsWorld）は別物のため
     * 別項目で返す。共有型が rendering に依存しないよう素の構造で宣言する。
     */
    __stageState?: () => {
      webglAvailable: boolean;
      stageTerrainStatus: "none" | "loaded" | "error";
      stageTerrainError: string | null;
      waterSource: "placeholder-plane" | "stage-mesh";
      reflectionEnabled: boolean;
      overlayObjectCount: number | null;
      waterRegion: {
        width: number;
        depth: number;
        centerX: number;
        centerZ: number;
        y: number;
      } | null;
      originalWaterBoundsWorld: {
        minX: number;
        maxX: number;
        minZ: number;
        maxZ: number;
        y: number;
      } | null;
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
     * 検証用の層合成診断アクセサ。層合成の受け入れ診断ページ（layer-composite.html）だけが取り付ける。
     * 本番と同じ合成手順（3次元の合成→深度のみ消去→正射影で2次元層を最前面）で数フレーム描いた直後に、
     * 画面の画素を読み戻したスナップショットを返す。scripts/rendering-layer-smoke.mjs が取得する。
     * 各標本は赤・緑・青・不透明度の4成分（0以上255以下）の配列。共有型が rendering に依存しないよう
     * 素の構造で宣言する。
     */
    __layerCompositeState?: () => {
      webglAvailable: boolean;
      insideSamples: ReadonlyArray<readonly [number, number, number, number]>;
      outsideSample: readonly [number, number, number, number];
      sampleCount: number;
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
