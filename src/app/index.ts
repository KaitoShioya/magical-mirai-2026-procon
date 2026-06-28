// アプリ統括。画面状態の有限状態機械を組み立てて起動し、エンジンの固定時間刻みループで毎フレーム更新を駆動する。
// TextAlive の再生（src/textalive）を時間源として engine へ供給し、楽曲ロード失敗の導線（src/app/overlay）と
// 楽曲終了によるプレイ→結果遷移、タブ離脱時の楽曲停止・再開を結ぶ（Issue #4）。

import { DEFAULT_SONG_KEY, findSong, SONGS } from "../config/songs";
import { createClock, createLoop, createScheduler, createWorld } from "../engine";
import {
  createPlayScreen,
  createResultScreen,
  createRetryScreen,
  createScreenMachine,
  createTitleScreen,
  createWarmupScreen,
} from "../screens";
import type { ScreenContext, ScreenFactory, ScreenKey } from "../screens";
import { createFakePlayback, createTextAlivePlayback, type Playback } from "../textalive";
import { createOverlays } from "./overlay";
import { createRenderRoot, createPerfBudget } from "../rendering";
import { createBeatScheduler } from "../utils/beatScheduler";
import { createScreenShake, resolveBeatAmplitudes } from "../utils/screenShake";
import { MIKU_CHARACTER } from "../config/character";
import { LAKE_STAGE } from "../config/stage";
import { PITCH_SLOT_COUNT_DEFAULT } from "../config/tuning";
import { createAttributionBadge, type AttributionBadge } from "./attribution";
import { buildCreditRegistry } from "./credits/registry";
import { createCreditsView, type CreditsView } from "./credits/creditsView";
import { createCalibrationView, type CalibrationView } from "./calibration/calibrationView";
import { createHowToView, type HowToView } from "./howTo/howToView";
import { createOperationSoundEngine } from "../audio";
import { loadCalibrationOffsetMs, saveCalibrationOffsetMs, type FrameTimeSample } from "../scoring";
import {
  takeoverTypographyChart,
  TAKEOVER_DEFAULT_READING_PIXEL_HEIGHT,
  TAKEOVER_DEFAULT_READING_REGION,
} from "../profiles/takeover/typographyChart";
import { takeoverProfile } from "../profiles/takeover/profile";
import { createCameraTrajectory } from "../utils/cameraTrajectory";
import { createInput } from "../input";
import { createPlaySession } from "./playSession";

/** 統括の外部契約。後始末のみを公開する。 */
export interface App {
  dispose(): void;
}

/**
 * プレイ進入後に再生開始の成立を待つ上限（ミリ秒）。
 * 採用理由を先に述べる。再生開始の通知は再生位置更新の間隔（約50ミリ秒）に依存するため、その数回ぶんを
 * 超え、かつ操作の反応が遅く感じない範囲として400ミリ秒を、再生開始の成立を待つ上限とする。
 * これを超えても再生が始まらなければ「触れて再生」表示を出す。★暫定（実機で調整する）。
 */
const PLAYBACK_START_TIMEOUT_MS = 400;

/**
 * アプリを生成し、初期状態 title で起動して毎フレーム駆動を開始する。
 * 呼び出し側は別途 start を呼ばない。返り値は後始末用の dispose のみを持つ。
 * options.diagnostics が真のとき、検証用の状態アクセサを取り付け、トークン非依存の擬似再生を用いる。
 */
export function createApp(
  root: HTMLElement,
  options: {
    diagnostics: boolean;
    stageRoot: HTMLElement;
    reflectionResolution: number;
    bloomEnabled?: boolean;
  }
): App {
  const song = findSong(DEFAULT_SONG_KEY);

  // 描画基盤を常在領域へ載せ、起動直後にクリアカラーを適用する（Issue #8）。
  // 画面UIの背面に深夜の湖を描く。毎フレームの描画は下のループ onFrame で駆動する。
  // 反射解像度（Issue #9）とブルームの有無（Issue #11）は、入口（src/main.ts）が起動時パラメータ refl・bloom
  // から解釈した値を受け取り、そのまま描画基盤へ渡す。
  const renderRoot = createRenderRoot(options.stageRoot, {
    reflectionResolution: options.reflectionResolution,
    bloomEnabled: options.bloomEnabled,
  });

  // 演出カメラ軌跡（Issue #13・#59）。曲プロファイルのキーフレームから評価器を作り、プレイ中に毎フレーム駆動する。
  const cameraTrajectory = createCameraTrajectory(takeoverProfile.camera);

  // 性能バジェットの自動劣化制御（Issue #18）。診断の有無に依らず常時生成する。理由を先に述べる。これは実機の
  // 性能に追従する本番機能であり、本番ビルドでも監視と劣化適用を動かす必要がある。FPSの読み出し口（window.__fps
  // 系）だけを診断モードに限る。
  const perfBudget = createPerfBudget();

  // 診断モードの計測標本（試作ツール src/tools/perf/main.ts と同じ500ミリ秒区間・上限120）。本番では更新しない。
  // 制御器の2秒制御窓とは別に持つ理由を先に述べる。既存ハーネス（scripts/harness）の平均・下位パーセンタイル
  // 算出をそのまま再現するためで、用途が異なる。
  let diagLastFps = 0;
  let diagFpsWindowMs = 0;
  let diagFpsWindowFrames = 0;
  const diagFpsSamples: number[] = [];
  // 劣化段階の変化履歴（診断モードのみ）。累積時刻と変化後の段階を、段階変更が起きたときだけ追記する。
  let diagPerfClockMs = 0;
  const diagPerfHistory: { atMs: number; level: number }[] = [];
  // 履歴の保持上限。段階変更は滞留時間で律速され稀なため、上限で古いものを捨てても検証に支障はない。
  const DIAG_PERF_HISTORY_MAX = 240;

  // 中心キャラクター（初音ミク）のVRMを読み込み、成功したら中心の光柱からVRMへ差し替える（Issue #64）。
  // 非同期で読み込み、待たずに進める。失敗しても光柱の表示が続くため、結果を待つ必要はない。
  // 出典（ピアプロ・キャラクター・ライセンス）はミクを描画する間つねに表示する。
  // 診断モードでは読み込みも出典表示も行わない理由を先に述べる。画面遷移スモークは状態遷移の論理を検証する
  // もので、ウォームアップ完了はクランプ済みの経過時間の累積で判定する。容量の大きいVRM（スキンメッシュ）を
  // ソフトウェア描画で水面反射の二重描画まで行うとフレーム率が落ち、累積が想定より遅れて遷移を取りこぼす。
  // 診断モードは軽い光柱だけで中心を表し、遷移の検証を描画負荷から切り離す。通常モードは従来どおり読み込む。
  let attribution: AttributionBadge | null = null;
  if (!options.diagnostics) {
    void renderRoot.mountCenterCharacter(MIKU_CHARACTER);
    attribution = createAttributionBadge(MIKU_CHARACTER.credit);
    // 舞台土台（Issue #105）を非同期で読み込み、待たずに進める。失敗しても暫定平面の水面が続く。
    // 診断モードでは画面遷移スモークの描画負荷を抑えるため読み込まない（ミクと同じ判断）。地形を検証する
    // 専用診断ページ（stage.html）は別経路で必ず読む。
    void renderRoot.mountStageTerrain(LAKE_STAGE);
  }

  // 素材全体の出典を、操作で常時到達できるクレジット表示として常設する（Issue #82）。
  // ミクの描画に依存しない規約上の表示のため、診断モードと通常モードの両方で生成する。
  // これにより、トークン不要の診断経路（?smoke=1）でも表示を検証できる。
  const creditsView: CreditsView = createCreditsView(buildCreditRegistry(song));

  // 使い方説明の「これはなに？」常設トグル（世界観・操作方法・成果物）。クレジットと同じく両モードで生成し、
  // トークン不要の診断経路（?smoke=1）でも存在と開閉を検査できるようにする。楽曲の読み込み中はトグルを隠し、
  // 読み込みが終わってから renderOverlays が見せる（ロード中は同じ説明をロード覆いに出すため）。
  const howToView: HowToView = createHowToView();

  // 診断モード（?smoke=1）はトークン非依存の擬似再生、通常はトークンで実プレイヤーを使う。
  const playback: Playback = options.diagnostics
    ? createFakePlayback()
    : createTextAlivePlayback({ song, token: import.meta.env.VITE_TEXTALIVE_TOKEN });

  const overlays = createOverlays();
  const renderOverlays = (state = playback.getState()): void => {
    overlays.render(state, { onRetry: () => playback.retry() });
    // 確定前（読み込み中・エラー）は画面表示領域を操作不能にする。理由を先に述べる。
    // 受け入れ基準「onTimerReady後にUIが有効化」を、覆い隠すポインタの遮断だけでなく、
    // キーボード操作や焦点移動に対しても満たすため、確定するまで背面の操作を inert 属性で塞ぐ。
    if (state.status === "ready") {
      root.removeAttribute("inert");
    } else {
      root.setAttribute("inert", "");
    }
    // 「これはなに？」トグルは、楽曲の読み込みが終わってから見せる。ロード中は同じ説明をロード覆いに出すため、
    // トグルは出さない。読み込みが終わって以外（読み込み失敗）でも出さない。setToggleVisible(false) は、
    // パネルが開いていれば閉じ、操作不能になり得る画面表示領域へ焦点を移さない。
    howToView.setToggleVisible(state.status === "ready");
  };
  const unsubscribe = playback.subscribe(renderOverlays);
  renderOverlays();

  const factories: Record<ScreenKey, ScreenFactory> = {
    title: createTitleScreen,
    warmup: createWarmupScreen,
    play: createPlayScreen,
    result: createResultScreen,
    retry: createRetryScreen,
  };

  const machine = createScreenMachine(root, factories);

  // 操作音エンジン（Issue #52）。AudioContextの起動だけを本Issueで結線し、発音のトリガ（タップ→playSlot）は
  // 後続（#48・#59）が担う。通常モードと診断モードの両方で生成する。理由を先に述べる。音声エンジンは描画負荷を
  // 持たないため画面遷移スモークの検証を妨げず、両モードで生成して warmup で unlock を呼ぶことで、画面遷移スモーク
  //（?smoke=1 で warmup を含む全状態を走破する）が起動結線で未捕捉例外が出ないことを自動検査できる。
  const operationSound = createOperationSoundEngine();

  // レイテンシ較正（Issue #50）。題名画面から開く常設トグルのオーバーレイとして、入力の遅れの補正値を測り・保存する。
  // 副作用を持つ音エンジンと端末内保存は注入で渡す。基準音は明瞭に聞こえる高めの固定音高1つを用いる
  //（音高番号81＝880ヘルツ。会話帯域より高く、点滅の合図として聞き取りやすい）。生きた判定への結線は #59 が担う。
  const calibrationView: CalibrationView = createCalibrationView({
    getOutputLatencyMs: () => operationSound.outputLatencyMs,
    playReferenceTone: () => operationSound.playNote(81),
    unlockAudio: () => operationSound.unlock(),
    loadOffsetMs: () => loadCalibrationOffsetMs(),
    saveOffsetMs: (offsetMs: number) => saveCalibrationOffsetMs(offsetMs),
  });

  // 画面拡大・減衰揺れ（Issue #76）。ノーツの消滅（目標線到達）に同期して画面を一瞬拡大し減衰させる演出を結線する。
  // 拍時刻は曲プロファイル生成（#46）の beats から供給する（#59）。各拍の開始時刻と小節内位置を写す。拍走査器は全拍を
  // 走査し、強度は小節内位置で決める（小節頭を強く）が、発火はノーツのある拍だけに限る（下記 noteBeatIndices）。
  const screenShakeBeats: { startTimeMs: number; position: number }[] = takeoverProfile.beats.map(
    (beat) => ({ startTimeMs: beat.startTimeMs, position: beat.position })
  );
  const screenShakeAmplitudes = resolveBeatAmplitudes(screenShakeBeats);
  const beatScheduler = createBeatScheduler(screenShakeBeats.map((b) => b.startTimeMs));
  const screenShake = createScreenShake();
  // 画面振動をノーツの消滅に同期させるためのノーツ拍索引集合。各ノーツは拍上（beatIndex）に置かれ、自分の拍時刻で
  // 目標線へ達して消えるため、ノーツのある拍だけで振動を発火する。休符の拍では振動させないことで、振動が譜面の抑揚ある
  // リズムに同期して躍動感が出て、休符で静まる緩急が生まれる。beatIndex は beats 配列の添字で拍走査器の event.index と
  // 同じ意味である。
  const noteBeatIndices = new Set<number>(takeoverProfile.notes.map((note) => note.beatIndex));
  const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  // エンジンの固定時間刻みの時計・走査器・世界状態。プレイ画面の本編表示（Issue #33）が同期の基準として
  // world.gameTimeMs を読むため、画面文脈より前に生成する。ループ（下）も同じ実体を使う。
  const world = createWorld();
  const clock = createClock();
  const scheduler = createScheduler();

  // プレイ進行中だけ、タブ離脱時の楽曲停止・再開と、楽曲終了・再生開始の観測を行う。
  let inPlayPhase = false;
  // 再生開始の成立を待つ累積時間と、「触れて再生」表示中かどうか。
  let playStartElapsedMs = 0;
  let tapToPlayShown = false;
  // このプレイ進行中に「触れて再生」を一度でも触れたか。一度触れたら、このプレイ中は二度と出さない。
  let tapToPlayAcknowledged = false;

  // 判定の音楽時刻の復元に使うフレーム時刻標本（Issue #59）。onFrame 先頭で毎フレーム更新する。
  let latestFrameSample: FrameTimeSample = {
    musicPositionMs: 0,
    frameWallTimeMs: 0,
    reliableMusicTime: false,
  };
  // 直前フレームの再同期回数。当該フレームで再同期したか（resyncCount の増加）を検出するための比較基準。
  let prevResyncCount = 0;

  // プレイヤーのタップを画面全体の波紋へ届ける受け口（Issue #202）。プレイ画面が落下式レーンの spawnTapRipple を登録し、
  // 画面から抜けるときに何もしない受け口へ戻す。プレイ画面が組み立て前・WebGL が無い等で未登録のあいだは何もしない。
  let tapRippleSink: ((slotIndex0: number) => void) | null = null;

  // プレイ進行の判定・採点・音・光の統合（Issue #59）。曲プロファイルを渡し、副作用の出口（操作音・反応光点・
  // フレーム時刻標本・較正値）を注入する。較正値はプレイ開始ごとに読み直すため関数で渡す。
  const session = createPlaySession({
    profile: takeoverProfile,
    cameraTrajectory,
    operationSound,
    spawnReactionLight: (reactionLight) => renderRoot.spawnReactionButterfly(reactionLight),
    // 得点が0でないタップ（ノーツに当たったタップ）のレーンから、画面全体の水面の波紋を立てる（Issue #202）。
    // 受け口（tapRippleSink）はプレイ画面が落下式レーンの spawnTapRipple を登録する。未登録のあいだは何もしない。
    spawnTapRipple: (slotIndex0) => tapRippleSink?.(slotIndex0),
    getFrameSample: () => latestFrameSample,
    getCalibrationOffsetMs: () => loadCalibrationOffsetMs(),
  });

  // 入力（Issue #47・#59）。全画面（root）を入力面とし、プレイ進行中だけ有効化する。タップごとにセッションへ渡す。
  const input = createInput({
    target: root,
    onReaction: (reaction) => session.onReaction(reaction),
  });

  function enterPlay(): void {
    inPlayPhase = true;
    playStartElapsedMs = 0;
    tapToPlayShown = false;
    tapToPlayAcknowledged = false;
    overlays.hideTapToPlay();
    // プレイ開始ごとに画面拡大・減衰揺れの状態を初期化する（再挑戦で前回の拍・余韻を持ち越さない）。
    beatScheduler.reset();
    screenShake.reset();
    // プレイ進行の判定・採点・音・光のセッションを初期化し、入力を有効化する（Issue #59）。
    session.reset();
    input.setActive(true);
    playback.beginFromStart();
  }

  const context: ScreenContext = {
    // 題名画面の一覧表示に必要な部分だけを写す。楽曲ロードの詳細（URL・音楽地図ID）は画面層へ渡さない。
    songs: SONGS.map((entry) => ({
      key: entry.key,
      title: entry.title,
      artist: entry.artist,
      implemented: entry.implemented,
    })),
    requestTransition: (to: ScreenKey): void => {
      // 「はじめる」の操作の最中（題名→ウォームアップ）に音声再生の許可を最善努力で確立する。
      // 同じ確実な利用者操作の文脈で、操作音のオシレーター用AudioContextも起動する（戻り値は待たない）。
      if (to === "warmup") {
        playback.primeAudioPermission();
        void operationSound.unlock();
      }
      machine.requestTransition(to);
      // ウォームアップ→プレイの遷移が成立した後に、先頭から再生を開始する。
      if (to === "play") {
        enterPlay();
      }
    },
    // プレイ画面の本編表示の結線（Issue #33）。描画基盤の3D場面・カメラ、音楽地図、ゲーム時刻、TAKEOVERの
    // タイポ譜面と読ませる役の既定を渡す。診断・本番の双方で渡し、診断は擬似再生の音楽地図で動く。
    play: {
      getWorldScene: () => renderRoot.getWorldScene(),
      getWorldCamera: () => renderRoot.getWorldCamera(),
      webglAvailable: () => renderRoot.state().webglAvailable,
      musicMapSource: () => playback.musicMap(),
      currentGameTimeMs: () => world.gameTimeMs,
      typographyChart: takeoverTypographyChart,
      defaultReadingUnit: "phrase",
      defaultReadingPixelHeight: TAKEOVER_DEFAULT_READING_PIXEL_HEIGHT,
      defaultReadingRegion: TAKEOVER_DEFAULT_READING_REGION,
      // 読ませる役の収まり判定と最小表示寸法はデバイス画素で扱うため、表示寸法に画素密度倍率を掛ける。
      viewportPixelWidth: () =>
        Math.round(options.stageRoot.clientWidth * (window.devicePixelRatio || 1)),
      viewportPixelHeight: () =>
        Math.round(options.stageRoot.clientHeight * (window.devicePixelRatio || 1)),
      // 落下式レーン（判定UI #57）を2次元層へ載せる口と、レーンが描画するノーツ列（TAKEOVER曲プロファイルの
      // notes）。2次元層への追加・削除は描画基盤へ委譲する。
      addOverlayObject: (object) => renderRoot.addOverlayObject(object),
      removeOverlayObject: (object) => renderRoot.removeOverlayObject(object),
      laneNotes: takeoverProfile.notes,
      // レーンガイド（Issue #58・Issue #202。レーンの仕切り線と単一判定線）。音程スロット数（レーン数）は楽曲非依存の既定値を統括が注入する。
      // WebGL が無い端末では描画基盤側が何もしない。将来の曲別スロット数対応はこの注入箇所だけで変わる。
      showPitchAxisGuide: () => renderRoot.showPitchAxisGuide(PITCH_SLOT_COUNT_DEFAULT),
      hidePitchAxisGuide: () => renderRoot.hidePitchAxisGuide(),
      // タップを画面全体の波紋へ届ける受け口の登録（Issue #202）。プレイ画面が落下式レーンの spawnTapRipple を登録する。
      registerTapRipple: (sink) => {
        tapRippleSink = sink;
      },
      // ランク専用ゲージ（Issue #65・#59）の現在入力。プレイ進行セッションが実スコアの累積から百分位・
      // ランク添字（rankFromPercentile・rankOrdinal 由来）を供給する。
      currentRankGaugeState: () => session.rankGaugeState(),
    },
  };

  machine.start("title", context);

  // 毎フレームのプレイ進行の観測（再生開始の成立確認・楽曲終了）。
  function tickPlay(realDeltaMs: number): void {
    if (!inPlayPhase) {
      return;
    }
    // 再生開始の成立確認。一定時間内に始まらなければ「触れて再生」表示を一度だけ出す。
    if (!playback.hasStarted()) {
      playStartElapsedMs += realDeltaMs;
      if (
        playStartElapsedMs >= PLAYBACK_START_TIMEOUT_MS &&
        !tapToPlayShown &&
        !tapToPlayAcknowledged
      ) {
        tapToPlayShown = true;
        overlays.showTapToPlay(() => {
          // 触れた時点で表示を即座に消し、このプレイ中は二度と出さない（一度触れたら再表示しない）。
          // 表示中の状態も偽へ戻して、表示が消えているのに表示中が真のまま残る食い違いを避ける。
          // 再生開始の成否に依らず再表示しないため、押下後のちらつきと繰り返し表示が起きない。
          overlays.hideTapToPlay();
          tapToPlayShown = false;
          tapToPlayAcknowledged = true;
          playback.play();
        });
      }
    } else if (tapToPlayShown) {
      tapToPlayShown = false;
      overlays.hideTapToPlay();
    }
    // 楽曲終了でプレイ→結果へ一度だけ遷移する。
    if (playback.hasEnded()) {
      inPlayPhase = false;
      overlays.hideTapToPlay();
      // 入力を無効化する（結果画面ではタップを判定・採点へ流さない）。最終スコアは session.finalResult() で
      // 取得でき、結果画面への引き渡しは結果画面の実装（Issue #74）が結線する。
      input.setActive(false);
      machine.requestTransition("result");
    }
  }

  // エンジンの固定時間刻みループ。判定・得点は再生位置由来のゲームの時計で進め、UIは実経過ミリ秒で進める。
  // 時計・走査器・世界状態は上で生成済み（プレイ画面が world を参照するため文脈より前に置いた）。
  const loop = createLoop({
    timeSource: playback.timeSource,
    clock,
    scheduler,
    world,
    onSimulationStep: (stepEndGameTimeMs: number): void => {
      world.step(stepEndGameTimeMs);
    },
    onFrame: (realDeltaMs: number): void => {
      // 判定の音楽時刻標本（Issue #59）を毎フレーム先頭で更新する。順序を固定する:
      // (1) 実時計を読む (2) ループ状態を読む (3) 当該フレームの再同期を検出する (4) 比較の直後に前回値を更新する
      // (5) 信頼性を求める (6) 標本を確定する。順序を固定する理由は、更新を比較より前に置くと当該フレームの再同期を
      // 常に見逃し、後のフレームまで遅らせると次フレームで重複検出するためである。音楽時刻は平滑化値 clock.gameTimeMs
      //（loop.state().gameTimeMs）を使い、実時計は描画合図時刻と1ミリ秒未満しか違わない performance.now() を読む。
      const frameWallTimeMs = performance.now();
      const engineState = loop.state();
      const didResync = engineState.resyncCount !== prevResyncCount;
      prevResyncCount = engineState.resyncCount;
      latestFrameSample = {
        musicPositionMs: engineState.gameTimeMs,
        frameWallTimeMs,
        reliableMusicTime:
          engineState.ready &&
          engineState.hasClockSample &&
          playback.timeSource.isPlaying() &&
          !didResync,
      };

      // 自動劣化制御（Issue #18）。毎フレームの実経過を制御器へ渡し、段階が変化したときだけ描画へ適用する。
      // 適用結果の実効変化の有無を制御器へ返す（端末画素密度倍率が1以下で段階0→1が無変化のときの判定に使う）。
      const perfDecision = perfBudget.recordFrame(realDeltaMs);
      if (perfDecision.changed) {
        const applied = renderRoot.applyPerformanceLevel(perfDecision.level);
        perfBudget.notifyApplied(applied.effectiveChanged);
      }
      // 診断モードのみ、計測標本と段階変化履歴を更新する（本番では公開も更新もしない）。
      if (options.diagnostics) {
        diagLastFps = realDeltaMs > 0 ? Math.round(1000 / realDeltaMs) : 0;
        diagFpsWindowMs += realDeltaMs;
        diagFpsWindowFrames += 1;
        if (diagFpsWindowMs >= 500) {
          diagFpsSamples.push(Math.round((diagFpsWindowFrames * 1000) / diagFpsWindowMs));
          if (diagFpsSamples.length > 120) {
            diagFpsSamples.shift();
          }
          diagFpsWindowMs = 0;
          diagFpsWindowFrames = 0;
        }
        diagPerfClockMs += realDeltaMs;
        if (perfDecision.changed) {
          diagPerfHistory.push({ atMs: diagPerfClockMs, level: perfDecision.level });
          if (diagPerfHistory.length > DIAG_PERF_HISTORY_MAX) {
            diagPerfHistory.shift();
          }
        }
      }
      // カメラ軌跡駆動（Issue #13・#59）。プレイ進行中だけ、平滑化した音楽時刻でカメラ姿勢を更新する。
      // 文字配置（createCameraPlacement）がカメラ姿勢を毎フレーム読むため、文字駆動 machine.update より前に置く。
      // 投下区間判定・スロット音高の更新も同じ音楽時刻でセッションへ進める。
      if (inPlayPhase) {
        const musicTimeMs = engineState.gameTimeMs;
        const pose = cameraTrajectory.poseAt(musicTimeMs);
        renderRoot.setCameraPose(pose.position, pose.target);
        session.updateFrame(musicTimeMs);
      }
      machine.update(realDeltaMs);
      tickPlay(realDeltaMs);
      // 画面拡大・減衰揺れ（Issue #76）。プレイ進行中だけノーツの消滅へ反応させ、それ以外は恒等へ戻す。
      // 拍の時刻源はゲームの時計 world.gameTimeMs（再生位置の平滑化値）で、advanceFrame が onFrame より
      // 先にこれを更新するため当該フレームの最新値になる。画面寸法は canvas を載せた常在領域から毎フレーム読む。
      if (inPlayPhase) {
        const gameTimeMs = world.gameTimeMs;
        // 再生位置の飛び（スタート直後の同期確立・タブ復帰・シーク）では、飛び区間の拍を一括発火させず基準を貼り直す。
        // 理由を先に述べる。一括発火は screenShake.trigger が最新拍だけを残すため飛び区間の手前のノーツの振動が失われ、
        // スタート直後にノーツと振動がずれる。clock の再同期（didResync）を拍走査器へ伝えて syncTo で基準を貼り直し、
        // 飛びの直後の拍から正しく振動を発火させる。
        if (didResync) {
          beatScheduler.syncTo(gameTimeMs);
        }
        beatScheduler.advance(gameTimeMs, (event): void => {
          // ノーツのある拍（ノーツが目標線に達して消える瞬間）だけ振動させる。休符の拍では振動させない。
          // 全区間（サビ以外も含む）でノーツに同期させる方針をユーザーが確定したため、#198 のサビ区間限定の
          // 発火条件は用いない（振幅の縮小は screenShake.ts 側で保持される）。
          if (!noteBeatIndices.has(event.index)) {
            return;
          }
          screenShake.trigger(event.timeMs, screenShakeAmplitudes[event.index], event.index);
        });
        const transform = screenShake.evaluate(
          gameTimeMs,
          options.stageRoot.clientWidth,
          options.stageRoot.clientHeight,
          reduceMotionQuery.matches
        );
        renderRoot.setScreenTransform(transform.scale, transform.offsetX, transform.offsetY);
      } else {
        renderRoot.setScreenTransform(1, 0, 0);
      }
      // 中心オブジェクト（Issue #64）を毎フレーム進めてから描く。秒へ変換する理由を先に述べる。
      // three.js のVRM更新は経過時間を秒で受け取る仕様のため、1秒=1000ミリ秒の関係でミリ秒を1000で割る。
      renderRoot.update(realDeltaMs / 1000);
      // 状態の更新後に1フレーム描く。タブ非表示中は loop が onFrame を呼ばないため描画も止まる。
      renderRoot.render();
    },
    // タブ非表示・ページ退避で楽曲を止め、復帰で再開する（プレイ進行中のみ）。
    // 再開時の3-2-1カウントインは設けない暫定挙動であり、Issue #112 がカウントインへ差し替える。
    onPause: (): void => {
      if (inPlayPhase) {
        playback.pause();
      }
    },
    onResume: (): void => {
      // タブ復帰でフレームが間隔をあけて再開するため、制御器の時間窓を初期化して復帰前の古い標本を混ぜない
      // （段階は保持される）。プレイ進行の有無に依らず行う。
      perfBudget.reset();
      if (inPlayPhase) {
        playback.play();
      }
    },
  });
  loop.start();

  // 診断モード時のみ、読み取り専用アクセサを取り付ける（取り付けと削除を統括に一本化）。
  if (options.diagnostics) {
    window.__screenHistory = (): readonly string[] => machine.history();
    window.__engineState = () => loop.state();
    window.__renderState = () => renderRoot.state();
    // プレイ進行セッション（Issue #59）の読み取り専用診断。通しスモークが採点・投下・発音の進行を確かめる。
    window.__playSession = () => session.diagnostics();
    // 性能計測フック（Issue #18）。試作ツールと同じ契約名で、本編アプリでも scripts/harness が計測できる。
    window.__fps = (): number => diagLastFps;
    window.__avgFps = (): number =>
      diagFpsSamples.length
        ? diagFpsSamples.reduce((acc, value) => acc + value, 0) / diagFpsSamples.length
        : 0;
    window.__fpsSamples = (): readonly number[] => diagFpsSamples.slice();
    window.__resetFps = (): void => {
      diagFpsSamples.length = 0;
      diagFpsWindowMs = 0;
      diagFpsWindowFrames = 0;
      diagLastFps = 0;
      perfBudget.reset();
    };
    window.__drawCalls = (): number => renderRoot.state().drawCalls;
    window.__perfLevel = (): number => renderRoot.state().degradationLevel;
    window.__perfLevelHistory = (): readonly { atMs: number; level: number }[] =>
      diagPerfHistory.slice();
  }

  return {
    dispose(): void {
      loop.dispose();
      machine.dispose();
      unsubscribe();
      overlays.dispose();
      attribution?.dispose();
      creditsView.dispose();
      howToView.dispose();
      calibrationView.dispose();
      operationSound.dispose();
      // 入力（Issue #59）の待ち受けを解除する。
      input.dispose();
      playback.dispose();
      renderRoot.dispose();
      // 確定前に破棄された場合に備え、renderOverlays が付けた inert 属性を外す。
      root.removeAttribute("inert");
      if (options.diagnostics) {
        delete window.__screenHistory;
        delete window.__engineState;
        delete window.__renderState;
        delete window.__playSession;
        delete window.__fps;
        delete window.__avgFps;
        delete window.__fpsSamples;
        delete window.__resetFps;
        delete window.__drawCalls;
        delete window.__perfLevel;
        delete window.__perfLevelHistory;
      }
    },
  };
}
