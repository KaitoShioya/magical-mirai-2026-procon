// 湖の中心に常在する中心オブジェクト（Issue #64）。読み込み完了前・読み込み失敗時はコード描画の光柱を表示し、
// VRMの読み込みに成功したら光柱をVRMへ差し替える。状態を読むだけのビューであり、判定・得点・時刻の論理を
// 持たない（依存規則 docs/decisions/architecture.md §5）。profiles・tools は import しない。
//
// 段階的に表示する理由を先に述べる。VRMは容量が大きく読み込みに時間がかかり、端末によっては読み込めない。
// 先に軽い光柱を中心へ立て、読み込めたらVRMへ差し替えることで、待ち時間中も読み込み失敗時も中心が空にならない。

import {
  AdditiveBlending,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
} from "three";
import type { CharacterModelConfig } from "../../types/character";
import type { LoadedVrm } from "../loaders/vrmLoader";

/** 中心オブジェクトの表示状態。fallback=光柱、loaded=VRM、error=読み込み失敗で光柱を継続。 */
export type CenterFigureStatus = "fallback" | "loaded" | "error";

/** 光柱の寸法。採用理由を先に述べる。原点（水面 高さ0）に立つ人の背丈に近い高さの細い柱とし、底を太く上を細く
 *  すぼめて光の柱に見せる。底面を水面に合わせるため、生成後に高さの半分だけ上へ移す。 */
const PILLAR_HEIGHT = 2.6;
const PILLAR_RADIUS_BOTTOM = 0.38;
const PILLAR_RADIUS_TOP = 0.12;
const PILLAR_RADIAL_SEGMENTS = 24;

/** 光柱の色と不透明度。採用理由を先に述べる。作品の差し色であるネオンブルー寄りの色を、加算合成で暗い背景へ
 *  足して光らせる。深夜の暗さを壊さないよう基準の不透明度は低めにし、明滅で存在感を与える。 */
const PILLAR_COLOR = 0x4fb4ff;
const PILLAR_OPACITY_BASE = 0.34;
const PILLAR_OPACITY_PULSE_AMPLITUDE = 0.12;
// 明滅の角速度（ラジアン毎秒）。採用理由を先に述べる。1周およそ3秒（2×円周率÷3）でゆっくり脈打たせ、
// 慌ただしくない深夜の気配を出す。
const PILLAR_PULSE_ANGULAR_SPEED = (2 * Math.PI) / 3;

/** 中心オブジェクトの取っ手。 */
export interface CenterFigure {
  /** シーンへ追加する本体。 */
  readonly object3d: Object3D;
  /** 毎フレーム呼ぶ（引数は秒）。光柱は明滅を進め、VRMは内部更新を進める。 */
  update(deltaSeconds: number): void;
  /** 現在の表示状態。 */
  status(): CenterFigureStatus;
  /** 読み込んだVRMへ差し替える。光柱を取り外して解放し、設定の配置・スケール・向きをVRMへ適用する。 */
  swapToVrm(loaded: LoadedVrm, config: CharacterModelConfig): void;
  /** 読み込み失敗を記録する。光柱の表示は続けつつ、状態を error にする。 */
  markLoadFailed(): void;
  /** 後始末。光柱と（あれば）VRMを解放する。冪等。 */
  dispose(): void;
}

/**
 * 中心オブジェクトを生成する。初期状態は光柱（fallback）で、中心（原点）に立つ。
 * 光柱は加算合成・深度書き込みなし・トーンマップ無効とする。トーンマップを無効にする理由を先に述べる。
 * 減光させずに後続のブルーム（#11）のしきい値判定を素直にし、光柱を確実に光らせるため。
 */
export function createCenterFigure(): CenterFigure {
  const group = new Group();

  const pillarGeometry = new CylinderGeometry(
    PILLAR_RADIUS_TOP,
    PILLAR_RADIUS_BOTTOM,
    PILLAR_HEIGHT,
    PILLAR_RADIAL_SEGMENTS,
    1,
    true
  );
  const pillarMaterial = new MeshBasicMaterial({
    color: PILLAR_COLOR,
    transparent: true,
    opacity: PILLAR_OPACITY_BASE,
    blending: AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: DoubleSide,
  });
  let pillar: Mesh | null = new Mesh(pillarGeometry, pillarMaterial);
  // 円柱は原点を中心に上下へ伸びるため、底面を水面（高さ0）へ合わせるよう高さの半分だけ上へ移す。
  pillar.position.y = PILLAR_HEIGHT / 2;
  group.add(pillar);

  let loadedVrm: LoadedVrm | null = null;
  let status: CenterFigureStatus = "fallback";
  let pulseElapsedSeconds = 0;
  let disposed = false;

  function disposePillar(): void {
    if (pillar) {
      group.remove(pillar);
      pillarGeometry.dispose();
      pillarMaterial.dispose();
      pillar = null;
    }
  }

  return {
    object3d: group,
    update(deltaSeconds: number): void {
      if (disposed) {
        return;
      }
      if (loadedVrm) {
        loadedVrm.update(deltaSeconds);
        return;
      }
      if (pillar) {
        pulseElapsedSeconds += deltaSeconds;
        pillarMaterial.opacity =
          PILLAR_OPACITY_BASE +
          PILLAR_OPACITY_PULSE_AMPLITUDE * Math.sin(pulseElapsedSeconds * PILLAR_PULSE_ANGULAR_SPEED);
      }
    },
    status(): CenterFigureStatus {
      return status;
    },
    swapToVrm(loaded: LoadedVrm, config: CharacterModelConfig): void {
      if (disposed) {
        // 既に後始末済みなら取り込まず、渡されたVRMを解放する（競合ガードの最終防壁）。
        loaded.dispose();
        return;
      }
      disposePillar();
      loaded.object3d.position.set(config.position.x, config.position.y, config.position.z);
      loaded.object3d.scale.setScalar(config.scale);
      loaded.object3d.rotation.y = config.rotationY;
      group.add(loaded.object3d);
      loadedVrm = loaded;
      status = "loaded";
    },
    markLoadFailed(): void {
      // 読み込み失敗。光柱の表示は続け、状態だけ error にする。既に loaded のときは上書きしない。
      if (status === "fallback") {
        status = "error";
      }
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      disposePillar();
      if (loadedVrm) {
        group.remove(loadedVrm.object3d);
        loadedVrm.dispose();
        loadedVrm = null;
      }
    },
  };
}
