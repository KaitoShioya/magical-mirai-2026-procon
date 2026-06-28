// 演出合成エンジン（Issue #131）の状態管理層。
// 合成結果（ComposedGlyphState）を単位の取っ手へ1回反映し、複製の写しの取っ手を生成・後始末する。
// 純粋な合成器・費用合算と分け、唯一ここが取っ手の操作という副作用を持つ。
// エンジンの取っ手型に依存し three を直接持ち込まない（依存規則 §5）。プール枯渇の検出（isPlaceholderHandle）は
// engine.spawnGlyph を呼ぶ駆動・診断側が担い、確保失敗を spawnCopy の戻り値 null として渡す。

import type { GlyphHandle, DeformingTextHandle } from "./types";
import type { ComposedGlyphState } from "./composedGlyphState";

/** 合成適用層の生成に要る依存。単位の主取っ手と、複製の写しの取っ手を作る関数を渡す。 */
export interface CompositionTargetDeps {
  /** 単位の主取っ手を作る（文字単位は1文字、複数文字単位は複数文字を内包する取っ手）。 */
  spawnPrimary(): GlyphHandle;
  /**
   * 複製の写しの取っ手を作る（演出役の素の単位として生成する）。プール上限超過で確保できないときは
   * null を返す（駆動側が engine の NOOP_HANDLE を isPlaceholderHandle で判定して null へ写す）。
   */
  spawnCopy(): GlyphHandle | null;
}

export interface CompositionTarget {
  /** 合成結果を主取っ手へ1回反映し、複製の写しを計画の写し数へ調整する。 */
  applyComposed(state: ComposedGlyphState): void;
  /** 現在生かしている複製の写しの数（駆動側が実測の複製数として費用合算へ渡せる）。 */
  liveCopyCount(): number;
  /** 主取っ手と全写しを解放する。冪等。 */
  release(): void;
}

function isDeformingHandle(handle: GlyphHandle): handle is DeformingTextHandle {
  return "setDeformParams" in handle;
}

export function createCompositionTarget(deps: CompositionTargetDeps): CompositionTarget {
  const primary = deps.spawnPrimary();
  const copies: GlyphHandle[] = [];
  let released = false;

  // 複製の写しを計画の写し数へ調整する。不足は spawnCopy で確保（確保失敗は数えない）、余剰は release する。
  function reconcileCopyCount(targetCount: number): void {
    while (copies.length > targetCount) {
      const handle = copies.pop();
      handle?.release();
    }
    while (copies.length < targetCount) {
      const handle = deps.spawnCopy();
      if (handle === null) {
        // プール枯渇。これ以上は確保できないため打ち切る（実測の複製数は liveCopyCount が表す）。
        break;
      }
      copies.push(handle);
    }
  }

  function applyComposed(state: ComposedGlyphState): void {
    if (released) return;

    // 変形単位: 主取っ手は変形取っ手。1文字ごとの幾何・複製・可読性補正は持たない（合成器が保証）。
    // 塊全体の配置（位置・大きさ）は、合成器が解決した塊配置を変形取っ手へ反映する（設計書§2.3.4）。
    if (state.deform) {
      reconcileCopyCount(0);
      // 変形は全文1枚として描き1文字ごとの切り抜きを持たない（合成器が変形時に clip を null にする）。
      // 主取っ手は単位の間で使い回すため、前フレームで通常状態として設定した切り抜きが残らないよう解除する。
      primary.clearClip?.();
      const { massScale, massPosition } = state.deform;
      primary.setScale3(massScale.x, massScale.y, massScale.z);
      primary.setPosition(massPosition.x, massPosition.y, massPosition.z);
      primary.setColor(state.color);
      primary.setOpacity(state.opacity);
      if (isDeformingHandle(primary)) {
        primary.setDeformParams(state.deform.params);
      }
      return;
    }

    // 1文字ごとの単位: 幾何を先に反映する。回転は寄与があるときだけ設定する（無ければカメラ正対を保つ）。
    primary.setScale3(state.scale.x, state.scale.y, state.scale.z);
    if (state.rotation) {
      primary.setRotation(state.rotation.x, state.rotation.y, state.rotation.z);
    }
    primary.setPosition(state.position.x, state.position.y, state.position.z);
    if (state.letterSpacing !== null) {
      primary.setLetterSpacing(state.letterSpacing);
    }
    // 切り抜き（部首分解・縦横ブラインド近似）。対応する取っ手だけが反映する（任意メソッド）。
    if (state.clip) {
      primary.setClipRect?.(state.clip.minX, state.clip.minY, state.clip.maxX, state.clip.maxY);
    } else {
      primary.clearClip?.();
    }

    // 読ませる役は applyReadability の後に setColor を呼ぶ（合成色を保ち、縁取り・影は可読性補正から）。
    if (state.readability) {
      primary.applyReadability(state.readability);
    }
    primary.setColor(state.color);
    primary.setOpacity(state.opacity);

    // 複製の写しを反映する。
    const planned = state.duplication ? state.duplication.copies : [];
    reconcileCopyCount(planned.length);
    for (let index = 0; index < copies.length; index += 1) {
      const copyHandle = copies[index];
      const copy = planned[index];
      const copyScale = copy.scale ?? 1;
      copyHandle.setScale3(state.scale.x * copyScale, state.scale.y * copyScale, state.scale.z * copyScale);
      copyHandle.setPosition(
        state.position.x + copy.offset.x,
        state.position.y + copy.offset.y,
        state.position.z + copy.offset.z
      );
      copyHandle.setColor(state.color);
      copyHandle.setOpacity(state.opacity * (copy.opacity ?? 1));
    }
  }

  function liveCopyCount(): number {
    return copies.length;
  }

  function release(): void {
    if (released) return;
    released = true;
    primary.release();
    for (const handle of copies) {
      handle.release();
    }
    copies.length = 0;
  }

  return { applyComposed, liveCopyCount, release };
}
