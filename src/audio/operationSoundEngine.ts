// 操作音エンジン本体。AudioContext の遅延生成と起動、共有出力グラフの構築、発音、同時発音管理、
// 有効・無効の切替、投下中の音色切替、破棄の競合防御を担う。
// 時計は AudioContext.currentTime のみを使い、ゲームの時計（再生位置）とは混同しない（architecture §6）。
// どのレーンを叩いても同じ単一の「水滴が弾ける音」を鳴らす（droplet.ts）。曲データ（profiles）は import しない。

import type { EngineContextState, OperationSoundEngine } from "./types";
import { createVoicePool } from "./voicePool";
import { computeStealEnvelope } from "./envelope";
import { buildOutputGraph, type OutputGraphInputs, type VoiceNodes } from "./voiceGraph";
import {
  buildDropletVoice,
  buildCalibrationVoice,
  OPERATION_LANE_COUNT,
} from "./droplet";
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
  // 共有出力グラフの2つの入口（直接音と残響音）。各音はこの2つへ接続する。
  let graph: OutputGraphInputs | null = null;
  let unlockPromise: Promise<EngineContextState> | null = null;

  let enabled = true;
  // 投下中かどうか。真のあいだ、以後の発音を少し大きく・存在感を増す。既定は偽（通常）。
  let deployTimbre = false;
  let disposed = false;

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

  // 1音ぶんの全節点（音源・音量節点・補助節点）を切断する。
  function disconnectVoice(voice: VoiceNodes): void {
    try {
      for (const source of voice.sources) {
        source.disconnect();
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
      pool.remove(oldestId);
      return;
    }
    pool.markMuting(oldestId);
    const now = context.currentTime;
    const steal = computeStealEnvelope(now);
    // 予約済みの音量変化を取り消し、その瞬間の音量を始点に固定してから0へ線形に下げる。
    // 根の音量節点は全成分を束ねるため、この消音は全成分に効く。
    // 始点固定を挟むのは、線形の補間が「直前に予約したイベントの値」を始点にする仕様への対処である。
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.linearRampToValueAtTime(0, steal.fadeEndTime);
    // 全成分（合図用音源を含む）の停止を消音終了の少し後へ再予約する（停止の予約は最後の呼び出しが有効）。
    for (const source of voice.sources) {
      try {
        source.stop(steal.stopTime);
      } catch {
        // すでに停止予約済みでも安全に進める。
      }
    }
  }

  // 組み上げた1音を同時発音管理へ登録し、再生終了通知で後始末する。
  // 添字0は無音の合図用音源で、音全体の停止時刻まで鳴る。その終了通知で一度だけ後始末する。
  // 破棄中は破棄側で一括処理するため何もしない（二重処理を避ける）。
  function registerVoice(voice: VoiceNodes, startTime: number): void {
    const id = nextVoiceId;
    nextVoiceId += 1;
    voices.set(id, voice);
    pool.add(id, startTime);
    voice.sources[0].onended = (): void => {
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
        graph = buildOutputGraph(context, context.destination);
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
      // 投下中かどうかの状態。真のあいだ、以後の発音を少し大きく・存在感を増す。鳴っている音は再調整しない。
      deployTimbre = active;
    },

    playSlot(slotIndex: number): void {
      if (disposed || !enabled || !context || !graph || context.state !== "running") {
        return;
      }
      // レーン番号は範囲だけ検査する。音はどのレーンでも同じ水滴音にするため、番号で音色は変えない（利用者の決定）。
      if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= OPERATION_LANE_COUNT) {
        return;
      }
      // 発音中が上限に達していれば、最古の発音中を消してから新規を加える。
      if (pool.soundingCount >= SYNTH_POLYPHONY_MAX) {
        stealOldestVoice();
      }
      const ctx = context;
      const startTime = ctx.currentTime;
      const voice = buildDropletVoice(ctx, graph, deployTimbre);
      registerVoice(voice, startTime);
    },

    playCalibrationCue(): void {
      // 較正音は、操作音の有効・無効に関わらず鳴らす（較正は設定の準備手順であり基準音が聞こえる必要があるため）。
      // 同時発音管理は他の音と同じ後始末経路に載せる。短い単音で、設定中に鳴らすため上限への影響は無視できる。
      if (disposed || !context || !graph || context.state !== "running") {
        return;
      }
      if (pool.soundingCount >= SYNTH_POLYPHONY_MAX) {
        stealOldestVoice();
      }
      const ctx = context;
      const startTime = ctx.currentTime;
      const voice = buildCalibrationVoice(ctx, graph.dryInput);
      registerVoice(voice, startTime);
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
      // プールの全音について、停止と接続切断を例外捕捉つきで行う。全音源を走査する。
      for (const id of pool.ids()) {
        const voice = voices.get(id);
        if (voice) {
          for (const source of voice.sources) {
            try {
              source.onended = null;
              source.stop();
            } catch {
              // すでに停止済みでも安全に進める。
            }
          }
          disconnectVoice(voice);
        }
      }
      // 節点の対応表とプールの両方を空にする。プールを空にすることで、破棄後の発音中の数・接続中の数が0になる。
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
