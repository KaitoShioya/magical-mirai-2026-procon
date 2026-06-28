// 撮影モード（Issue #68）の指操作の束ね。結果画面でのみ有効にし、画面の指の操作をカメラの姿勢へ変える。
// 判定用の入力（src/input）とは完全に別系統である（受け入れ基準「プレイ中の入力とは別系統」）。
// 得点状態（session）への参照を一切持たないことで、撮影操作がスコア・配置・判定に干渉しないことを型の段階で保証する。
//
// カメラ姿勢の計算は純粋な計算機（src/utils/photoCameraRig）が担い、本モジュールは指の接触の管理と計算結果の反映
// （applyPose）だけを行う。1本指で向き変更、2本指で平行移動する（concept-final.md §13）。

import { createPhotoCameraRig, type PhotoCameraRig } from "../utils/photoCameraRig";
import type { CameraPose } from "../utils/cameraTrajectory";

/** 撮影モードの外部契約。結果画面の進入・退出で有効・無効を切り替える。 */
export interface PhotoCamera {
  /** 撮影モードを始める。初期姿勢で計算機を初期化し、指の操作の待ち受けを登録する。 */
  activate(initial: CameraPose): void;
  /** 撮影モードを終える。待ち受けを解除し、画面の操作の設定を元へ戻す。 */
  deactivate(): void;
  /** 後始末。待ち受けを解除する。冪等。 */
  dispose(): void;
}

/**
 * 撮影モードの指操作の束ねを作る。target は操作面（画面ルート）、applyPose は計算結果のカメラ姿勢を描画へ反映する関数
 * （renderRoot.setCameraPose を包む）。applyPose 以外に外部へ触れないため、得点・判定への非干渉が構造的に保たれる。
 */
export function createPhotoCamera(opts: {
  target: HTMLElement;
  applyPose: (pose: CameraPose) => void;
}): PhotoCamera {
  const { target, applyPose } = opts;

  let rig: PhotoCameraRig | null = null;
  let active = false;
  // 接触中の指の最新位置（指のIDごと）。1本なら向き変更、2本なら平行移動とピンチ（前後移動）に使う。
  const pointers = new Map<number, { x: number; y: number }>();
  // 2本指の直近の重心と指間隔。重心の移動量で平行移動、指間隔の変化量でピンチ（前後移動）を作る。
  let lastCentroidX = 0;
  let lastCentroidY = 0;
  let lastPinchDistance = 0;
  // 操作面のスクロール・拡大を抑える設定を一時的に当て、退出時に元へ戻すために元の値を保持する。
  let savedTouchAction = "";

  // 接触中の最初の2本の指から、重心と指間隔を求める。2本に満たないときは null。
  function twoFingerMetrics(): { centroidX: number; centroidY: number; distance: number } | null {
    if (pointers.size < 2) {
      return null;
    }
    const iterator = pointers.values();
    const a = iterator.next().value as { x: number; y: number };
    const b = iterator.next().value as { x: number; y: number };
    return {
      centroidX: (a.x + b.x) / 2,
      centroidY: (a.y + b.y) / 2,
      distance: Math.hypot(a.x - b.x, a.y - b.y),
    };
  }

  // 2本指の基準（重心・指間隔）を現在の接触から取り直す。指の本数が2本になった瞬間に呼び、次の移動の差分の起点にする。
  function resetTwoFingerBaseline(): void {
    const metrics = twoFingerMetrics();
    if (metrics !== null) {
      lastCentroidX = metrics.centroidX;
      lastCentroidY = metrics.centroidY;
      lastPinchDistance = metrics.distance;
    }
  }

  // ボタンなど、撮影の操作対象から除く要素の上での操作か。理由を先に述べる。保存・共有や戻るのボタン押下を
  // カメラ操作と誤認しないよう、ボタンと data-no-camera の目印を持つ要素の上では撮影の操作を始めない。
  function isExcludedTarget(event: PointerEvent): boolean {
    const node = event.target as HTMLElement | null;
    return node !== null && node.closest("button,[data-no-camera]") !== null;
  }

  function onPointerDown(event: PointerEvent): void {
    if (!active || isExcludedTarget(event)) {
      return;
    }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    // 2本指になった瞬間に重心・指間隔の基準を取り直す（次の移動の差分の起点にする）。
    if (pointers.size >= 2) {
      resetTwoFingerBaseline();
    }
    // 指が操作面の外へ出ても移動を受け取り続けるため、この指の事象を操作面へ捕捉する。
    if (typeof target.setPointerCapture === "function") {
      try {
        target.setPointerCapture(event.pointerId);
      } catch {
        // 捕捉に失敗しても操作自体は成立する（在域中の移動は受け取れる）。
      }
    }
  }

  function onPointerMove(event: PointerEvent): void {
    if (!active || rig === null) {
      return;
    }
    const tracked = pointers.get(event.pointerId);
    if (tracked === undefined) {
      return;
    }
    if (pointers.size >= 2) {
      // 2本指の操作。まずこの指の位置を更新し、2本の重心の移動で平行移動、指間隔の変化で前後移動（ピンチ）を作る。
      tracked.x = event.clientX;
      tracked.y = event.clientY;
      const metrics = twoFingerMetrics();
      if (metrics !== null) {
        rig.pan(metrics.centroidX - lastCentroidX, metrics.centroidY - lastCentroidY);
        rig.dolly(metrics.distance - lastPinchDistance);
        lastCentroidX = metrics.centroidX;
        lastCentroidY = metrics.centroidY;
        lastPinchDistance = metrics.distance;
        applyPose(rig.pose());
      }
    } else {
      // 1本指の操作（向き変更）。前回位置との差分で視線方向を回す。
      const deltaX = event.clientX - tracked.x;
      const deltaY = event.clientY - tracked.y;
      tracked.x = event.clientX;
      tracked.y = event.clientY;
      rig.look(deltaX, deltaY);
      applyPose(rig.pose());
    }
  }

  function onPointerUp(event: PointerEvent): void {
    pointers.delete(event.pointerId);
    // まだ2本以上残っているなら基準を取り直す（3本目を離した等）。2本→1本へ減ったときは、残る指の位置は最新のため
    // 1本指の向き変更が飛ばずに続く。
    if (pointers.size >= 2) {
      resetTwoFingerBaseline();
    }
    if (typeof target.releasePointerCapture === "function" && target.hasPointerCapture?.(event.pointerId)) {
      try {
        target.releasePointerCapture(event.pointerId);
      } catch {
        // 解放に失敗しても害はない。
      }
    }
  }

  function addListeners(): void {
    target.addEventListener("pointerdown", onPointerDown);
    target.addEventListener("pointermove", onPointerMove);
    target.addEventListener("pointerup", onPointerUp);
    target.addEventListener("pointercancel", onPointerUp);
  }

  function removeListeners(): void {
    target.removeEventListener("pointerdown", onPointerDown);
    target.removeEventListener("pointermove", onPointerMove);
    target.removeEventListener("pointerup", onPointerUp);
    target.removeEventListener("pointercancel", onPointerUp);
  }

  return {
    activate(initial: CameraPose): void {
      if (active) {
        return;
      }
      rig = createPhotoCameraRig(initial);
      active = true;
      pointers.clear();
      // 操作面のスクロール・拡大を抑える（指の動きを撮影操作に使うため）。
      savedTouchAction = target.style.touchAction;
      target.style.touchAction = "none";
      addListeners();
      // 初期姿勢を一度反映する（結果画面に入った時点の構図を軌跡の終端姿勢にする）。
      applyPose(rig.pose());
    },
    deactivate(): void {
      if (!active) {
        return;
      }
      active = false;
      pointers.clear();
      removeListeners();
      target.style.touchAction = savedTouchAction;
      rig = null;
    },
    dispose(): void {
      if (active) {
        this.deactivate();
      }
    },
  };
}
