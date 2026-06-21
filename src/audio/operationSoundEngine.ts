// 操作音エンジン本体。AudioContext の遅延生成と起動、共有フィルター連鎖の構築、発音、同時発音管理、
// 有効・無効の切替、破棄の競合防御を担う。
// 時計は AudioContext.currentTime のみを使い、ゲームの時計（再生位置）とは混同しない（architecture §6）。
// 曲データ（profiles）は import せず、スロットの音高は setSlotPitches で外から受け取る（architecture §5）。

import type { EngineContextState, OperationSoundEngine } from "./types";
import { midiToFrequency, sanitizeSlotPitches, slotToMidi } from "./pitch";
import { createVoicePool } from "./voicePool";
import { computeNaturalEnvelope, computeStealEnvelope } from "./envelope";
import {
  SYNTH_WAVEFORM,
  SYNTH_HIGHPASS_HZ,
  SYNTH_LOWPASS_HZ,
  SYNTH_POLYPHONY_MAX,
  SYNTH_MASTER_GAIN,
  SYNTH_COMPRESSOR_THRESHOLD_DB,
  SYNTH_COMPRESSOR_RATIO,
  SYNTH_COMPRESSOR_KNEE_DB,
  SYNTH_COMPRESSOR_ATTACK_SEC,
  SYNTH_COMPRESSOR_RELEASE_SEC,
  ENGINE_STATE_UNINITIALIZED,
} from "./synthConstants";

// 発音1音ぶんの実体（プールは識別子だけを持ち、実際の節点はここで対応づける）。
interface Voice {
  oscillator: OscillatorNode;
  gain: GainNode;
}

// 標準の AudioContext と、古い Safari の接頭辞つき実装の両方を受け付ける。
function resolveAudioContextConstructor(): typeof AudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }
  const candidate =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return candidate ?? null;
}

export function createOperationSoundEngine(): OperationSoundEngine {
  let context: AudioContext | null = null;
  // 共有部の入口（使い捨ての音はここへ接続する）。
  let inputNode: BiquadFilterNode | null = null;
  let unlockPromise: Promise<EngineContextState> | null = null;

  let enabled = true;
  let disposed = false;
  let slotPitches: number[] = [];

  const pool = createVoicePool();
  const voices = new Map<number, Voice>();
  let nextVoiceId = 0;

  function buildSharedGraph(ctx: AudioContext): BiquadFilterNode {
    // 高域通過300ヘルツ → 低域通過4500ヘルツ → 動的圧縮 → マスター音量 → 出力。
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
    master.connect(ctx.destination);
    return highpass;
  }

  // 起動の確実化のため、無音の短い音源を一度だけ出力へ直結して鳴らす（無条件・計数しない）。
  // 一部のブラウザ（特にiOS）では resume() だけでは running にならないため、無音の音源を一度鳴らすと
  // 確実に running へ移る。利用者の環境を判定する方法はもろいため環境は判定しない。
  function playSilentUnlockSource(ctx: AudioContext): void {
    try {
      const buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
    } catch {
      // 無音起動に失敗しても発音には影響しないため、握りつぶす。
    }
  }

  function removeVoice(id: number): void {
    const voice = voices.get(id);
    if (voice) {
      try {
        voice.oscillator.disconnect();
        voice.gain.disconnect();
      } catch {
        // すでに切断済みでも安全に進める。
      }
      voices.delete(id);
    }
    pool.remove(id);
  }

  // 上限到達時、最も古い発音中の音を素早く消してから止める（消音中へ移す）。
  function stealOldestVoice(): void {
    const oldestId = pool.oldestSoundingId();
    if (oldestId === null || !context) {
      return;
    }
    const voice = voices.get(oldestId);
    if (!voice) {
      // 不変条件（プールの識別子と節点が常に対応する）が万一崩れた場合の自己修復。
      // 節点が無ければ消音も停止もできず、消音中へ移すと取り除く契機（再生終了通知）が来ないため、
      // プールからも取り除いて発音中の数と接続中の数の食い違いを残さない。
      pool.remove(oldestId);
      return;
    }
    pool.markMuting(oldestId);
    const now = context.currentTime;
    const steal = computeStealEnvelope(now);
    // 予約済みの指数減衰を取り消し、その瞬間の音量を始点に固定してから0へ線形に下げる。
    // 始点固定を挟むのは、線形の補間が「直前に予約したイベントの値」を始点にする仕様への対処である。
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.linearRampToValueAtTime(0, steal.fadeEndTime);
    // 停止を消音終了の少し後へ再予約する（停止の予約は最後の呼び出しが有効で、より早い時刻へ移せる）。
    try {
      voice.oscillator.stop(steal.stopTime);
    } catch {
      // すでに停止予約済みでも安全に進める。
    }
  }

  function trigger(frequencyHz: number): void {
    if (disposed || !enabled || !context || !inputNode || context.state !== "running") {
      return;
    }
    // 発音中が上限に達していれば、最古の発音中を消してから新規を加える。
    if (pool.soundingCount >= SYNTH_POLYPHONY_MAX) {
      stealOldestVoice();
    }

    const ctx = context;
    const oscillator = ctx.createOscillator();
    oscillator.type = SYNTH_WAVEFORM;
    oscillator.frequency.value = frequencyHz;

    const gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(inputNode);

    const env = computeNaturalEnvelope(ctx.currentTime);
    // 立ち上げは0から頂点へ直線、減衰は頂点（正の値）から微小値へ指数。指数は0を始点にしない。
    gain.gain.setValueAtTime(0, env.startTime);
    gain.gain.linearRampToValueAtTime(env.peakGain, env.attackEndTime);
    gain.gain.exponentialRampToValueAtTime(env.endGain, env.decayEndTime);

    oscillator.start(env.startTime);
    oscillator.stop(env.stopTime);

    const id = nextVoiceId;
    nextVoiceId += 1;
    voices.set(id, { oscillator, gain });
    pool.add(id, env.startTime);

    // 停止後に接続を切り記憶を解放する。破棄中は破棄側で一括処理するため何もしない（二重処理を避ける）。
    oscillator.onended = (): void => {
      if (disposed) {
        return;
      }
      removeVoice(id);
    };
  }

  return {
    unlock(): Promise<EngineContextState> {
      if (disposed) {
        return Promise.resolve<EngineContextState>("closed");
      }
      if (unlockPromise) {
        return unlockPromise;
      }
      const Ctor = resolveAudioContextConstructor();
      if (!Ctor) {
        // 音声の仕組みが無い環境では起動できない。未生成のまま無音を保つ。
        return Promise.resolve(ENGINE_STATE_UNINITIALIZED);
      }
      if (!context) {
        context = new Ctor();
        inputNode = buildSharedGraph(context);
      }
      const ctx = context;
      const promise = ctx
        .resume()
        .then(() => {
          playSilentUnlockSource(ctx);
          return ctx.state as EngineContextState;
        })
        .catch((error: unknown) => {
          // 起動に失敗したらキャッシュを消し、次回の起動で再試行できるようにする。
          unlockPromise = null;
          throw error;
        });
      unlockPromise = promise;
      return promise;
    },

    setEnabled(value: boolean): void {
      enabled = value;
    },

    setSlotPitches(midiNotes: readonly number[] | null | undefined): void {
      // 未設定や非有限値を無効化する。鳴っている音は再調整しない（新しい音高は以後のタップへ適用する）。
      slotPitches = sanitizeSlotPitches(midiNotes);
    },

    playSlot(slotIndex: number): void {
      const midiNote = slotToMidi(slotPitches, slotIndex);
      if (midiNote === null) {
        return;
      }
      const frequencyHz = midiToFrequency(midiNote);
      if (frequencyHz === null) {
        return;
      }
      trigger(frequencyHz);
    },

    playNote(midiNote: number): void {
      const frequencyHz = midiToFrequency(midiNote);
      if (frequencyHz === null) {
        return;
      }
      trigger(frequencyHz);
    },

    get soundingVoiceCount(): number {
      return pool.soundingCount;
    },

    get activeVoiceCount(): number {
      return pool.activeCount;
    },

    get contextState(): EngineContextState {
      if (!context) {
        return ENGINE_STATE_UNINITIALIZED;
      }
      return context.state as EngineContextState;
    },

    dispose(): void {
      if (disposed) {
        return;
      }
      // 破棄フラグを先に立て、各音の再生終了通知の処理を無効化する（除去や切断を一度だけにする）。
      disposed = true;
      // プールの全音について、停止と接続切断を例外捕捉つきで行う。
      for (const id of pool.ids()) {
        const voice = voices.get(id);
        if (voice) {
          try {
            voice.oscillator.onended = null;
            voice.oscillator.stop();
          } catch {
            // すでに停止済みでも安全に進める。
          }
          try {
            voice.oscillator.disconnect();
            voice.gain.disconnect();
          } catch {
            // すでに切断済みでも安全に進める。
          }
        }
      }
      voices.clear();
      // 最後に AudioContext を閉じる。
      if (context) {
        void context.close().catch(() => {
          // 閉じる処理の失敗は後始末の続行を妨げないため握りつぶす。
        });
      }
    },
  };
}
