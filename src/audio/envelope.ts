// 自然な音量包絡の時刻点を、開始時刻と定数から計算する純粋ロジック。
// AudioContext には依存しない。最古音消音の現在音量の固定は実行時にしか定まらないためここには持たない。
// すべての時刻は秒で扱う（Web Audio の AudioContext.currentTime と同じ単位）。

import {
  SYNTH_ATTACK_MS,
  SYNTH_DECAY_MS,
  SYNTH_RELEASE_TAIL_MS,
  SYNTH_STEAL_FADE_MS,
  SYNTH_STEAL_STOP_MARGIN_MS,
  SYNTH_ENVELOPE_EPSILON,
  SYNTH_VOICE_PEAK,
} from "./synthConstants";

/** 自然な発音の音量包絡の時刻点（秒）と目標値。 */
export interface NaturalEnvelope {
  /** 立ち上がりの開始時刻（音量0を置く時刻）。 */
  startTime: number;
  /** 立ち上がりの頂点へ達する時刻。 */
  attackEndTime: number;
  /** 立ち上がりの頂点音量（正の値。指数減衰はここから始める）。 */
  peakGain: number;
  /** 指数減衰が微小値へ達する時刻。 */
  decayEndTime: number;
  /** 指数減衰の終点音量（微小値。0にはできない）。 */
  endGain: number;
  /** オシレーターを停止する時刻（減衰の末尾に余裕を足した時刻）。 */
  stopTime: number;
}

/** 最古音消音（上限到達時の素早い消し止め）の時刻点（秒）。 */
export interface StealEnvelope {
  /** 線形フェードが音量0へ達する時刻。 */
  fadeEndTime: number;
  /** オシレーターを停止する時刻（消音終了に余裕を足した時刻）。 */
  stopTime: number;
}

/**
 * 自然な発音の音量包絡を計算する。
 * 立ち上がりは0から頂点へ、減衰は頂点から微小値へ、停止は減衰終了の少し後に置く。
 * 頂点は正の値であり、指数減衰の始点を0にしない（指数減衰は正の値からでないと無音または例外になる）。
 */
export function computeNaturalEnvelope(startTime: number): NaturalEnvelope {
  const attackEndTime = startTime + SYNTH_ATTACK_MS / 1000;
  const decayEndTime = attackEndTime + SYNTH_DECAY_MS / 1000;
  const stopTime = decayEndTime + SYNTH_RELEASE_TAIL_MS / 1000;
  return {
    startTime,
    attackEndTime,
    peakGain: SYNTH_VOICE_PEAK,
    decayEndTime,
    endGain: SYNTH_ENVELOPE_EPSILON,
    stopTime,
  };
}

/**
 * 最古音消音の時刻点を計算する。
 * 現在時刻から消音時間かけて0へ線形に下げ、その少し後に停止する。
 * 現在の音量（線形フェードの始点）は実行時に音量調整の節点から読むため、ここでは扱わない。
 */
export function computeStealEnvelope(now: number): StealEnvelope {
  const fadeEndTime = now + SYNTH_STEAL_FADE_MS / 1000;
  const stopTime = fadeEndTime + SYNTH_STEAL_STOP_MARGIN_MS / 1000;
  return { fadeEndTime, stopTime };
}
