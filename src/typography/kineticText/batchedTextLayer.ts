// 一括文字層。多数の文字を1回の描画命令にまとめる BatchedText を包み、
// フレーズ単位のメンバ群の追加・退場と同時上限を管理する。
// 単一文字層と同じ世代番号の規則で、退場後・再利用後の古い非同期完了通知を無視できるようにする。

import type { BatchedText, Text } from "troika-three-text";

/** 追加したメンバ群の取っ手。isCurrent が偽になったら、その群の非同期完了は無視する。 */
export interface BatchedGroupHandle {
  readonly members: readonly Text[];
  isCurrent(): boolean;
}

export interface BatchedTextLayer {
  /** シーンへ追加する対象（BatchedText 本体）。 */
  readonly object: BatchedText;
  /** メンバ群を追加する。同時メンバ数が上限を超えるなら null。 */
  addGroup(members: Text[]): BatchedGroupHandle | null;
  removeGroup(handle: BatchedGroupHandle): void;
  /** BatchedText の配置を確定する。 */
  sync(callback?: () => void): void;
  activeMemberCount(): number;
  dispose(disposeMember: (member: Text) => void): void;
}

interface Group {
  members: Text[];
  generation: number;
  alive: boolean;
}

export function createBatchedTextLayer(options: {
  maxMembers: number;
  batchedText: BatchedText;
}): BatchedTextLayer {
  const { maxMembers, batchedText } = options;
  const groups: Group[] = [];
  const groupOfHandle = new WeakMap<BatchedGroupHandle, Group>();
  let activeMembers = 0;
  let generationCounter = 0;

  function addGroup(members: Text[]): BatchedGroupHandle | null {
    if (activeMembers + members.length > maxMembers) {
      return null;
    }
    for (const member of members) {
      batchedText.addText(member);
    }
    activeMembers += members.length;
    generationCounter += 1;
    const group: Group = { members, generation: generationCounter, alive: true };
    groups.push(group);
    const capturedGeneration = generationCounter;
    const handle: BatchedGroupHandle = {
      members,
      isCurrent: (): boolean => group.alive && group.generation === capturedGeneration,
    };
    groupOfHandle.set(handle, group);
    return handle;
  }

  function removeGroup(handle: BatchedGroupHandle): void {
    const group = groupOfHandle.get(handle);
    if (!group || !group.alive) {
      return;
    }
    for (const member of group.members) {
      batchedText.removeText(member);
    }
    activeMembers -= group.members.length;
    group.alive = false;
    const index = groups.indexOf(group);
    if (index >= 0) {
      groups.splice(index, 1);
    }
  }

  function sync(callback?: () => void): void {
    batchedText.sync(callback);
  }

  function activeMemberCount(): number {
    return activeMembers;
  }

  function dispose(disposeMember: (member: Text) => void): void {
    for (const group of groups) {
      for (const member of group.members) {
        disposeMember(member);
      }
    }
    groups.length = 0;
    activeMembers = 0;
    batchedText.dispose();
  }

  return { object: batchedText, addGroup, removeGroup, sync, activeMemberCount, dispose };
}
