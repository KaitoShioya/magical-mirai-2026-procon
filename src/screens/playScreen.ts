// プレイ画面（Issue #33）。本編表示（キネティックタイポ）を駆動する。
// 文脈のプレイ結線（ScreenContext.play）から描画基盤の場面・カメラ、音楽地図、ゲーム時刻、タイポ譜面を受け取り、
// 文字エンジンと駆動部（指揮者）を組み立てて毎フレーム動かす。読ませる役（可読な歌詞）と演出役（1文字1拍スマッシュ）を
// 表示し、歌詞が読めて再生位置へ同期する状態を成立させる。
//
// タップ入力・採点・状態表示・視点移動の演出・演出文法②〜⑥は本Issueの範囲外（Issue #59）。
// WebGL が無い端末・プレイ結線が無い場合は文字エンジンを組み立てず、画面遷移だけを成立させる（スモーク検証のため）。
// プレイ→結果の遷移は統括（src/app）が楽曲終了を検知して起こすため、本画面は遷移を要求しない。

import type { PlayWiring, Screen, ScreenContext, ScreenFactory } from "./types";
import { buildLyricsTimeline } from "../textalive";
import { createFallingLane, type FallingLane, createRankGauge, type RankGauge } from "../rendering";
import { computeOverlayFrustum } from "../rendering/viewport";
import {
  createKineticTextEngine,
  createFontRegistry,
  ZEN_KAKU_GOTHIC_NEW_CREDIT,
  createEffectRegistry,
  charSmash,
  isPlaceholderHandle,
  createConductor,
  prepareConductorContent,
  createCameraPlacement,
  findUnknownChartEffectIds,
  DEFAULT_READABILITY_OPTIONS,
  type KineticTextEngine,
  type Conductor,
  type ReadabilityOptions,
} from "../typography/kineticText";

/** 主フォントの論理名と所在（診断ページ diagnostics/main.ts と同じ資産）。 */
const FONT_NAME = "main";
const FONT_URL = "/fonts/zen-kaku-gothic-new-subset.woff";

/** 読ませる役・演出役を置くカメラ前方の正対面までの距離（世界座標、採用理由を先に述べる）。
 * 深夜の湖の舞台でカメラ前方に文字を置くため、近すぎて切れず遠すぎて霧（指数フォグ）に沈まない中間として
 * 8世界単位を初期値とする。実機調整で確定する暫定値。 */
const READING_PLANE_DISTANCE = 8;

/** 文字の基底塗り色（明るい白。可読性処理が発光を抑え縁取りで背景から分離する）。 */
const BASE_COLOR = 0xffffff;

/** 読ませる役の塗りの明るさの上限（線形相対輝度、採用理由を先に述べる）。
 * 画面のブルーム（発光）は相対輝度が閾値（src/rendering/constants.ts の BLOOM_THRESHOLD、0.5）を超える画素を
 * 光らせる。塗りを閾値ちょうどにすると、ブルームの滑らかな立ち上がり（knee）で部分的に発光して「輝く」見え方になる。
 * マット（光らない）にするため、閾値より明確に低い0.4へ抑える。0.4は、暗い湖の背景に対し十分に明るい灰白色で
 * 読める一方、ブルームに拾われない上限である。実機調整で確定する暫定値。 */
const READING_MATTE_MAX_LUMINANCE = 0.4;

/** 同時表示文字数の余裕（採用理由を先に述べる）。駆動部は同時に読ませる役1単位（最大でフレーズ全文字）を出すため、
 * 最大フレーズ文字数に余裕16を足した値を層の上限とすれば出現破棄が起きない。
 * 性能に基づく上限の精緻化は Issue #59 で行う。 */
const LAYER_LIMIT_MARGIN = 16;

/** タイポ譜面に配置指定が無いフレーズの可読性属性を、想定表示寸法を反映して作る。
 * 塗りの明るさの上限（maxBrightLuminance）を高く指定する理由を先に述べる。可読性処理は塗りの輝度を
 * ブルーム閾値以下へ収めるため min(指定値, ブルーム閾値) を採る。深夜の湖の暗い背景では塗りが暗いと読みにくく
 * 濁点などの細部が埋もれるため、ブルーム閾値まで明るくしたい。指定値を1にしておけば常にブルーム閾値が選ばれ、
 * にじみを避けつつ可能な限り明るい塗りになる。 */
function readabilityFor(pixelHeight: number): ReadabilityOptions {
  // 採用理由を先に述べる。塗りはマットにする（READING_MATTE_MAX_LUMINANCE の注記参照）。可読性処理は塗りの輝度を
  // min(maxBrightLuminance, エンジンのブルーム閾値) に収めるため、エンジン側のブルーム閾値を0.4にしたうえで
  // maxBrightLuminance を高く指定すれば、塗りは0.4のマットな灰白色になる。
  // 縁取りは細く（0.5%）する。太い縁は文字を潰し、暗い縁のぼかしは暗い景色へ溶けて文字を同化させるため、
  // 細い縁にとどめ、影のぼかしは0にする。
  return {
    ...DEFAULT_READABILITY_OPTIONS,
    minPixelHeight: pixelHeight,
    maxBrightLuminance: 1,
    borderWidth: "0.5%",
    shadowBlur: "0%",
  };
}

/** プレイ結線から文字エンジンと駆動部を組み立てる。準備未完了・WebGL無しのときは null を返す。 */
function buildPlayback(play: PlayWiring): { engine: KineticTextEngine; conductor: Conductor } | null {
  const source = play.musicMapSource();
  if (!play.webglAvailable() || !source.isReady()) {
    return null;
  }

  // 歌詞から、暖める文字集合と層の上限の基準（最大フレーズ文字数）を求める。
  const timeline = buildLyricsTimeline(source.lyricsVideo());
  const uniqueChars = new Set<string>();
  let maxPhraseChars = 0;
  for (const phrase of timeline.phrases) {
    let phraseChars = 0;
    for (const word of phrase.words) {
      for (const ch of word.chars) {
        for (const cp of ch.text) {
          uniqueChars.add(cp);
        }
        phraseChars += Array.from(ch.text).length;
      }
    }
    if (phraseChars > maxPhraseChars) {
      maxPhraseChars = phraseChars;
    }
  }
  // 読ませる役は英語の単語境界に空白を挿入するため、空白も暖め対象に含める（暖め未収録だと代替フォントへ回り
  // 文字が描かれなくなるのを防ぐ）。+1 は空白ぶんの同時表示文字数の余裕。
  uniqueChars.add(" ");
  const layerLimit = maxPhraseChars + LAYER_LIMIT_MARGIN + 1;

  const fonts = createFontRegistry();
  fonts.register({ name: FONT_NAME, url: FONT_URL, weight: 700, credit: ZEN_KAKU_GOTHIC_NEW_CREDIT });

  const camera = play.getWorldCamera();
  const engine = createKineticTextEngine({
    scene: play.getWorldScene(),
    camera,
    fonts,
    limits: { single: layerLimit, batched: layerLimit },
    viewportPixelHeight: play.viewportPixelHeight,
    // 可読性処理の塗りの明るさの上限を画面ブルーム閾値より低くして、塗りがブルームに拾われずマットになるようにする。
    bloomThreshold: READING_MATTE_MAX_LUMINANCE,
  });
  // 距離場の事前生成は非同期。待たずに進める（未生成の文字は描画時に生成され、初回だけ僅かに遅れる）。
  void engine.warmUp(Array.from(uniqueChars).join(""));

  // 譜面の記述ミス（未知の演出識別名）は適用時に黙って無視されるため、組み立て時に警告で気づけるようにする。
  // 警告（console.warn）であり、スモーク検証が失敗とみなすのは console.error のため、検証は妨げない。
  const unknownEffectIds = findUnknownChartEffectIds(play.typographyChart);
  if (unknownEffectIds.length > 0) {
    console.warn(`タイポ譜面に未知の演出識別名があります（無視されます）: ${unknownEffectIds.join(", ")}`);
  }

  const registry = createEffectRegistry();
  registry.register(charSmash);

  // 読ませる役の収まり判定（分割・縦抑制）は、ここでプレイ開始時の画面寸法を一度だけ読んで確定する。
  // 再生中の画面リサイズや端末の向きの変更で画面寸法が変わると、確定済みの分割が新しい幅に対して過不足になりうる。
  // 本Issue（#33）は固定寸法で被覆と分割を成立させるところまでを範囲とし、リサイズ・向き変更時の再レイアウトは
  // 描画系の本編結線を担う Issue #59 の範囲とする。カメラ配置（createCameraPlacement）は画面の縦寸法を毎フレーム読むため
  // 配置自体は寸法変化に追従するが、分割の確定は追従しない点を明示する。
  const content = prepareConductorContent({
    source,
    registry,
    chart: play.typographyChart,
    emotionAvailable: false,
    viewportPixelWidth: play.viewportPixelWidth(),
    viewportPixelHeight: play.viewportPixelHeight(),
    defaultReadingUnit: play.defaultReadingUnit,
    defaultReadingPixelHeight: play.defaultReadingPixelHeight,
    defaultReadingRegion: play.defaultReadingRegion,
  });

  const placement = createCameraPlacement(camera, play.viewportPixelHeight, {
    planeDistance: READING_PLANE_DISTANCE,
  });

  const conductor = createConductor({
    engine,
    placement,
    content,
    fontName: FONT_NAME,
    readabilityFor,
    baseColor: BASE_COLOR,
    isPlaceholder: isPlaceholderHandle,
  });

  return { engine, conductor };
}

export const createPlayScreen: ScreenFactory = (context: ScreenContext): Screen => {
  const element = document.createElement("section");
  element.className = "screen screen--play";
  element.dataset.screen = "play";

  const play = context.play;
  let engine: KineticTextEngine | null = null;
  let conductor: Conductor | null = null;
  // 落下式レーン（判定UI #57）。組み立て成功時に一度だけ生成し2次元層へ載せ、保持する。
  let lane: FallingLane | null = null;
  // ランク専用ゲージ（Issue #65）。レーンと同じ生命周期で生成・更新・破棄する。
  let rankGauge: RankGauge | null = null;
  // 組み立てを試みたか（音楽地図の準備完了を待って一度だけ組み立てる）。
  let built = false;

  function tryBuild(): void {
    if (built || play === undefined) {
      return;
    }
    const result = buildPlayback(play);
    if (result !== null) {
      engine = result.engine;
      conductor = result.conductor;
      // 落下式レーンを生成して2次元層へ載せる。準備待ちの再試行で重複生成しないよう、この一度きりの
      // 組み立ての中（built が偽の間のみ到達）で生成する。
      lane = createFallingLane({ notes: play.laneNotes });
      play.addOverlayObject(lane.object);
      // タップした瞬間に画面全体の波紋を立てる受け口として、このレーンの spawnTapRipple を統括へ登録する（Issue #202）。
      play.registerTapRipple((slotIndex0) => lane?.spawnTapRipple(slotIndex0));
      // ランク専用ゲージ（Issue #65）を生成して2次元層へ載せる。レーンと同じく組み立ての一度きりで生成する。
      rankGauge = createRankGauge();
      play.addOverlayObject(rankGauge.object);
      built = true;
    }
  }

  return {
    element,
    onEnter(): void {
      // 準備完了していれば組み立てる。未完了なら onUpdate で準備完了を待って組み立てる。
      tryBuild();
      // レーンガイド（Issue #58・Issue #202。レーンの仕切り線と単一判定線）をプレイ画面の表示中だけ出す。WebGL が無い端末では結線先が何もしない。
      play?.showPitchAxisGuide();
    },
    onUpdate(deltaMs: number): void {
      if (play === undefined) {
        return;
      }
      if (!built) {
        tryBuild();
      }
      const gameTimeMs = play.currentGameTimeMs();
      if (conductor !== null && engine !== null) {
        conductor.update(gameTimeMs);
        // 文字の寿命処理・カメラ正対・変形の時間進行を進める（描画は統括の renderRoot.render が行う）。
        engine.update({ gameTimeMs, frameDeltaMs: deltaMs });
      }
      if (lane !== null || rankGauge !== null) {
        // 縦横比は2次元層と同じ純粋関数で表示寸法から求める。最小読み取りサイズの計算に縦デバイス画素数も渡す。
        const viewportPixelHeight = play.viewportPixelHeight();
        const aspect = computeOverlayFrustum(play.viewportPixelWidth(), viewportPixelHeight).right;
        if (lane !== null) {
          lane.update({ gameTimeMs, aspect, viewportPixelHeight });
        }
        if (rankGauge !== null) {
          // 実スコア未供給（Issue #59 の結線前）の間は null。そのときは百分位0・ランク添字0（空・ランクC）で更新する。
          const gaugeInput = play.currentRankGaugeState() ?? { percentile: 0, rankIndex: 0 };
          rankGauge.update({
            percentile: gaugeInput.percentile,
            rankIndex: gaugeInput.rankIndex,
            aspect,
            viewportPixelHeight,
          });
        }
      }
    },
    onExit(): void {
      // レーンガイド（Issue #58・Issue #202）を非表示にし、その表示物の資源を解放する。
      play?.hidePitchAxisGuide();
      conductor?.dispose();
      conductor = null;
      engine?.dispose();
      engine = null;
      // タップの波紋の受け口を、これから外すレーンを参照しない無動作へ戻す（Issue #202）。
      play?.registerTapRipple(() => {});
      // 落下式レーンを2次元層から外して資源解放し、保持変数を空に戻す（重複生成の防止のため built も偽へ戻す）。
      if (lane !== null) {
        play?.removeOverlayObject(lane.object);
        lane.dispose();
        lane = null;
      }
      // ランク専用ゲージ（Issue #65）も同様に外して資源解放する。
      if (rankGauge !== null) {
        play?.removeOverlayObject(rankGauge.object);
        rankGauge.dispose();
        rankGauge = null;
      }
      built = false;
    },
  };
};
