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
import { createRenderRoot } from "../rendering";
import { MIKU_CHARACTER } from "../config/character";
import { LAKE_STAGE } from "../config/stage";
import { createAttributionBadge, type AttributionBadge } from "./attribution";
import { buildCreditRegistry } from "./credits/registry";
import { createCreditsView, type CreditsView } from "./credits/creditsView";

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

  // プレイ進行中だけ、タブ離脱時の楽曲停止・再開と、楽曲終了・再生開始の観測を行う。
  let inPlayPhase = false;
  // 再生開始の成立を待つ累積時間と、「触れて再生」表示中かどうか。
  let playStartElapsedMs = 0;
  let tapToPlayShown = false;
  // このプレイ進行中に「触れて再生」を一度でも触れたか。一度触れたら、このプレイ中は二度と出さない。
  let tapToPlayAcknowledged = false;

  function enterPlay(): void {
    inPlayPhase = true;
    playStartElapsedMs = 0;
    tapToPlayShown = false;
    tapToPlayAcknowledged = false;
    overlays.hideTapToPlay();
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
      if (to === "warmup") {
        playback.primeAudioPermission();
      }
      machine.requestTransition(to);
      // ウォームアップ→プレイの遷移が成立した後に、先頭から再生を開始する。
      if (to === "play") {
        enterPlay();
      }
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
      machine.requestTransition("result");
    }
  }

  // エンジンの固定時間刻みループ。判定・得点は再生位置由来のゲームの時計で進め、UIは実経過ミリ秒で進める。
  const world = createWorld();
  const clock = createClock();
  const scheduler = createScheduler();
  const loop = createLoop({
    timeSource: playback.timeSource,
    clock,
    scheduler,
    world,
    onSimulationStep: (stepEndGameTimeMs: number): void => {
      world.step(stepEndGameTimeMs);
    },
    onFrame: (realDeltaMs: number): void => {
      machine.update(realDeltaMs);
      tickPlay(realDeltaMs);
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
  }

  return {
    dispose(): void {
      loop.dispose();
      machine.dispose();
      unsubscribe();
      overlays.dispose();
      attribution?.dispose();
      creditsView.dispose();
      playback.dispose();
      renderRoot.dispose();
      // 確定前に破棄された場合に備え、renderOverlays が付けた inert 属性を外す。
      root.removeAttribute("inert");
      if (options.diagnostics) {
        delete window.__screenHistory;
        delete window.__engineState;
        delete window.__renderState;
      }
    },
  };
}
