// 共有出力グラフと、1音ぶんのノードグラフを構築する。
// 発音（実機の AudioContext 上）と、明るさ・クリップ・余韻の測定（オフライン描画）の双方が同一の音声経路を使うため、
// 両者から呼べる形にする。Web Audio のノードを生成するためブラウザでのみ動作し、単体テスト（Node 実行）の対象外とする。
// 開始・停止・音量包絡の予約は呼び出し側が行う（発音は自然な音量包絡、測定は一定音量）。
//
// 音色は、サインの基本音に常設の第2倍音を加えた柔らかい音にする（高域の鋭い過渡を避けて遅延に頑健にするため）。
// 投下中は第2倍音をさらに厚くして明るく聞こえさせる。余韻は出力グラフの並列の残響経路で与える（直接音には遅延を足さない）。

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
  SYNTH_BODY_OVERTONE2_GAIN,
  SYNTH_REVERB_SECONDS,
  SYNTH_REVERB_SEED,
  SYNTH_REVERB_TARGET_RMS,
  SYNTH_REVERB_WET_GAIN,
  SYNTH_SOFTCLIP_KNEE,
  SYNTH_SOFTCLIP_CEILING,
  SYNTH_SOFTCLIP_CURVE_SAMPLES,
} from "./synthConstants";
import { generateReverbImpulse } from "./reverbImpulse";
import { generateSoftClipCurve } from "./softClip";

/** 1音ぶんのノードの集合。 */
export interface VoiceNodes {
  /** 発音体。添字0が基本オシレーター（再生終了通知の担当）、添字1が常設の第2倍音オシレーター。 */
  oscillators: OscillatorNode[];
  /** 音量包絡を持つ音量節点。基本音と倍音の双方を駆動する（消音・減衰の操作対象）。 */
  gain: GainNode;
  /** 倍音音量節点など、破棄時に切断する補助節点。 */
  extraNodes: AudioNode[];
}

/**
 * 共有出力グラフを構築する。
 * 高域通過 → 低域通過 → 分岐点 とつなぎ、分岐点から直接経路（乾いた音）と残響経路（湿った音）を合流点へ並列に流し、
 * 合流点 → 動的圧縮 → マスター音量 → 柔らかい飽和制限 → 出力先 とつなぐ。入口の高域通過を返す（使い捨ての音はこの入口へ接続する）。
 * 最終段の柔らかい飽和制限は、膝より大きい多数同時の頂点だけを天井（1.0未満）へ抑え、どの端末でもクリップを防ぐ。
 * 通常のタップ1回など膝より小さい音はそのまま通すため音量・音色を変えない。過剰標本化は遅延を生むため行わない。
 * 残響経路を直接経路と並列にする理由を先に述べる。直接音の立ち上がりに直列の遅延を足さず、余韻だけを後ろへ伸ばすため。
 * 残響を高域通過・低域通過の後段に置く理由を先に述べる。楽曲低音に被らせず、高域の鋭さを残響に持ち込まないため。
 * includeReverb を偽にすると残響経路を組まない（明るさ測定など、余韻を含めずに音色だけを測りたいときに使う）。
 * 返り値は従来どおり入口の音声ノード（高域通過）であり、残響の有無で返り値の契約は変えない。
 */
export function buildOutputGraph(
  ctx: BaseAudioContext,
  destination: AudioNode,
  includeReverb = true
): BiquadFilterNode {
  const highpass = ctx.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = SYNTH_HIGHPASS_HZ;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = SYNTH_LOWPASS_HZ;

  // 直接経路と残響経路を合流する点。利得は1（合算のみ）。
  const mixSum = ctx.createGain();
  mixSum.gain.value = 1;

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = SYNTH_COMPRESSOR_THRESHOLD_DB;
  compressor.ratio.value = SYNTH_COMPRESSOR_RATIO;
  compressor.knee.value = SYNTH_COMPRESSOR_KNEE_DB;
  compressor.attack.value = SYNTH_COMPRESSOR_ATTACK_SEC;
  compressor.release.value = SYNTH_COMPRESSOR_RELEASE_SEC;

  const master = ctx.createGain();
  master.gain.value = SYNTH_MASTER_GAIN;

  // 最終段の柔らかい飽和制限。膝より大きい多数同時の頂点だけを天井（1.0未満）へ抑え、どの端末でもクリップを防ぐ。
  // 過剰標本化は内部の補間で遅延を生むため行わない（遅延に頑健な音作りのため遅延を足さない）。
  const softClip = ctx.createWaveShaper();
  softClip.curve = generateSoftClipCurve(
    SYNTH_SOFTCLIP_CURVE_SAMPLES,
    SYNTH_SOFTCLIP_KNEE,
    SYNTH_SOFTCLIP_CEILING
  );
  softClip.oversample = "none";

  highpass.connect(lowpass);
  // 直接経路。
  lowpass.connect(mixSum);

  // 残響経路（任意）。
  if (includeReverb) {
    const convolver = ctx.createConvolver();
    // 既定の正規化を切る。応答特性（buffer）を代入する前に設定する（正規化は代入時の設定で適用されるため）。
    convolver.normalize = false;
    const impulse = generateReverbImpulse(
      ctx.sampleRate,
      SYNTH_REVERB_SECONDS,
      SYNTH_REVERB_SEED,
      SYNTH_REVERB_TARGET_RMS
    );
    const buffer = ctx.createBuffer(1, impulse.length, ctx.sampleRate);
    buffer.getChannelData(0).set(impulse);
    convolver.buffer = buffer;

    const wetGain = ctx.createGain();
    wetGain.gain.value = SYNTH_REVERB_WET_GAIN;

    lowpass.connect(convolver);
    convolver.connect(wetGain);
    wetGain.connect(mixSum);
  }

  mixSum.connect(compressor);
  compressor.connect(master);
  master.connect(softClip);
  softClip.connect(destination);
  return highpass;
}

/**
 * 1音ぶんのノードグラフを構築する。
 * 基本オシレーター（サイン波、周波数 f）を音量節点へつなぎ、音量節点を入口へつなぐ。さらに常設の第2倍音オシレーター
 *（サイン波、周波数 f × SYNTH_OVERTONE_RATIO）を、常設の倍音音量節点を介して同じ音量節点へ合流させる。これにより
 * 倍音は基本音と同じ音量包絡で駆動され、別の立ち上がり雑音を出さない。
 * deployBright が真なら、第2倍音の音量に投下時ぶん（SYNTH_OVERTONE_GAIN_RATIO）を足して厚くし、明るく聞こえさせる。
 * 倍音周波数が基本周波数のちょうど整数倍であることは pitch.ts の overtoneFrequency の単体テストで保証する。
 */
export function buildVoice(
  ctx: BaseAudioContext,
  input: AudioNode,
  frequencyHz: number,
  deployBright: boolean
): VoiceNodes {
  const fundamental = ctx.createOscillator();
  fundamental.type = SYNTH_WAVEFORM;
  fundamental.frequency.value = frequencyHz;

  const gain = ctx.createGain();
  fundamental.connect(gain);
  gain.connect(input);

  // 常設の第2倍音。投下中はこの音量に投下時ぶんを足して厚くする（同じ周波数の成分を強める）。
  const overtone = ctx.createOscillator();
  overtone.type = "sine";
  overtone.frequency.value = frequencyHz * SYNTH_OVERTONE_RATIO;

  const overtoneGain = ctx.createGain();
  overtoneGain.gain.value = deployBright
    ? SYNTH_BODY_OVERTONE2_GAIN + SYNTH_OVERTONE_GAIN_RATIO
    : SYNTH_BODY_OVERTONE2_GAIN;
  overtone.connect(overtoneGain);
  overtoneGain.connect(gain);

  // 添字0が基本オシレーター（再生終了通知の担当）、添字1が第2倍音。両者は同一時刻で開始・停止する。
  const oscillators: OscillatorNode[] = [fundamental, overtone];
  const extraNodes: AudioNode[] = [overtoneGain];

  return { oscillators, gain, extraNodes };
}
