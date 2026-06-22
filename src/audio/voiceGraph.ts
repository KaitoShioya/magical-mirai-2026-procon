// 共有出力グラフと、1音ぶんのノードグラフ（投下中は倍音層付き）を構築する。
// 発音（実機の AudioContext 上）と明るさ測定（オフライン描画）の双方が同一の音声経路を使うため、両者から呼べる形にする。
// Web Audio のノードを生成するためブラウザでのみ動作し、単体テスト（Node 実行）の対象外とする。
// 開始・停止・音量包絡の予約は呼び出し側が行う（発音は自然な音量包絡、測定は一定音量）。

import {
  SYNTH_WAVEFORM,
  SYNTH_HIGHPASS_HZ,
  SYNTH_LOWPASS_HZ,
  SYNTH_MASTER_GAIN,
  SYNTH_COMPRESSOR_THRESHOLD_DB,
  SYNTH_COMPRESSOR_RATIO,
  SYNTH_COMPRESSOR_KNEE_DB,
  SYNTH_COMPRESSOR_ATTACK_SEC,
  SYNTH_COMPRESSOR_RELEASE_SEC,
  SYNTH_OVERTONE_RATIO,
  SYNTH_OVERTONE_GAIN_RATIO,
} from "./synthConstants";

/** 1音ぶんのノードの集合。 */
export interface VoiceNodes {
  /** 発音体。添字0が基本オシレーター（再生終了通知の担当）。投下中は添字1が倍音オシレーター。 */
  oscillators: OscillatorNode[];
  /** 音量包絡を持つ音量節点。基本音と倍音の双方を駆動する（消音・減衰の操作対象）。 */
  gain: GainNode;
  /** 倍音音量節点など、破棄時に切断する補助節点。基本音だけのときは空。 */
  extraNodes: AudioNode[];
}

/**
 * 共有出力グラフを構築する。高域通過 → 低域通過 → 動的圧縮 → マスター音量 → 出力先 をつなぎ、入口の高域通過を返す。
 * 使い捨ての音はこの入口へ接続する。発音と明るさ測定の双方がこれを用いることで、測定経路が実機と一致する。
 */
export function buildOutputGraph(
  ctx: BaseAudioContext,
  destination: AudioNode
): BiquadFilterNode {
  const highpass = ctx.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = SYNTH_HIGHPASS_HZ;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = SYNTH_LOWPASS_HZ;

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = SYNTH_COMPRESSOR_THRESHOLD_DB;
  compressor.ratio.value = SYNTH_COMPRESSOR_RATIO;
  compressor.knee.value = SYNTH_COMPRESSOR_KNEE_DB;
  compressor.attack.value = SYNTH_COMPRESSOR_ATTACK_SEC;
  compressor.release.value = SYNTH_COMPRESSOR_RELEASE_SEC;

  const master = ctx.createGain();
  master.gain.value = SYNTH_MASTER_GAIN;

  highpass.connect(lowpass);
  lowpass.connect(compressor);
  compressor.connect(master);
  master.connect(destination);
  return highpass;
}

/**
 * 1音ぶんのノードグラフを構築する。基本オシレーター（三角波、周波数 f）を音量節点へつなぎ、音量節点を入口へつなぐ。
 * withOvertone が真なら、倍音オシレーター（正弦波、周波数 f × SYNTH_OVERTONE_RATIO）を一定比率の倍音音量節点を介して
 * 同じ音量節点へ合流させる。これにより倍音は基本音と同じ音量包絡で駆動され、別の立ち上がり雑音を出さない。
 * 倍音周波数が基本周波数のちょうど整数倍であることは pitch.ts の overtoneFrequency の単体テストで保証する。
 */
export function buildVoice(
  ctx: BaseAudioContext,
  input: AudioNode,
  frequencyHz: number,
  withOvertone: boolean
): VoiceNodes {
  const fundamental = ctx.createOscillator();
  fundamental.type = SYNTH_WAVEFORM;
  fundamental.frequency.value = frequencyHz;

  const gain = ctx.createGain();
  fundamental.connect(gain);
  gain.connect(input);

  const oscillators: OscillatorNode[] = [fundamental];
  const extraNodes: AudioNode[] = [];

  if (withOvertone) {
    // 倍音は単一成分にするため正弦波にする（三角波だと2倍・6倍・10倍…の複数成分が加わり「倍音1層」から外れる）。
    const overtone = ctx.createOscillator();
    overtone.type = "sine";
    overtone.frequency.value = frequencyHz * SYNTH_OVERTONE_RATIO;

    const overtoneGain = ctx.createGain();
    overtoneGain.gain.value = SYNTH_OVERTONE_GAIN_RATIO;
    overtone.connect(overtoneGain);
    overtoneGain.connect(gain);

    oscillators.push(overtone);
    extraNodes.push(overtoneGain);
  }

  return { oscillators, gain, extraNodes };
}
