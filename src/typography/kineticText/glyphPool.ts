// 単一文字層の再利用プール。生成済みの文字単位を使い回し、生成と破棄の繰り返しを避ける。
// 世代番号で、解放後・再利用後の古い非同期完了通知を無視できるようにする
// （troika の sync は非同期で、再利用した文字物体が前の文字を一瞬表示する事故と、
//  解放後の完了通知で古い要求が復活する事故を防ぐため）。

/** 取得した文字単位の貸し出し。isCurrent が偽になったら、その取っ手の非同期完了は無視する。 */
export interface GlyphLease<U> {
  readonly unit: U;
  /** この取っ手がまだ現役（解放も再利用もされていない）なら真。 */
  isCurrent(): boolean;
}

export interface GlyphPool<U> {
  /** 文字単位を1つ取得する。同時上限に達していて空きが無ければ null。 */
  acquire(): GlyphLease<U> | null;
  /** 取得を解放してプールへ返す。現役でない取っ手の解放は無視する。 */
  release(lease: GlyphLease<U>): void;
  activeCount(): number;
  pooledCount(): number;
  disposeAll(disposeUnit: (unit: U) => void): void;
}

interface Slot<U> {
  unit: U;
  generation: number;
  active: boolean;
}

export function createGlyphPool<U>(options: {
  maxConcurrent: number;
  textFactory: () => U;
}): GlyphPool<U> {
  const { maxConcurrent, textFactory } = options;
  const slots: Array<Slot<U>> = [];
  const free: Array<Slot<U>> = [];
  const slotOfLease = new WeakMap<GlyphLease<U>, Slot<U>>();

  function acquire(): GlyphLease<U> | null {
    let slot = free.pop();
    if (!slot) {
      if (slots.length >= maxConcurrent) {
        return null;
      }
      slot = { unit: textFactory(), generation: 0, active: false };
      slots.push(slot);
    }
    slot.generation += 1;
    slot.active = true;
    const capturedSlot = slot;
    const capturedGeneration = slot.generation;
    const lease: GlyphLease<U> = {
      unit: slot.unit,
      isCurrent: (): boolean =>
        capturedSlot.active && capturedSlot.generation === capturedGeneration,
    };
    slotOfLease.set(lease, slot);
    return lease;
  }

  function release(lease: GlyphLease<U>): void {
    const slot = slotOfLease.get(lease);
    if (!slot) {
      return;
    }
    // 現役でない（既に解放済み、または別取得へ再利用済み）なら何もしない。
    if (!lease.isCurrent()) {
      return;
    }
    slot.active = false;
    free.push(slot);
  }

  function activeCount(): number {
    let count = 0;
    for (const slot of slots) {
      if (slot.active) {
        count += 1;
      }
    }
    return count;
  }

  function pooledCount(): number {
    return free.length;
  }

  function disposeAll(disposeUnit: (unit: U) => void): void {
    for (const slot of slots) {
      disposeUnit(slot.unit);
    }
    slots.length = 0;
    free.length = 0;
  }

  return { acquire, release, activeCount, pooledCount, disposeAll };
}
