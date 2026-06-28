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
  Quaternion,
  Vector3,
  type Object3D,
} from "three";
import type { VRMHumanBoneName } from "@pixiv/three-vrm";
import type { CharacterModelConfig } from "../../types/character";
import type { LoadedVrm } from "../loaders/vrmLoader";
import { createFixedPoseMotion, type VrmMotion, type VrmMotionFactory } from "./vrmMotion";

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
  /** 読み込んだVRMへ差し替える。光柱を取り外して解放し、設定の配置・スケール・向きをVRMへ適用する。
   *  差し替え後の既定のモーション層は固定ポーズ。 */
  swapToVrm(loaded: LoadedVrm, config: CharacterModelConfig): void;
  /** モーション層を差し替える（Issue #93）。生成関数へ現在の読み込み済みVRMを渡してモーションを作り、
   *  直前のモーションを解放して置き換える。生成関数が例外を投げた場合は直前のモーションを保持したまま例外を
   *  呼び出し元へ伝播する。VRM未読み込み時・後始末済み時は何もしない。 */
  setMotion(create: VrmMotionFactory): void;
  /** 読み込み失敗を記録する。光柱の表示は続けつつ、状態を error にする。 */
  markLoadFailed(): void;
  /** 診断専用。読み込み済みVRMがあれば、全ての正規化した人体ボーンの回転の中で最も大きい回転角（度）を返し、
   *  無ければ null を返す。固定ポーズがバインドポーズ（全ボーン無回転で最大角0度）から明確に回転したかを外部の
   *  診断・スモークが直接確かめるために用いる。最大角を採る理由を先に述べる。再生型モーションのクリップは
   *  VRMアニメーションの姿勢を対象モデルの正規化空間へ再ターゲットするため、特定の1ボーン（例: 腰）の回転は小さく
   *  なりうるが、姿勢が適用されていれば必ずいずれかのボーンが大きく回転する。最大角はどのボーンが大きく回るかに
   *  依らず「姿勢が適用された」を頑健に表す。 */
  debugMaxNormalizedBoneAngleDeg(): number | null;
  /** 診断専用。躍動設定があり読み込み済みVRMがあれば、2本のツインテール先端方向と、意図した風方向（ワールド変換後の
   *  基本方向）との内積の平均を返す。無ければ null。ツインテールが垂れず意図した向きへ流れているか（達成基準A2）を
   *  確かめるために用いる。 */
  debugTwinTailFlowAlignment(): number | null;
  /** 後始末。光柱と（あれば）VRMとモーションを解放する。冪等。 */
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
  // 差し替え時のモデル設定。診断（ピン対象ボーン名・ツインテールの基本方向など）が参照する。
  let modelConfig: CharacterModelConfig | null = null;
  // ミクのモーション層（Issue #93）。VRM読み込み後に保持し、毎フレーム vrm.update の前に進める。
  let motion: VrmMotion | null = null;
  let status: CenterFigureStatus = "fallback";
  let pulseElapsedSeconds = 0;
  let disposed = false;

  // 診断の計算で使い回す一時オブジェクト（毎回の生成を避ける）。
  const _tipWorld = new Vector3();
  const _tipParentWorld = new Vector3();
  const _intendedDir = new Vector3();
  const _figureQuat = new Quaternion();

  function disposePillar(): void {
    if (pillar) {
      group.remove(pillar);
      pillarGeometry.dispose();
      pillarMaterial.dispose();
      pillar = null;
    }
  }

  // 読み込み済みVRMとモーション層を解放する。後始末と再差し替えで共用する。
  // 解放の前に内部の参照を局所変数へ退避してから null を代入する理由を先に述べる。解放の途中で例外が生じても、
  // 内部状態が解放済みの古い資源を指したまま残らないようにするためである。
  // 解放の順序（モーション → VRMをシーンから除去 → VRM解放）の理由を先に述べる。後続の再生型モーションは
  // vrm.scene や再生制御を参照するため、VRMのシーンを先に解放するとモーションが解放済みの対象を参照しうるためである。
  function releaseLoaded(): void {
    const oldMotion = motion;
    const oldLoaded = loadedVrm;
    motion = null;
    loadedVrm = null;
    modelConfig = null;
    oldMotion?.dispose();
    if (oldLoaded) {
      group.remove(oldLoaded.object3d);
      oldLoaded.dispose();
    }
  }

  return {
    object3d: group,
    update(deltaSeconds: number): void {
      if (disposed) {
        return;
      }
      if (loadedVrm) {
        // モーション層を vrm.update の前に進める（Issue #93）。順序の理由は vrmMotion.ts の update を参照。
        motion?.update(deltaSeconds);
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
      // 新しいVRMを先に取り込んでから旧資源を解放する理由を先に述べる。差し替えの間に中心表示が一瞬も
      // 空にならないようにするためである。releaseLoaded・disposePillar は例外を投げない契約のため
      // （vrmMotion.ts と本ファイルの dispose 系を参照）、旧資源解放・光柱解放・状態確定は例外なく完走し、
      // 新VRMが取り込まれたのに内部参照が未設定という中間状態は生じない。
      loaded.object3d.position.set(config.position.x, config.position.y, config.position.z);
      loaded.object3d.scale.setScalar(config.scale);
      loaded.object3d.rotation.y = config.rotationY;
      group.add(loaded.object3d);
      // 旧VRM・旧モーションがあれば解放し、光柱も外す。
      releaseLoaded();
      disposePillar();
      // 新しい状態を確定する。差し替え後の既定のモーション層は固定ポーズ（Issue #93）。
      loadedVrm = loaded;
      modelConfig = config;
      status = "loaded";
      motion = createFixedPoseMotion();
    },
    setMotion(create: VrmMotionFactory): void {
      // 後始末済み、またはVRM未読み込みのときは差し替える対象が無いため何もしない。
      if (disposed || !loadedVrm) {
        return;
      }
      // 新しいモーションを先に生成する。生成が例外を投げた場合は、直前のモーションを保持したまま例外を伝える。
      // 生成成功後に直前のモーションを解放して置き換える。motion?.dispose() は例外を投げない契約のため、
      // 生成成功後の置換は確実に完了する。
      const next = create(loadedVrm);
      motion?.dispose();
      motion = next;
    },
    markLoadFailed(): void {
      // 読み込み失敗。光柱の表示は続け、状態だけ error にする。既に loaded のときは上書きしない。
      if (status === "fallback") {
        status = "error";
      }
    },
    debugMaxNormalizedBoneAngleDeg(): number | null {
      // 読み込み済みVRMが無ければ姿勢は無いため null を返す。
      if (!loadedVrm) {
        return null;
      }
      // 全ての人体ボーンについて、正規化した節の回転（四元数）から回転角を求め、その最大値（度）を返す。
      // 四元数の w 成分は回転角の半分の余弦に等しいため、回転角は 2×逆余弦(|w|) で求まる（符号反転は同じ回転）。
      const humanoid = loadedVrm.vrm.humanoid;
      let maxAngleDeg = 0;
      for (const name of Object.keys(humanoid.humanBones) as VRMHumanBoneName[]) {
        const node = humanoid.getNormalizedBoneNode(name);
        if (!node) {
          continue;
        }
        const w = Math.min(1, Math.abs(node.quaternion.w));
        const angleDeg = (2 * Math.acos(w) * 180) / Math.PI;
        if (angleDeg > maxAngleDeg) {
          maxAngleDeg = angleDeg;
        }
      }
      return maxAngleDeg;
    },
    debugTwinTailFlowAlignment(): number | null {
      // 躍動設定が無い、またはVRM未読み込みなら測れないため null を返す。
      if (!loadedVrm || !modelConfig?.dynamics) {
        return null;
      }
      const joints = loadedVrm.vrm.springBoneManager?.joints;
      if (!joints) {
        return null;
      }
      // 意図した風方向（ワールド）= 基本方向（ミク局所）を図形のワールド回転で変換した単位ベクトル。
      const base = modelConfig.dynamics.twinTail.baseDirectionLocal;
      loadedVrm.object3d.updateWorldMatrix(true, false);
      loadedVrm.object3d.getWorldQuaternion(_figureQuat);
      _intendedDir.set(base.x, base.y, base.z).applyQuaternion(_figureQuat).normalize();
      // 各ツインテールの「根→先端」の全体ベクトルの向きと、意図方向との内積を取り平均する。
      // 全体ベクトルで測る理由を先に述べる。最深の _end マーカーは直前の節とほぼ同位置（ほぼゼロ長）で1節分では向きが
      // 定まらないため、根から先端までの長いベクトルで尾の向きを安定に表す。
      // 先端は親子をたどって得る理由を先に述べる。スプリングの管理が持つジョイントは子を持つ節のみで、子を持たない
      // 末端（_end）はジョイントに含まれないため、ジョイント名から先端を探せない。根のボーンからシーンの子を末端まで
      // たどって先端ノードを得る。
      let sum = 0;
      let count = 0;
      for (const chainId of ["10", "11"]) {
        const rootName = "J_Sec_Hair1_" + chainId;
        let root: Object3D | null = null;
        for (const joint of joints) {
          if (joint.bone.name === rootName) {
            root = joint.bone;
            break;
          }
        }
        if (!root) {
          continue;
        }
        // 線形のチェーンの末端まで子をたどる。
        let tip: Object3D = root;
        while (tip.children.length > 0) {
          tip = tip.children[0];
        }
        tip.getWorldPosition(_tipWorld);
        root.getWorldPosition(_tipParentWorld);
        _tipWorld.sub(_tipParentWorld);
        if (_tipWorld.lengthSq() < 1e-12) {
          continue;
        }
        _tipWorld.normalize();
        sum += _tipWorld.dot(_intendedDir);
        count += 1;
      }
      return count > 0 ? sum / count : null;
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      disposePillar();
      // モーション → VRMをシーンから除去 → VRM解放の順で解放する（releaseLoaded に集約）。
      releaseLoaded();
    },
  };
}
