// 共有出力グラフを構築する。
// 発音（実機の AudioContext 上）と、各種の測定（オフライン描画）の双方が同一の音声経路を使うため、両者から呼べる形にする。
// Web Audio のノードを生成するためブラウザでのみ動作し、単体テスト（Node 実行）の対象外とする。
// 開始・停止・音量包絡の予約は呼び出し側（操作音エンジン・打楽器合成）が行う。
//
// 出力グラフは、直接音入口と残響音入口の2つの入口を持つ。各音は直接音入口へ常時つなぎ、レーンごとの残響送り量で
// 残響音入口へつなぐ。低いレーン（キック・ベース）は残響送りを0にして低域を余韻に乗せない。

import {
  SYNTH_HIGHPASS_HZ,
  SYNTH_REVERB_HIGHPASS_HZ,
  SYNTH_LOWPASS_HZ,
  SYNTH_MASTER_GAIN,
  SYNTH_COMPRESSOR_THRESHOLD_DB,
  SYNTH_COMPRESSOR_RATIO,
  SYNTH_COMPRESSOR_KNEE_DB,
  SYNTH_COMPRESSOR_ATTACK_SEC,
  SYNTH_COMPRESSOR_RELEASE_SEC,
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

/** 1音ぶんのノードの集合。打楽器は雑音（AudioBufferSourceNode）も使うため、音源は AudioScheduledSourceNode で一般化する。 */
export interface VoiceNodes {
  /** 発音体。オシレーターと雑音源の共通の親で扱う。添字0は再生終了通知の担当（無音の合図用音源）。 */
  sources: AudioScheduledSourceNode[];
  /** 根の音量節点。全成分を束ね、最古音消音（素早い消し止め）の操作対象にする。 */
  gain: GainNode;
  /** 成分の音量節点・フィルター・残響送りなど、破棄時に切断する補助節点。 */
  extraNodes: AudioNode[];
}

/** 共有出力グラフの2つの入口と、利用者の音量調整に使うマスター音量節点。 */
export interface OutputGraphInputs {
  /** 直接音（乾いた音）の入口。各音は常時ここへつなぐ。 */
  dryInput: AudioNode;
  /** 残響音（湿った音）の入口。各音はレーンごとの残響送り量でここへつなぐ。 */
  wetInput: AudioNode;
  /** マスター音量節点。基準値は SYNTH_MASTER_GAIN。利用者の音量調整（Issue #77）はこの利得を基準値へ倍率で掛けて行う。 */
  master: GainNode;
}

/**
 * 共有出力グラフを構築し、直接音入口と残響音入口の2つを返す。
 * 直接音入口: 高域通過（低めの遮断で低音を通す）→ 低域通過 → 合流点。
 * 残響音入口: 高域通過（直接音より高い遮断で低域を残響に乗せない）→ 低域通過 → 残響（ConvolverNode）→ 残響音量 → 合流点。
 * 合流点 → 動的圧縮 → マスター音量 → 最終の柔らかい飽和制限 → 出力先。
 * 直接音と残響を分けて2入口にする理由を先に述べる。レーンごとに残響送り量を変える（低いレーンは0にする）には、
 * 1つの入口を内部で固定分岐する形では実現しにくく、各音が直接音と残響へ別々の量で接続できる形が要るためである。
 * 最終の柔らかい飽和制限は、膝より大きい多数同時の頂点だけを天井（1.0未満）へ抑え、どの端末でもクリップを防ぐ。
 * 過剰標本化は内部の補間で遅延を生むため行わない。
 */
export function buildOutputGraph(
  ctx: BaseAudioContext,
  destination: AudioNode
): OutputGraphInputs {
  // 合流点（直接音と残響音を合算する）。利得は1。
  const mixSum = ctx.createGain();
  mixSum.gain.value = 1;

  // 直接音入口: 高域通過 → 低域通過 → 合流点。
  const dryHighpass = ctx.createBiquadFilter();
  dryHighpass.type = "highpass";
  dryHighpass.frequency.value = SYNTH_HIGHPASS_HZ;
  const dryLowpass = ctx.createBiquadFilter();
  dryLowpass.type = "lowpass";
  dryLowpass.frequency.value = SYNTH_LOWPASS_HZ;
  dryHighpass.connect(dryLowpass);
  dryLowpass.connect(mixSum);

  // 残響音入口: 高域通過（直接音より高い遮断）→ 低域通過 → 残響 → 残響音量 → 合流点。
  const wetHighpass = ctx.createBiquadFilter();
  wetHighpass.type = "highpass";
  wetHighpass.frequency.value = SYNTH_REVERB_HIGHPASS_HZ;
  const wetLowpass = ctx.createBiquadFilter();
  wetLowpass.type = "lowpass";
  wetLowpass.frequency.value = SYNTH_LOWPASS_HZ;
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
  wetHighpass.connect(wetLowpass);
  wetLowpass.connect(convolver);
  convolver.connect(wetGain);
  wetGain.connect(mixSum);

  // 合流点 → 動的圧縮 → マスター音量 → 最終の柔らかい飽和制限 → 出力先。
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = SYNTH_COMPRESSOR_THRESHOLD_DB;
  compressor.ratio.value = SYNTH_COMPRESSOR_RATIO;
  compressor.knee.value = SYNTH_COMPRESSOR_KNEE_DB;
  compressor.attack.value = SYNTH_COMPRESSOR_ATTACK_SEC;
  compressor.release.value = SYNTH_COMPRESSOR_RELEASE_SEC;

  const master = ctx.createGain();
  master.gain.value = SYNTH_MASTER_GAIN;

  const softClip = ctx.createWaveShaper();
  softClip.curve = generateSoftClipCurve(
    SYNTH_SOFTCLIP_CURVE_SAMPLES,
    SYNTH_SOFTCLIP_KNEE,
    SYNTH_SOFTCLIP_CEILING
  );
  softClip.oversample = "none";

  mixSum.connect(compressor);
  compressor.connect(master);
  master.connect(softClip);
  softClip.connect(destination);

  return { dryInput: dryHighpass, wetInput: wetHighpass, master };
}
