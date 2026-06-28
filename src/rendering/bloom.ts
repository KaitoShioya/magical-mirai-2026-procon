// ブルーム後処理（Issue #11）と拍同期ポストエフェクト（Issue #17）。発光点をにじませ、周縁を減光し、強拍時に
// 色収差を出す。合成器（EffectComposer）に「シーン描画→ブルーム→ポストエフェクト→最終出力」の順でパスを積み、
// ブルームのぼかしだけを表示寸法の半分の解像度で行う。renderRoot.ts から生成して使う。判定・得点・時刻の論理は
// 持たず、profiles・tools は import しない（依存規則 docs/decisions/architecture.md §5）。ポストエフェクトの拍同期の
// 時刻評価は呼び出し側（utils の拍バースト包絡）が行い、ここは色収差強度の値を受け取って uniform へ渡すだけである。

import type { Camera, Scene, WebGLRenderer } from "three";
import { Vector2, WebGLRenderTarget, UnsignedByteType, RGBAFormat } from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import {
  BLOOM_RADIUS,
  BLOOM_RESOLUTION_SCALE,
  BLOOM_STRENGTH,
  BLOOM_THRESHOLD,
  POST_CHROMA_MAX_OFFSET,
  POST_VIGNETTE_BASE_STRENGTH,
} from "./constants";
import { VIGNETTE_CHROMA_SHADER } from "./postEffectShader";
import { computeBloomResolution } from "./viewport";

/** 診断・検証用のブルーム状態（window.__renderState 内の bloom が返す素の構造）。 */
export interface BloomState {
  /** ブルームが有効なら真。?bloom=0 で偽になる。 */
  enabled: boolean;
  /** にじみの強さ。 */
  strength: number;
  /** にじみの広がり。 */
  radius: number;
  /** にじませる明るさの下限。 */
  threshold: number;
  /**
   * ブルームのぼかしへ渡した入力解像度（表示寸法×倍率を切り捨てた値、下限1）。
   * 内部の描画対象はこの値の round(÷2) からさらに半減するため、ここは内部描画対象の寸法ではなく入力値を指す。
   */
  bloomInputWidth: number;
  bloomInputHeight: number;
  /** 現在のブルーム解像度倍率（自動劣化制御 Issue #18 が実行時に下げる値。既定 BLOOM_RESOLUTION_SCALE）。 */
  resolutionScale: number;
  /** 最終出力パス（線形→sRGB変換とトーンマッピング）が有効なら真。色管理が働くための必要条件。 */
  outputPassEnabled: boolean;
  /** 拍同期ポストエフェクト（Issue #17）のパスが有効なら真。ShaderPass の enabled をそのまま返す（uniform値とは別）。 */
  postEffectEnabled: boolean;
  /** 周縁減光の基準強度（uniform vignetteStrength の現在値）。常時一定で、生成時に定数で設定する。 */
  vignetteStrength: number;
  /** 色収差バーストの現在強度（0から1）。uniform chromaOffset を最大ずれ量で割り戻した値。強拍直後に最大、減衰で0。 */
  chromaIntensity: number;
}

/** ブルーム合成の外部契約。 */
export interface BloomComposer {
  /** 1フレーム描く（合成パイプライン経由）。 */
  render(): void;
  /** 表示寸法の変更を反映する。往復バッファを描画バッファ全解像度へ合わせ、ブルーム入力解像度を半分へ再適用する。 */
  setSize(displayWidth: number, displayHeight: number): void;
  /**
   * ブルーム解像度倍率を実行時に変える（自動劣化制御 Issue #18）。記憶している最後の表示寸法に対して
   * 入力解像度を再適用する。有限かつ0超1以下でなければ無視する。倍率が実際に変わったら true を返す。
   * 画素密度倍率には触れない（端末画素密度は変わらないため）。
   */
  setResolutionScale(scale: number): boolean;
  /**
   * ブルームの有効・無効を実行時に切り替える（自動劣化制御 Issue #18）。無効でも合成器の経路を通し、
   * 最終出力パスが画面へ出るため色管理は保たれる。有効状態が実際に変わったら true を返す。
   */
  setEnabled(enabled: boolean): boolean;
  /**
   * 拍同期ポストエフェクト（Issue #17）の色収差バースト強度を注入する。intensity は0から1で、強拍直後に1、
   * 減衰で0へ向かう。実装は非有限値を0に、範囲外を0から1へ丸めてから最大ずれ量を掛けて uniform へ渡す。
   * 非有限値を防ぐ理由を先に述べる。非数が uniform に入ると画面全体が壊れる。このセッタは uniform 値を更新する
   * だけで、後処理パスの有効・無効は変えない（有効・無効は生成時の postEffectEnabled が唯一の決定点）。
   */
  setChromaBurstIntensity(intensity: number): void;
  /** 診断・検証用の現在状態を返す。 */
  state(): BloomState;
  /** 後始末。各パスと合成器のGPU資源を解放する。 */
  dispose(): void;
}

/**
 * ブルーム合成を生成する。レンダラ・シーン・透視投影カメラはこの合成が描画に用いる。
 * options.enabled が偽のときはブルームのパスを無効にし、シーン描画と最終出力だけを通す。
 * このとき合成器は isLastEnabledPass により最終の有効パス（最終出力パス）を画面へ出力するため、ブルームの
 * 寄与だけが無くなり色管理は維持される。
 * options.postEffectEnabled が偽（省略時）のときは拍同期ポストエフェクト（Issue #17）のパスを無効にし、
 * 既存の見えを変えない。本編での有効化は #59 が createRenderRoot 経由で行う。
 */
export function createBloomComposer(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: Camera,
  options: {
    enabled: boolean;
    displayWidth: number;
    displayHeight: number;
    postEffectEnabled?: boolean;
  }
): BloomComposer {
  const composer = new EffectComposer(renderer);

  const renderPass = new RenderPass(scene, camera);
  // 構築時の解像度引数は仮の値（1×1）でよい。理由を先に述べる。EffectComposer.addPass は追加時に当該パスへ
  // 描画バッファ全解像度を設定するため、この引数は addPass の後の applyBloomResolution で上書きされる。
  const bloomPass = new UnrealBloomPass(
    new Vector2(1, 1),
    BLOOM_STRENGTH,
    BLOOM_RADIUS,
    BLOOM_THRESHOLD
  );
  bloomPass.enabled = options.enabled;

  // 拍同期ポストエフェクト（Issue #17）。周縁減光と色収差を1枚のシェーダで束ね、ブルームと最終出力の間に
  // 挟んで線形空間で作用させる（OutputPass を唯一の色管理段に保つため、その前段に置く）。ビネット強度は常時
  // 一定のため生成時に定数で一度だけ設定し、色収差は setChromaBurstIntensity で毎フレーム駆動する。
  const postEffectPass = new ShaderPass(VIGNETTE_CHROMA_SHADER);
  postEffectPass.enabled = options.postEffectEnabled ?? false;
  postEffectPass.uniforms.vignetteStrength.value = POST_VIGNETTE_BASE_STRENGTH;
  postEffectPass.uniforms.chromaOffset.value = 0;

  // ポストエフェクトの resolution uniform を表示寸法から設定する。寸法を1以上に丸める理由を先に述べる。
  // シェーダは縦横比を resolution.x / resolution.y で求めるため、非表示タブや異常なリサイズで高さが0になると
  // 縦横比が発散し描画が壊れる。0除算を未然に防ぐため、注入する寸法を最小1に丸める。
  function applyPostEffectResolution(displayWidth: number, displayHeight: number): void {
    postEffectPass.uniforms.resolution.value.set(Math.max(1, displayWidth), Math.max(1, displayHeight));
  }
  applyPostEffectResolution(options.displayWidth, options.displayHeight);

  const outputPass = new OutputPass();

  composer.addPass(renderPass);
  composer.addPass(bloomPass);
  composer.addPass(postEffectPass);
  composer.addPass(outputPass);

  // 適用済みの画素密度倍率を保持する。採用理由を先に述べる。EffectComposer は構築時の画素密度倍率を内部に
  // 保持し setSize では読み直さないため、別密度の画面へ移ったときだけ setPixelRatio を呼ぶ判定に用いる。
  let currentPixelRatio = renderer.getPixelRatio();

  // ブルーム入力解像度を診断用に保持する（最後に適用した値）。
  let bloomInputWidth = 1;
  let bloomInputHeight = 1;

  // 現在のブルーム解像度倍率。採用理由を先に述べる。自動劣化制御（Issue #18）が実行時に倍率を下げてブルームの
  // 負荷を減らすため、構築時のモジュール定数ではなく可変の閉包変数で持つ。既定は半解像度。
  let currentBloomScale = BLOOM_RESOLUTION_SCALE;
  // 最後に適用した表示寸法。採用理由を先に述べる。実行時の倍率変更はリサイズの合間に起こり、最後に確定した
  // 表示寸法に対して入力解像度を再適用する必要があるため記憶する。
  let lastDisplayWidth = options.displayWidth;
  let lastDisplayHeight = options.displayHeight;

  // ブルーム入力解像度（表示寸法×倍率）を bloomPass へ適用する。
  // 採用理由を先に述べる。EffectComposer.addPass と EffectComposer.setSize は対象パスへ描画バッファ全解像度を
  // 設定するため、構築時の解像度引数だけでは縮小が上書きされる。よって addPass の後とリサイズの後と倍率変更の
  // 後に明示的に呼び、ブルームのぼかしだけを縮小解像度に保つ。
  function applyBloomResolution(displayWidth: number, displayHeight: number): void {
    lastDisplayWidth = displayWidth;
    lastDisplayHeight = displayHeight;
    const resolution = computeBloomResolution(displayWidth, displayHeight, currentBloomScale);
    bloomInputWidth = resolution.x;
    bloomInputHeight = resolution.y;
    bloomPass.setSize(resolution.x, resolution.y);
  }

  // 全パス追加後に縮小解像度を確定し、初回フレームから縮小解像度にする。
  applyBloomResolution(options.displayWidth, options.displayHeight);

  return {
    render(): void {
      composer.render();
    },
    setSize(displayWidth: number, displayHeight: number): void {
      // 呼び出し側（renderRoot.ts の resize）は、画素密度倍率が変わったとき renderer.setPixelRatio を呼んでから
      // この setSize を呼ぶ。よって renderer.getPixelRatio() は反映済みの最新倍率を返す。
      const nextPixelRatio = renderer.getPixelRatio();
      // 画素密度倍率が変わったときだけ合成器へ反映する。理由を先に述べる。setPixelRatio は内部で setSize を
      // 再実行して往復バッファを再確保するため、変化時のみに限って無駄な再確保を避ける。倍率変化時に呼ぶ
      // 必要があるのは、合成器が構築時の倍率を保持し setSize では読み直さないためである。
      if (nextPixelRatio !== currentPixelRatio) {
        currentPixelRatio = nextPixelRatio;
        composer.setPixelRatio(nextPixelRatio);
      }
      composer.setSize(displayWidth, displayHeight);
      // ブルーム入力解像度の再適用は composer.setSize の後に行う。理由を先に述べる。composer.setSize は各パスへ
      // 描画バッファ全解像度を設定し bloomPass を全解像度へ戻すため、その後に半解像度を上書きしないと全解像度が
      // 残り半解像度が失われる。順序を逆にしてはならない。
      applyBloomResolution(displayWidth, displayHeight);
      // ポストエフェクトの縦横比追従。理由を先に述べる。シェーダで使うのは縦横比だけであり、表示寸法でも
      // 描画バッファ寸法でも比は同じため、createBloomComposer と同じ引数の表示寸法を入れて取り違えを防ぐ。
      // 更新を漏らすと縦横比変化時に減光・色収差が楕円に歪む。寸法は applyPostEffectResolution で1以上に丸める。
      applyPostEffectResolution(displayWidth, displayHeight);
    },
    setChromaBurstIntensity(intensity: number): void {
      // 非有限値を0に、範囲外を0から1へ丸めてから最大ずれ量を掛けて uniform へ渡す（非数の混入で画面が壊れるのを防ぐ）。
      const safe = Number.isFinite(intensity) ? Math.min(1, Math.max(0, intensity)) : 0;
      postEffectPass.uniforms.chromaOffset.value = safe * POST_CHROMA_MAX_OFFSET;
    },
    setResolutionScale(scale: number): boolean {
      // 不正な倍率（非有限・0以下・1超）は無視する。1超を弾くのは、ブルームのぼかしは表示寸法以下で行う後処理で
      // あり、表示寸法を超える入力解像度は意味が無く負荷だけ増えるためである。
      if (!Number.isFinite(scale) || scale <= 0 || scale > 1) {
        return false;
      }
      if (scale === currentBloomScale) {
        return false;
      }
      currentBloomScale = scale;
      // 記憶している最後の表示寸法で入力解像度を再適用する。composer.setSize は呼ばない（倍率変更は描画バッファ
      // 全解像度も画素密度倍率も変えないため、bloomPass の入力解像度だけを更新すればよい）。
      applyBloomResolution(lastDisplayWidth, lastDisplayHeight);
      return true;
    },
    setEnabled(enabled: boolean): boolean {
      if (bloomPass.enabled === enabled) {
        return false;
      }
      // ブルームのパスだけを有効・無効にする。合成器は最終の有効パス（最終出力パス）を画面へ出すため、無効でも
      // シーン描画と色管理は保たれる。描画バッファの再確保は伴わない。
      bloomPass.enabled = enabled;
      return true;
    },
    state(): BloomState {
      return {
        enabled: bloomPass.enabled,
        strength: bloomPass.strength,
        radius: bloomPass.radius,
        threshold: bloomPass.threshold,
        bloomInputWidth,
        bloomInputHeight,
        resolutionScale: currentBloomScale,
        outputPassEnabled: outputPass.enabled,
        postEffectEnabled: postEffectPass.enabled,
        vignetteStrength: postEffectPass.uniforms.vignetteStrength.value,
        // uniform は最大ずれ量を掛けた後の値のため、割り戻して0から1の強度として返す。
        chromaIntensity: postEffectPass.uniforms.chromaOffset.value / POST_CHROMA_MAX_OFFSET,
      };
    },
    dispose(): void {
      // EffectComposer.dispose は各パスを破棄しないため、各パスを明示的に破棄する。
      // three.js 0.184 では基底クラス Pass の dispose は何もしない実装で、RenderPass はこれを上書きせず固有の
      // GPU資源も持たないため renderPass.dispose は無害な空処理である。それでも対称性のため全パスを破棄するのは、
      // 将来 RenderPass が資源を持つ実装になった場合の解放漏れを未然に防ぐためである。
      // この後始末はレンダラ破棄より先に呼ぶ（呼び出し側 renderRoot.ts で順序を守る）。
      renderPass.dispose();
      bloomPass.dispose();
      postEffectPass.dispose();
      outputPass.dispose();
      composer.dispose();
    },
  };
}

/** 成果物画像のキャプチャ用合成器の外部契約（成果物タスク #69）。 */
export interface ArtifactCaptureComposer {
  /** 出力解像度で1枚描いて読み戻し、8ビットの画素（赤緑青と不透明度の並び、左下原点）を返す。 */
  capturePixels(): Uint8Array;
  /** GPU資源（描画対象・各パス・合成器）を解放する。 */
  dispose(): void;
}

/**
 * 成果物画像のキャプチャ用合成器を作る（成果物タスク #69）。本編と同じパスの並び（シーン描画→ブルーム→周縁減光と色収差→
 * 最終出力）を、画面へ出さず固定の出力解像度で組み立て、読取バッファから8ビットの画素を読み戻す。
 * 本編の合成器（createBloomComposer）と1つのファイルにまとめる理由を先に述べる。ブルームの定数とパスの並びを別々に
 * 書くと、本編を変えたとき成果物の見えがずれる（ドリフト）。同じファイルで同じ定数を使い、見えを揃える。
 *
 * 画面へ出さない設定にする理由を先に述べる。最終出力パスを画面でなく合成器の内部バッファへ描くことで、描いた結果を
 * 画素として読み戻せる。
 *
 * 読取対象を8ビット整数（UnsignedByteType・RGBAFormat）にする理由を先に述べる。three.js の既定では合成器の内部
 * 描画対象が半精度浮動小数で作られ、Uint8Array へ読み戻すと型が食い違い読み戻せない。最終出力パスがトーンマッピングと
 * 線形からsRGBへの変換を済ませた結果は0から1に収まるため、8ビット整数の対象へ書けば情報を失わず可搬に読み戻せる。
 *
 * 呼び出し側（renderRoot.captureArtifact）は、本合成器を作る前にレンダラの画素密度倍率を1へ退避し、作った後に
 * 本合成器を破棄してから倍率と表示寸法を元へ戻す。倍率を1にする理由を先に述べる。合成器は構築時のレンダラ倍率で
 * 内部バッファの実画素数を決めるため、倍率1で作れば width×height の実画素数になり、読み戻す寸法が出力解像度と一致する。
 */
export function createArtifactCaptureComposer(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: Camera,
  options: {
    width: number;
    height: number;
    bloomEnabled: boolean;
    postEffectEnabled: boolean;
  }
): ArtifactCaptureComposer {
  const { width, height, bloomEnabled, postEffectEnabled } = options;

  // 8ビット整数の読取対象。深度バッファは既定で持つ（シーン描画の深度に使う）。色空間は既定（変換を重ねない）にする。
  // 重ねない理由を先に述べる。最終出力パスが既にsRGBへ変換しているため、読取対象側で再度の色変換を入れると二重に
  // なる。読み戻した8ビットの並びをそのまま2次元キャンバスへ載せれば画面と同じ色になる。
  const captureTarget = new WebGLRenderTarget(width, height, {
    type: UnsignedByteType,
    format: RGBAFormat,
  });

  const composer = new EffectComposer(renderer, captureTarget);
  // 画面へ出さない。これにより最終出力パスは画面でなく合成器の内部バッファへ描き、結果を読み戻せる。
  composer.renderToScreen = false;
  composer.setSize(width, height);

  const renderPass = new RenderPass(scene, camera);
  const bloomPass = new UnrealBloomPass(new Vector2(1, 1), BLOOM_STRENGTH, BLOOM_RADIUS, BLOOM_THRESHOLD);
  bloomPass.enabled = bloomEnabled;
  // ブルームのぼかしの入力解像度を本編と同じ規則（表示寸法×倍率）で縮小する。本編と同じ見えにするため同じ規則を使う。
  const bloomResolution = computeBloomResolution(width, height, BLOOM_RESOLUTION_SCALE);
  bloomPass.setSize(bloomResolution.x, bloomResolution.y);

  const postEffectPass = new ShaderPass(VIGNETTE_CHROMA_SHADER);
  postEffectPass.enabled = postEffectEnabled;
  postEffectPass.uniforms.vignetteStrength.value = POST_VIGNETTE_BASE_STRENGTH;
  // 静止画のため拍同期の色収差は出さない（強度0）。
  postEffectPass.uniforms.chromaOffset.value = 0;
  postEffectPass.uniforms.resolution.value.set(Math.max(1, width), Math.max(1, height));

  const outputPass = new OutputPass();

  composer.addPass(renderPass);
  composer.addPass(bloomPass);
  composer.addPass(postEffectPass);
  composer.addPass(outputPass);
  // addPass は各パスへ描画バッファ全解像度を設定するため、ブルームの縮小解像度をパス追加の後に再適用する。
  bloomPass.setSize(bloomResolution.x, bloomResolution.y);

  return {
    capturePixels(): Uint8Array {
      // 画面へ出さない設定のため、描画の往復の後に最終結果が読取バッファ（readBuffer）に入る。
      composer.render();
      const buffer = new Uint8Array(width * height * 4);
      renderer.readRenderTargetPixels(composer.readBuffer, 0, 0, width, height, buffer);
      return buffer;
    },
    dispose(): void {
      renderPass.dispose();
      bloomPass.dispose();
      postEffectPass.dispose();
      outputPass.dispose();
      composer.dispose();
      captureTarget.dispose();
    },
  };
}
