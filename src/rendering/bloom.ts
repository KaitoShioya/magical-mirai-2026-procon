// ブルーム後処理（Issue #11）。発光点をにじませる。合成器（EffectComposer）に「シーン描画→ブルーム→最終
// 出力」の順でパスを積み、ブルームのぼかしだけを表示寸法の半分の解像度で行う。renderRoot.ts から生成して
// 使う。判定・得点・時刻の論理は持たず、profiles・tools は import しない（依存規則 docs/decisions/architecture.md §5）。

import type { Camera, Scene, WebGLRenderer } from "three";
import { Vector2 } from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import {
  BLOOM_RADIUS,
  BLOOM_RESOLUTION_SCALE,
  BLOOM_STRENGTH,
  BLOOM_THRESHOLD,
} from "./constants";
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
 */
export function createBloomComposer(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: Camera,
  options: { enabled: boolean; displayWidth: number; displayHeight: number }
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
  const outputPass = new OutputPass();

  composer.addPass(renderPass);
  composer.addPass(bloomPass);
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
      outputPass.dispose();
      composer.dispose();
    },
  };
}
