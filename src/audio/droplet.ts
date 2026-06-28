// 全レーン共通の単一効果音「水滴が弾ける音」を Web Audio のコード合成で作る。
// 録音素材・人工知能生成音源は使わず、すべてコードで合成する。雑音は random.ts の決定的な疑似乱数で作る。
//
// 設計の根拠（Web上の調査）を先に述べる。水滴音の正体は、着水時に水中へ取り込まれた気泡の共鳴であり、
// 知覚上の決め手は次の3点である。
//  1. 上向きに周波数が上がる減衰サイン。気泡が安定・縮小するにつれ共鳴周波数が上がるため、音程が上向きに滑る
//     （下向きはキック・太鼓に聞こえ、水滴にならない）。物理ベースの液体音モデルは p(t)=A·sin(2πf(t)t)·e^(−βt) で、
//     f が時間とともに上昇する（van den Doel 2005 / Farnell『Designing Sound』/ Scientific Reports 2018）。
//  2. 着水の一瞬の衝撃を表す、ごく短い帯域制限した雑音の「チッ」を小さく重ねる二段モデル（DAFx 雨合成）。
//     これが「弾ける」打点を与える。
//  3. タップごとの個体差。実際の水滴は気泡の大きさ（=音程と減衰）が毎回違うため、基音・チャープ量・減衰・音量を
//     一定範囲で揺らさないと機械的な反復に聞こえる。気泡が小さいほど高く短い（Minnaert 共鳴 f≈3260/半径[mm]Hz）。
// 高域の鋭さは低域通過（共有出力グラフ）で和らげ、少々の遅延でも違和感が小さい打点にする。
// 値はすべて実機試聴で確定する見積もり（★暫定）。出典は上記に加え MDN Web Audio（クリックを避ける指数包絡）。

import type { VoiceNodes, OutputGraphInputs } from "./voiceGraph";
import { SYNTH_VOICE_PEAK, SYNTH_ENVELOPE_EPSILON } from "./synthConstants";
import { createSeededRandom, generateWhiteNoise } from "./random";

/** 操作音が受け持つレーン数。判定系のスロット数（7）と一致する。音はどのレーンでも同じ水滴音にする（利用者の決定）。 */
export const OPERATION_LANE_COUNT = 7;

/** 減衰が微小値へ落ちてから音源を止めるための末尾の余裕（ミリ秒）。停止時の雑音を避けるため。 */
const RELEASE_TAIL_MS = 20;

// 水滴音の設計値（★暫定）。理由は各定数のコメントに先に述べる。

/** 気泡共鳴の基準の基音（ヘルツ）。可聴で心地よい水滴の音程の中心。物理の数キロヘルツではなく、音楽的に扱える帯に置く。 */
const DROPLET_BASE_HZ = 760;
/** 基音のタップごとの揺らぎ幅（半音）。±この範囲で気泡の大きさの違いを表す。短い減衰のため、この幅でも濁らず心地よい。 */
const DROPLET_PITCH_SPREAD_SEMITONES = 4;
/** 上向きチャープの基準の周波数倍率。気泡が縮むにつれ共鳴が上がる動きを表す。1.85は約+11半音で、水滴らしさの中心。 */
const DROPLET_RISE_FACTOR = 1.85;
/** チャープ倍率のタップごとの揺らぎ範囲（基準への乗数）。滑りの大きい水滴と小さい水滴の差を作る。 */
const DROPLET_RISE_JITTER_MIN = 0.9;
const DROPLET_RISE_JITTER_MAX = 1.18;
/** チャープにかける時間（ミリ秒）の基準。短い前半で音程を上げ切ると水滴らしい「ピチョン」になる。 */
const DROPLET_CHIRP_MS = 85;
/** チャープ時間のタップごとの揺らぎ範囲（基準への乗数）。 */
const DROPLET_CHIRP_JITTER_MIN = 0.8;
const DROPLET_CHIRP_JITTER_MAX = 1.25;
/** 本体（気泡サイン）の立ち上がり時間（ミリ秒）。打点を締めるため非常に速くするが、0にはせずクリックを避ける。 */
const DROPLET_BODY_ATTACK_MS = 2;
/** 本体の減衰時間（ミリ秒）の基準。気泡の鳴りは短い。残響で余韻を足すため直接音は伸ばし過ぎない。 */
const DROPLET_DECAY_MS = 150;
/** 減衰のタップごとの揺らぎ範囲（基準への乗数）。さらに、高い音ほど短くする（小さい気泡は速く減衰する）物理に倣う。 */
const DROPLET_DECAY_JITTER_MIN = 0.78;
const DROPLET_DECAY_JITTER_MAX = 1.3;
/** 本体の頂点音量比（0より大きい）。音程を運ぶ主成分。 */
const DROPLET_BODY_PEAK = 0.95;
/** 着水の衝撃の「チッ」を鳴らす確率。たまに衝撃を省くと、柔らかい「ポチョン」の個体差が出る。 */
const DROPLET_TICK_PROBABILITY = 0.85;
/** 着水の衝撃の音量比（本体より十分小さい）。打点を締めるが、鋭いクリックにはしない。 */
const DROPLET_TICK_GAIN = 0.13;
/** 着水の衝撃の雑音の帯域（ヘルツ）。低域の濁りを避ける高域通過と、鋭さを抑える低域通過で挟む。 */
const DROPLET_TICK_HIGHPASS_HZ = 1800;
const DROPLET_TICK_LOWPASS_HZ = 5200;
/** 着水の衝撃の立ち上がり・減衰（ミリ秒）。ごく短い打点。 */
const DROPLET_TICK_ATTACK_MS = 0.5;
const DROPLET_TICK_DECAY_MS = 9;
/** 残響への送り量（0以上1以下）。空間の中の水滴の余韻を、直接音を覆わない量だけ足す。 */
const DROPLET_REVERB_SEND = 0.18;
/** 投下中に根の音量へ足す比（0以上）。投下時に少し大きく・存在感を増す。 */
const DROPLET_DEPLOY_GAIN_ADD = 0.12;

/** 水滴音の疑似乱数の種（固定値）。同じ種から同じ揺らぎの列を再現する。値そのものに意味はない。 */
const DROPLET_RANDOM_SEED = 20260629;

// タップごとの個体差を生む疑似乱数。1音ごとに数値を引いて列を進めるため、各音の揺らぎは異なり、列は決定的に再現できる。
const dropletRandom = createSeededRandom(DROPLET_RANDOM_SEED);

function randomInRange(random: () => number, min: number, max: number): number {
  return min + (max - min) * random();
}

/** 1音ぶんに選ぶ水滴音のパラメータ。タップごとに範囲内で揺らぐ。純関数の検査のため型と生成関数を公開する。 */
export interface DropletParams {
  /** 本体の開始周波数（ヘルツ）。 */
  baseHz: number;
  /** 上向きチャープの終了周波数（ヘルツ）。baseHz より高い。 */
  riseHz: number;
  /** チャープにかける時間（ミリ秒）。 */
  chirpMs: number;
  /** 本体の減衰時間（ミリ秒）。 */
  decayMs: number;
  /** 本体の頂点音量比。 */
  bodyPeak: number;
  /** 着水の衝撃を鳴らすか。 */
  includeTick: boolean;
  /** 着水の衝撃の音量比。 */
  tickGain: number;
  /** 着水の衝撃の高域通過の遮断周波数（ヘルツ）。 */
  tickHighpassHz: number;
  /** 着水の衝撃の雑音を作る種。1音ごとに変えて、同時発音・連打でも雑音が相関しないようにする。 */
  noiseSeed: number;
}

/**
 * 1音ぶんの水滴音のパラメータを、与えた疑似乱数から選ぶ純関数。範囲は各定数で定める。
 * 高い音ほど減衰を短くする（小さい気泡は速く減衰する物理に倣い、音程の平方根で減衰を割る）。
 */
export function nextDropletParams(random: () => number): DropletParams {
  const pitchMultiplier =
    2 ** (randomInRange(random, -DROPLET_PITCH_SPREAD_SEMITONES, DROPLET_PITCH_SPREAD_SEMITONES) / 12);
  const baseHz = DROPLET_BASE_HZ * pitchMultiplier;
  const riseFactor = DROPLET_RISE_FACTOR * randomInRange(random, DROPLET_RISE_JITTER_MIN, DROPLET_RISE_JITTER_MAX);
  const chirpMs = DROPLET_CHIRP_MS * randomInRange(random, DROPLET_CHIRP_JITTER_MIN, DROPLET_CHIRP_JITTER_MAX);
  const decayJitter = randomInRange(random, DROPLET_DECAY_JITTER_MIN, DROPLET_DECAY_JITTER_MAX);
  // 高い音（pitchMultiplier > 1）ほど減衰を短くする。平方根にして効きを穏やかにする。
  const decayMs = (DROPLET_DECAY_MS * decayJitter) / Math.sqrt(pitchMultiplier);
  const includeTick = random() < DROPLET_TICK_PROBABILITY;
  const tickGain = DROPLET_TICK_GAIN * randomInRange(random, 0.75, 1.15);
  const tickHighpassHz = DROPLET_TICK_HIGHPASS_HZ * randomInRange(random, 0.85, 1.2);
  const noiseSeed = Math.floor(random() * 1_000_000_000) + 1;
  return {
    baseHz,
    riseHz: baseHz * riseFactor,
    chirpMs,
    decayMs,
    bodyPeak: DROPLET_BODY_PEAK,
    includeTick,
    tickGain,
    tickHighpassHz,
    noiseSeed,
  };
}

/** 1音の停止時刻の上限（開始からの秒数）。最長の減衰（揺らぎ最大）に末尾の余裕を足した値。測定窓と検査の上限に使う。 */
export function dropletMaxStopSeconds(): number {
  // 最長は、減衰の揺らぎ最大かつ最も低い音（pitchMultiplier 最小）のとき。
  const lowestPitchMultiplier = 2 ** (-DROPLET_PITCH_SPREAD_SEMITONES / 12);
  const longestDecayMs = (DROPLET_DECAY_MS * DROPLET_DECAY_JITTER_MAX) / Math.sqrt(lowestPitchMultiplier);
  return (DROPLET_BODY_ATTACK_MS + longestDecayMs + RELEASE_TAIL_MS) / 1000;
}

// 1成分の音量包絡（立ち上がり0→頂点、減衰は頂点→微小値の指数）を音量節点へ予約する。
function scheduleEnvelope(
  gainNode: GainNode,
  startTime: number,
  peak: number,
  attackMs: number,
  decayMs: number
): void {
  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(peak, startTime + attackMs / 1000);
  gainNode.gain.exponentialRampToValueAtTime(
    SYNTH_ENVELOPE_EPSILON,
    startTime + (attackMs + decayMs) / 1000
  );
}

/**
 * 全レーン共通の水滴音1音ぶんのノード群を組む。タップごとに範囲内で揺らぐ個体差を持つ。
 * 本体（上向きチャープの気泡サイン）と、確率的に重ねる着水の衝撃（短い帯域制限雑音）を、それぞれ成分の音量節点を通して
 * 根の音量節点へ合流させ、根の音量節点を直接音入口へ常時、残響送り量で残響音入口へつなぐ。
 * 全成分と無音の合図用音源を単一の停止時刻で止め、短い成分での早期の後始末を防ぐ。
 */
export function buildDropletVoice(
  ctx: BaseAudioContext,
  outputs: OutputGraphInputs,
  deployBright: boolean
): VoiceNodes {
  const params = nextDropletParams(dropletRandom);
  const startTime = ctx.currentTime;
  // 停止時刻は、本体と着水の衝撃のうち長い方の終わりに末尾の余裕を足した単一の時刻。
  const bodyEndMs = DROPLET_BODY_ATTACK_MS + params.decayMs;
  const tickEndMs = params.includeTick ? DROPLET_TICK_ATTACK_MS + DROPLET_TICK_DECAY_MS : 0;
  const stopTime = startTime + (Math.max(bodyEndMs, tickEndMs) + RELEASE_TAIL_MS) / 1000;

  // 根の音量節点（最古音消音の操作対象）。投下時は音量を少し増やす。
  const rootGain = ctx.createGain();
  rootGain.gain.value = SYNTH_VOICE_PEAK + (deployBright ? DROPLET_DEPLOY_GAIN_ADD : 0);

  const sources: AudioScheduledSourceNode[] = [];
  const extraNodes: AudioNode[] = [];

  // 本体: 上向きチャープの気泡サイン。
  const bodyGain = ctx.createGain();
  scheduleEnvelope(bodyGain, startTime, params.bodyPeak, DROPLET_BODY_ATTACK_MS, params.decayMs);
  bodyGain.connect(rootGain);
  extraNodes.push(bodyGain);

  const body = ctx.createOscillator();
  body.type = "sine";
  body.frequency.setValueAtTime(params.baseHz, startTime);
  // 指数の滑降は自然に聞こえる。終点は0にできないため、上向きで1ヘルツ以上に丸める（実際は数百ヘルツ）。
  body.frequency.exponentialRampToValueAtTime(
    Math.max(1, params.riseHz),
    startTime + params.chirpMs / 1000
  );
  body.connect(bodyGain);
  body.start(startTime);
  body.stop(stopTime);
  sources.push(body);

  // 着水の衝撃: ごく短い帯域制限した雑音の打点（確率的に省く）。
  if (params.includeTick) {
    const tickGainNode = ctx.createGain();
    scheduleEnvelope(tickGainNode, startTime, params.tickGain, DROPLET_TICK_ATTACK_MS, DROPLET_TICK_DECAY_MS);
    tickGainNode.connect(rootGain);
    extraNodes.push(tickGainNode);

    const noiseSeconds = (DROPLET_TICK_ATTACK_MS + DROPLET_TICK_DECAY_MS + RELEASE_TAIL_MS) / 1000;
    const noiseLength = Math.max(1, Math.ceil(noiseSeconds * ctx.sampleRate));
    const noiseSamples = generateWhiteNoise(noiseLength, params.noiseSeed);
    const noiseBuffer = ctx.createBuffer(1, noiseLength, ctx.sampleRate);
    noiseBuffer.getChannelData(0).set(noiseSamples);
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    const highpass = ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = params.tickHighpassHz;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = DROPLET_TICK_LOWPASS_HZ;
    noiseSource.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(tickGainNode);
    noiseSource.start(startTime);
    noiseSource.stop(stopTime);
    sources.push(noiseSource);
    extraNodes.push(highpass, lowpass);
  }

  // 根の音量節点を直接音入口へ常時つなぐ。さらに残響送り量の音量節点を介して残響音入口へつなぐ。
  rootGain.connect(outputs.dryInput);
  const sendGain = ctx.createGain();
  sendGain.gain.value = DROPLET_REVERB_SEND;
  rootGain.connect(sendGain);
  sendGain.connect(outputs.wetInput);
  extraNodes.push(sendGain);

  // 無音の合図用音源。停止時刻まで鳴り、再生終了通知で後始末する。
  // 理由を先に述べる。雑音の音源は標本列の末尾で自然に終了するため、音全体の終了の合図役にすると早く後始末してしまう。
  // オシレーターは標本列を持たず停止時刻まで鳴り続けるため、出力につながない（音を出さない）オシレーターを合図役にすると、
  // 大きな無音の標本列を持たずに、確実に音全体の終了で後始末できる。添字0を合図用音源にする。
  const keeper = ctx.createOscillator();
  keeper.frequency.value = 1;
  keeper.start(startTime);
  keeper.stop(stopTime);
  sources.unshift(keeper);

  return { sources, gain: rootGain, extraNodes };
}

/** 較正音の固定周波数（ヘルツ）と長さ（ミリ秒）。会話帯域より高く点滅の合図として聞き取りやすい固定値。 */
const CALIBRATION_HZ = 880;
const CALIBRATION_MS = 60;
/** 較正音の頂点音量。基準音として聞き取りやすい一定の音量。 */
const CALIBRATION_PEAK = 0.8;

/**
 * 較正用の基準音（固定の短い音）の1音ぶんのノード群を組む。
 * 操作音の水滴音とは別に、点滅に拍を合わせる較正のための一定の音を鳴らす。残響を使わず直接音入口だけにつなぐ。
 * 揺らぎは持たず、毎回同じ固定の周波数・長さで鳴らす（較正の基準のため）。
 */
export function buildCalibrationVoice(
  ctx: BaseAudioContext,
  dryInput: AudioNode
): VoiceNodes {
  const startTime = ctx.currentTime;
  const stopTime = startTime + (CALIBRATION_MS + RELEASE_TAIL_MS) / 1000;

  const rootGain = ctx.createGain();
  rootGain.gain.value = SYNTH_VOICE_PEAK;

  const componentGain = ctx.createGain();
  scheduleEnvelope(componentGain, startTime, CALIBRATION_PEAK, 4, CALIBRATION_MS - 4);
  componentGain.connect(rootGain);
  rootGain.connect(dryInput);

  const oscillator = ctx.createOscillator();
  oscillator.type = "sine";
  oscillator.frequency.value = CALIBRATION_HZ;
  oscillator.connect(componentGain);
  oscillator.start(startTime);
  oscillator.stop(stopTime);

  const keeper = ctx.createOscillator();
  keeper.frequency.value = 1;
  keeper.start(startTime);
  keeper.stop(stopTime);

  return { sources: [keeper, oscillator], gain: rootGain, extraNodes: [componentGain] };
}
