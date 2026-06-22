// 操作音エンジン本体。AudioContext の遅延生成と起動、共有出力グラフの構築、発音、同時発音管理、
// 有効・無効の切替、投下中の音色切替、破棄の競合防御を担う。
// 時計は AudioContext.currentTime のみを使い、ゲームの時計（再生位置）とは混同しない（architecture §6）。
// 曲データ（profiles）は import せず、スロットの音高は setSlotPitches で、投下中かどうかは setDeployTimbre で
// 外から受け取る（architecture §5）。

import type { EngineContextState, OperationSoundEngine } from "./types";
import { midiToFrequency, sanitizeSlotPitches, slotToMidi } from "./pitch";
import { createVoicePool } from "./voicePool";
import { computeNaturalEnvelope, computeStealEnvelope } from "./envelope";
import { buildOutputGraph, buildVoice, type VoiceNodes } from "./voiceGraph";
import { SYNTH_POLYPHONY_MAX, ENGINE_STATE_UNINITIALIZED } from "./synthConstants";

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
  // 投下中かどうか。真のあいだ、以後の発音に倍音層を重ねる。既定は偽（通常）。
  let deployTimbre = false;
  let disposed = false;
  let slotPitches: number[] = [];

  const pool = createVoicePool();
  const voices = new Map<number, VoiceNodes>();
  let nextVoiceId = 0;

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

  // 1音ぶんの全節点（基本オシレーター・倍音オシレーター・音量節点・補助節点）を切断する。
  function disconnectVoice(voice: VoiceNodes): void {
    try {
      for (const oscillator of voice.oscillators) {
        oscillator.disconnect();
      }
      voice.gain.disconnect();
      for (const node of voice.extraNodes) {
        node.disconnect();
      }
    } catch {
      // すでに切断済みでも安全に進める。
    }
  }

  function removeVoice(id: number): void {
    const voice = voices.get(id);
    if (voice) {
      disconnectVoice(voice);
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
    // 音量節点は基本音と倍音の双方を駆動するため、この消音は両成分に効く。
    // 始点固定を挟むのは、線形の補間が「直前に予約したイベントの値」を始点にする仕様への対処である。
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.linearRampToValueAtTime(0, steal.fadeEndTime);
    // 基本音と倍音の全オシレーターの停止を消音終了の少し後へ再予約する
    // （停止の予約は最後の呼び出しが有効で、より早い時刻へ移せる）。
    for (const oscillator of voice.oscillators) {
      try {
        oscillator.stop(steal.stopTime);
      } catch {
        // すでに停止予約済みでも安全に進める。
      }
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
    // 投下中なら倍音層を重ねる。鳴っている音は再調整せず、以後の発音にだけ適用する。
    const voice = buildVoice(ctx, inputNode, frequencyHz, deployTimbre);

    const env = computeNaturalEnvelope(ctx.currentTime);
    // 立ち上げは0から頂点へ直線、減衰は頂点（正の値）から微小値へ指数。指数は0を始点にしない。
    // 音量節点が基本音と倍音の双方を駆動するため、この包絡は両成分に共通で効く。
    voice.gain.gain.setValueAtTime(0, env.startTime);
    voice.gain.gain.linearRampToValueAtTime(env.peakGain, env.attackEndTime);
    voice.gain.gain.exponentialRampToValueAtTime(env.endGain, env.decayEndTime);

    // 基本音と倍音は同一時刻で開始・停止する。
    for (const oscillator of voice.oscillators) {
      oscillator.start(env.startTime);
      oscillator.stop(env.stopTime);
    }

    const id = nextVoiceId;
    nextVoiceId += 1;
    voices.set(id, voice);
    pool.add(id, env.startTime);

    // 添字0の基本オシレーターを再生終了通知の担当にする。全オシレーターは同一時刻で停止するため、
    // 基本オシレーターの通知で発音全体の終了とみなし、一度だけ後始末する（倍音は通知を持たなくてよい）。
    // 破棄中は破棄側で一括処理するため何もしない（二重処理を避ける）。
    voice.oscillators[0].onended = (): void => {
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
        inputNode = buildOutputGraph(context, context.destination);
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

    setDeployTimbre(active: boolean): void {
      // 投下中かどうかの状態。真のあいだ、以後の発音に倍音層を重ねる。鳴っている音は再調整しない。
      // 破棄後は trigger が無音のため、状態を変えても無作用になる。
      deployTimbre = active;
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

    get outputLatencyMs(): number | null {
      // 起動前・停止後は測定できないため null を返す。較正UIは null のとき参考値の提示をやめ、既定0を初期つまみ位置にする。
      if (!context || context.state !== "running") {
        return null;
      }
      // outputLatency は未対応のブラウザで undefined になるため 0 に倒す。baseLatency も同様。単位は秒なので
      // 作品全体のミリ秒統一に合わせて 1000 倍する。
      const output =
        typeof context.outputLatency === "number" ? context.outputLatency : 0;
      const base =
        typeof context.baseLatency === "number" ? context.baseLatency : 0;
      const milliseconds = (output + base) * 1000;
      return Number.isFinite(milliseconds) ? milliseconds : null;
    },

    dispose(): void {
      if (disposed) {
        return;
      }
      // 破棄フラグを先に立て、各音の再生終了通知の処理を無効化する（除去や切断を一度だけにする）。
      disposed = true;
      // プールの全音について、停止と接続切断を例外捕捉つきで行う。基本音と倍音の全オシレーターを走査する。
      for (const id of pool.ids()) {
        const voice = voices.get(id);
        if (voice) {
          for (const oscillator of voice.oscillators) {
            try {
              oscillator.onended = null;
              oscillator.stop();
            } catch {
              // すでに停止済みでも安全に進める。
            }
          }
          disconnectVoice(voice);
        }
      }
      // 節点の対応表とプールの両方を空にする。プールを空にすることで、破棄後の発音中の数・接続中の数が0になる
      // （プールに残したままだと、破棄後も発音数を過大に報告してしまう）。
      voices.clear();
      pool.clear();
      // 最後に AudioContext を閉じる。
      if (context) {
        void context.close().catch(() => {
          // 閉じる処理の失敗は後始末の続行を妨げないため握りつぶす。
        });
      }
    },
  };
}
