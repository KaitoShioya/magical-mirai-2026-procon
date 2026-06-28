// 入力の受付と発行を担うファクトリ。Pointer Events（マウス・ペン・指を同一の仕組みで扱うブラウザの入力イベント）と
// キーボードを受け、複数の指を識別番号で独立に管理し、画面座標を正規化して判定面写像関数へ通し、入力イベントを発行する。
// 依存規則（docs/decisions/architecture.md §5）に従い、profiles・tools・rendering・three.js を import しない。
// 3次元の交差判定（レイキャスト）もカメラ行列も参照しない（docs/decisions/app-overall-decisions.md §3.3）。
// 鳴る打楽器はX軸の7レーンで選ぶ。タップの横位置がレーン、タップ時刻が判定の基準になる。

import { PITCH_SLOT_COUNT_DEFAULT } from "../config/tuning";
import { laneCenterNormalizedX } from "../utils/pitchHudLayout";
import {
  inputSourceFromPointerType,
  mapToReactionCore,
  normalizePointerPosition,
  resolveSlotCount,
  type PointerInputSource,
} from "./coordinateMapping";

/** 入力源の種別。ポインタ由来の3種にキーボードを加える。 */
export type InputSource = PointerInputSource | "keyboard";

/** 1回の押下が生む入力イベント。判定・得点・色の実体は消費側が解釈する。 */
export interface Reaction {
  /** 入力源（タッチ・マウス・ペン・キーボード）。 */
  source: InputSource;
  /** ポインタ接触の識別番号。キーボードは null。 */
  pointerId: number | null;
  /** 0以上1以下の正規化X。 */
  normalizedX: number;
  /** 0以上1以下の正規化Y。 */
  normalizedY: number;
  /** 0以上 slotCount-1 以下の音程スロット番号（0が最も左のレーン）。 */
  slotIndex: number;
  /** 音程スロットの総数。 */
  slotCount: number;
  /** 0以上1以下の色パラメータ。色の実体は rendering が解釈する。 */
  colorX01: number;
  /** 入力時刻（event.timeStamp）。音楽時刻との差の計算は判定側が行う。 */
  eventTimeMs: number;
}

/** createInput の引数。 */
export interface InputOptions {
  /** 入力面要素。ポインタの受付と正規化の基準にする。 */
  target: HTMLElement;
  /** 押下ごとに呼ばれる。入力イベントを受け取る。 */
  onReaction: (reaction: Reaction) => void;
  /** 音程スロットの総数。既定は曲非依存の調整値 PITCH_SLOT_COUNT_DEFAULT。 */
  slotCount?: number;
  /** キーボード入力を受けるか。既定は受ける。 */
  keyboardEnabled?: boolean;
}

/** 入力モジュールの外部契約。 */
export interface Input {
  /** 入力受付の有効・無効を切り替える。現在値と同じ値で呼ぶと何もしない（冪等）。 */
  setActive(active: boolean): void;
  /** 診断用の読み取り。追跡中の接触数を返す。 */
  state(): { activePointerCount: number };
  /** 後始末。冪等。 */
  dispose(): void;
}

/** キーボードの数字キーで発火するときの正規化Y。採用理由を先に述べる。音程はXのレーンで決まりYは判定に使わないが、
 * 入力イベントの正規化Yには値が要るため、診断の解釈を安定させる画面中央の0.5を入れる。 */
const KEYBOARD_NORMALIZED_Y = 0.5;

export function createInput(options: InputOptions): Input {
  const { target, onReaction } = options;
  // 不正な設定値（0・負・非整数・非有限）は既定のスロット総数へ丸める。
  const slotCount = resolveSlotCount(options.slotCount, PITCH_SLOT_COUNT_DEFAULT);
  const keyboardEnabled = options.keyboardEnabled ?? true;

  // 追跡中のポインタ接触の識別番号。多指を独立に管理するための対応表である。
  const activePointers = new Set<number>();
  let active = false;
  let disposed = false;

  // 生成時に元の touch-action を控え、none を設定する。dispose で元へ戻す。
  const previousTouchAction = target.style.touchAction;
  target.style.touchAction = "none";

  function emit(
    source: InputSource,
    pointerId: number | null,
    normalizedX: number,
    normalizedY: number,
    eventTimeMs: number
  ): void {
    const core = mapToReactionCore(normalizedX, slotCount);
    onReaction({
      source,
      pointerId,
      normalizedX,
      normalizedY,
      slotIndex: core.slotIndex,
      slotCount,
      colorX01: core.colorX01,
      eventTimeMs,
    });
  }

  function handlePointerDown(event: PointerEvent): void {
    // スクロール・ピンチ・ダブルタップ拡大を止める。
    event.preventDefault();
    activePointers.add(event.pointerId);
    try {
      target.setPointerCapture(event.pointerId);
    } catch {
      // 合成された PointerEvent や捕捉に対応しない環境では失敗し得る。
      // 多指の追跡は捕捉ではなく対応表に依存するため、失敗は無視する。
    }
    const rect = target.getBoundingClientRect();
    const position = normalizePointerPosition(event.clientX, event.clientY, rect);
    emit(
      inputSourceFromPointerType(event.pointerType),
      event.pointerId,
      position.x,
      position.y,
      event.timeStamp
    );
  }

  function handlePointerRelease(event: PointerEvent): void {
    activePointers.delete(event.pointerId);
  }

  function handleKeyDown(event: KeyboardEvent): void {
    const key = event.key;
    // 数字キー1〜slotCount。対応するレーンが無い番号は無視する。
    if (key.length === 1 && key >= "1" && key <= "9") {
      const slotNumber = Number(key);
      if (slotNumber >= 1 && slotNumber <= slotCount) {
        event.preventDefault();
        // 押下1回につき1反応とするため、押し続けによる自動繰り返しは反応を生まない。
        if (event.repeat) {
          return;
        }
        const slotIndex = slotNumber - 1;
        // 指定スロットのレーンの中央の正規化Xで発火する（タップで該当レーンを叩いたのと同等）。
        const normalizedX = laneCenterNormalizedX(slotIndex, slotCount);
        emit("keyboard", null, normalizedX, KEYBOARD_NORMALIZED_Y, event.timeStamp);
      }
    }
  }

  function setActive(next: boolean): void {
    if (disposed || next === active) {
      return;
    }
    active = next;
    if (next) {
      target.addEventListener("pointerdown", handlePointerDown);
      target.addEventListener("pointerup", handlePointerRelease);
      target.addEventListener("pointercancel", handlePointerRelease);
      target.addEventListener("lostpointercapture", handlePointerRelease);
      if (keyboardEnabled) {
        // キーボードは要素の焦点に依存せず受けるため window に登録する。
        window.addEventListener("keydown", handleKeyDown);
      }
    } else {
      target.removeEventListener("pointerdown", handlePointerDown);
      target.removeEventListener("pointerup", handlePointerRelease);
      target.removeEventListener("pointercancel", handlePointerRelease);
      target.removeEventListener("lostpointercapture", handlePointerRelease);
      if (keyboardEnabled) {
        window.removeEventListener("keydown", handleKeyDown);
      }
      // 無効化の時点で押下中だった接触を残すと活動接触数が実態とずれるため、捕捉を解放し対応表を空にする。
      for (const pointerId of activePointers) {
        try {
          target.releasePointerCapture(pointerId);
        } catch {
          // 対象外の識別番号では例外になり得る。解放の継続のため無視する。
        }
      }
      activePointers.clear();
    }
  }

  return {
    setActive,
    state() {
      return { activePointerCount: activePointers.size };
    },
    dispose() {
      if (disposed) {
        return;
      }
      setActive(false);
      disposed = true;
      target.style.touchAction = previousTouchAction;
    },
  };
}
