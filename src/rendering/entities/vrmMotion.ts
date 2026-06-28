// ミクのボーンを操作するモーション層の抽象（Issue #93）。状態を読んで骨を動かすビューであり、判定・得点・
// 時刻の論理を持たない（依存規則 docs/decisions/architecture.md §5）。profiles・tools は import しない。
//
// 抽象を設ける理由を先に述べる。後からミクへ動きを付加できるよう、ボーンを操作する層を1つの形に揃える。
// 最小実用版は固定ポーズ（毎フレーム骨を変えない無動作）とし、抽象の差し替えで後続の2方式を扱えるようにする。
// 出典は docs/research/06-tech-stack-and-architecture.md の7節。
//   第1の方式（手続き的モーション）: @pixiv/three-vrm の VRMHumanoid の正規化したボーンへコードで回転を与える。
//   第2の方式（再生型モーション）: @pixiv/three-vrm-animation で VRM Animation を読み込み、createVRMAnimationClip で
//     動作の区切りを作り、THREE.AnimationMixer を vrm.scene に対して進めて再生する。
// いずれの方式でも、毎フレーム vrm.update を呼んでばねの揺れと表情の更新を進める（その呼び出しは vrmLoader が担う）。

import { AnimationMixer, Quaternion, Vector3 } from "three";
import { createVRMAnimationClip, type VRMAnimation } from "@pixiv/three-vrm-animation";
import type { VRMSpringBoneJoint } from "@pixiv/three-vrm";
import type { LoadedVrm } from "../loaders/vrmLoader";
import type { CharacterDynamicsConfig } from "../../types/character";
import { twinTailWind, type TwinTailWindParams } from "../../utils/twinTailWind";

/** モーション層の取っ手。毎フレーム更新と後始末の2操作だけを持つ。 */
export interface VrmMotion {
  // 毎フレーム呼ぶ。引数 deltaSeconds は前フレームからの経過秒（差分。絶対時刻ではない）。
  // 呼ぶ順番の前提を先に述べる。本メソッドは vrm.update の前に呼ぶ。理由は、姿勢入力（手続き的なボーン回転、
  // または再生制御による姿勢入力）を先に適用し、その後の vrm.update がVRM内部の更新（姿勢の反映・ばねの揺れ・
  // 表情）を進める順にすると、当フレームの姿勢入力が同じフレームのVRM内部更新へ正しく取り込まれるためである。
  // 固定ポーズは何もしない。
  update(deltaSeconds: number): void;
  // 後始末。冪等とし、外へ例外を出さない契約とする。外へ例外を出さない理由を先に述べる。差し替えと後始末で
  // 例外を投げうる箇所を生成関数の1か所へ集約し、rendering 層の後始末経路を例外なく完走させるためである。
  // 外部資源（AnimationMixer 等）を持つ後続の実装は、その後始末の中で生じた例外を捕捉し、呼び出し側へ伝播させない。
  dispose(): void;
}

/** 読み込み済みVRMからモーション層を作る同期の生成関数。差し替え口へ渡す。 */
export type VrmMotionFactory = (loaded: LoadedVrm) => VrmMotion;

/**
 * 最小実用版の固定ポーズのモーション層を作る。
 * update は何もしない（読み込んだ既定姿勢を毎フレーム変えない＝ポーズ固定）。dispose は何もしない（保持資源が無い）。
 * いずれも冪等であり、外へ例外を出さない。
 */
export function createFixedPoseMotion(): VrmMotion {
  return {
    update(): void {
      // 固定ポーズは骨を動かさない。
    },
    dispose(): void {
      // 保持資源が無いため何もしない。
    },
  };
}

/**
 * VRMアニメーションの特定時刻の姿勢を固定する再生型モーション層を作る（第2の方式）。
 * 生成時に createVRMAnimationClip でクリップを作り、AnimationMixer を vrm.scene に対して固定時刻へ据えて
 * 姿勢を適用する。この一連は本関数の中で同期的に完了し、本関数が返る時点で人体ボーンへ姿勢が反映済みである。
 * これにより、差し替えと姿勢適用の間に非同期待ちを入れない結線と併せて、最初の描画の前に姿勢が確定する。
 * @param loaded 読み込み済みVRMの取っ手。
 * @param vrmAnimation 固定ポーズを与えるVRMアニメーション。
 * @param options.freezeTimeSec 固定する時刻（秒）。
 */
export function createPosedMotion(
  loaded: LoadedVrm,
  vrmAnimation: VRMAnimation,
  options: { freezeTimeSec: number }
): VrmMotion {
  const clip = createVRMAnimationClip(vrmAnimation, loaded.vrm);
  const mixer = new AnimationMixer(loaded.vrm.scene);
  const action = mixer.clipAction(clip);
  action.play();
  // 固定時刻の姿勢を同期的に適用する。setTime は内部で時刻を進め評価し、人体ボーンへ書き込む。
  mixer.setTime(options.freezeTimeSec);

  return {
    update(): void {
      // 差分を0にして呼ぶ理由を先に述べる。固定時刻のまま姿勢を再評価して書き直し、時間に依らず一定の姿勢を
      // 保つためである。本メソッドは vrm.update の前に呼ばれる（VrmMotion の契約）。先に固定姿勢の人体ボーンを
      // 確定し、その後の vrm.update が確定した姿勢からばねの揺れを進める順になるため、髪・スカートのばね物理は
      // 姿勢を起点に自然に揺れる。
      mixer.update(0);
    },
    dispose(): void {
      // 契約どおり、後始末の中で生じた例外を捕捉し、呼び出し側へ伝播させない。
      try {
        mixer.stopAllAction();
        mixer.uncacheClip(clip);
        mixer.uncacheRoot(loaded.vrm.scene);
      } catch {
        // 後始末中の例外は伝播させない。
      }
    },
  };
}

/** 風で操作するスプリングジョイントと、復元のために退避した元設定。 */
interface SavedSpringJoint {
  readonly joint: VRMSpringBoneJoint;
  /** 揺らぎの位相差（左右で異なる）。 */
  readonly phase: number;
  /** 元の重力方向（Vector3 のため参照共有を避けて複製で保存）。 */
  readonly gravityDir: Vector3;
  readonly gravityPower: number;
  readonly stiffness: number;
  readonly dragForce: number;
}

/**
 * 固定ポーズに加えて、ツインテールの常時の風なびきを実行時に与える躍動付きのモーション層を作る。
 *
 * 固定ポーズは createPosedMotion を内部で用いて再利用し、これに風を足す。
 *   風（update、物理の前）: 対象ツインテールのスプリングジョイントの重力方向と強さを毎フレーム書き換える。重力方向は
 *     ミク局所の基本方向を中心表示オブジェクトのワールド回転で変換して与える（スプリングの重力方向はワールド空間のため）。
 * 後始末では、風で書き換えた設定（重力方向・強さ・戻し力・抵抗）を元へ戻してから固定ポーズの後始末を行う。元へ戻す理由を
 * 先に述べる。モーション層を差し替えた際に、書き換えた風設定が次のモーションへ残らないようにするためである。
 *
 * @param loaded 読み込み済みVRMの取っ手。
 * @param vrmAnimation 固定ポーズを与えるVRMアニメーション。
 * @param options.freezeTimeSec 固定する時刻（秒）。
 * @param options.dynamics 風の設定。
 */
export function createDynamicPosedMotion(
  loaded: LoadedVrm,
  vrmAnimation: VRMAnimation,
  options: { freezeTimeSec: number; dynamics: CharacterDynamicsConfig }
): VrmMotion {
  const { dynamics } = options;
  // 固定ポーズは既存の再生型モーションをそのまま使う（人体姿勢の毎フレーム再確定）。
  const posed = createPosedMotion(loaded, vrmAnimation, { freezeTimeSec: options.freezeTimeSec });

  // 風で操作するツインテールのジョイントを名前で選び、元設定を退避する。
  const windPattern = new RegExp(dynamics.twinTail.boneNamePattern);
  const savedJoints: SavedSpringJoint[] = [];
  const joints = loaded.vrm.springBoneManager?.joints;
  if (joints) {
    for (const joint of joints) {
      if (!windPattern.test(joint.bone.name)) {
        continue;
      }
      savedJoints.push({
        joint,
        // 2本目（名前に _11 を含む）へ位相差を与え、左右が同じ動きで固まらないようにする。
        phase: joint.bone.name.includes("_11") ? dynamics.twinTail.chainPhaseOffset : 0,
        gravityDir: joint.settings.gravityDir.clone(),
        gravityPower: joint.settings.gravityPower,
        stiffness: joint.settings.stiffness,
        dragForce: joint.settings.dragForce,
      });
    }
  }
  // 任意の補助調整（戻し力・抵抗）は一定値のため生成時に一度だけ適用する。
  for (const saved of savedJoints) {
    if (dynamics.twinTail.stiffness !== undefined) {
      saved.joint.settings.stiffness = dynamics.twinTail.stiffness;
    }
    if (dynamics.twinTail.dragForce !== undefined) {
      saved.joint.settings.dragForce = dynamics.twinTail.dragForce;
    }
  }

  const windParams: TwinTailWindParams = {
    baseDirectionLocal: dynamics.twinTail.baseDirectionLocal,
    power: dynamics.twinTail.power,
    oscillationAmplitude: dynamics.twinTail.oscillationAmplitude,
    oscillationFrequencyHz: dynamics.twinTail.oscillationFrequencyHz,
  };

  const figureQuat = new Quaternion();
  let elapsedSeconds = 0;

  return {
    update(deltaSeconds: number): void {
      // 固定ポーズを再評価して人体姿勢を確定する（物理の前）。
      posed.update(deltaSeconds);
      elapsedSeconds += deltaSeconds;
      if (savedJoints.length === 0) {
        return;
      }
      // ミクのワールド向きを最新化し、局所の風方向をワールドへ変換するための四元数を得る。
      loaded.object3d.updateWorldMatrix(true, false);
      loaded.object3d.getWorldQuaternion(figureQuat);
      for (const saved of savedJoints) {
        const wind = twinTailWind(elapsedSeconds, windParams, saved.phase);
        // 局所方向をワールドへ変換して重力方向に設定する（重力方向はワールド空間で解釈される）。
        wind.directionLocal.applyQuaternion(figureQuat);
        saved.joint.settings.gravityDir.copy(wind.directionLocal);
        saved.joint.settings.gravityPower = wind.power;
      }
    },
    dispose(): void {
      // 契約どおり、後始末の中で生じた例外を捕捉し、呼び出し側へ伝播させない。
      try {
        // 風で書き換えた設定を元へ戻す（差し替え時に次のモーションへ残らないようにする）。
        for (const saved of savedJoints) {
          saved.joint.settings.gravityDir.copy(saved.gravityDir);
          saved.joint.settings.gravityPower = saved.gravityPower;
          saved.joint.settings.stiffness = saved.stiffness;
          saved.joint.settings.dragForce = saved.dragForce;
        }
      } catch {
        // 後始末中の例外は伝播させない。
      }
      posed.dispose();
    },
  };
}
