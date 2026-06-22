// 同時発音の状態を追跡する純粋ロジック。AudioContext には依存しない（実際の節点はエンジンが別に持つ）。
// 音は「発音中（奪取の対象になる）」と「消音中（最古音消音で停止予約済み、再生終了通知まで接続に残る）」の
// 2状態を持つ。上限は発音中の数に適用し、接続中の数は発音中と消音中の合計とする。
// この分離の理由を述べる。消音中の音を即座にプールから外すと、消音の8ミリ秒のあいだ実際に鳴っている音を
// 接続中の数に数えられず過少報告になるため、再生終了通知が来るまで接続中として保持する。

/** 音の状態。発音中は奪取の対象、消音中は奪取の対象外。 */
export type VoiceState = "sounding" | "muting";

interface VoiceRecord {
  id: number;
  startTime: number;
  state: VoiceState;
}

export interface VoicePool {
  /** 発音中の音を加える。追加順を保つ。 */
  add(id: number, startTime: number): void;
  /** 最も古い発音中の音の識別子を返す。発音中が無ければ null。 */
  oldestSoundingId(): number | null;
  /** 発音中の音を消音中へ移す。発音中でなければ何もしない。 */
  markMuting(id: number): void;
  /** 音をプールから取り除く（再生終了通知で呼ぶ）。 */
  remove(id: number): void;
  /** すべての音の識別子を、加えた順で返す（破棄の走査に使う）。 */
  ids(): number[];
  /** すべての音をプールから取り除いて空にする（破棄で使う）。これにより発音中の数も接続中の数も0になる。 */
  clear(): void;
  /** 発音中の音の数。 */
  readonly soundingCount: number;
  /** 接続中（発音中と消音中の合計）の音の数。 */
  readonly activeCount: number;
}

export function createVoicePool(): VoicePool {
  // 加えた順を保つ配列。最も古い発音中の音は、配列の先頭から最初に見つかる発音中の音とする。
  const records: VoiceRecord[] = [];

  return {
    add(id, startTime) {
      records.push({ id, startTime, state: "sounding" });
    },
    oldestSoundingId() {
      for (const record of records) {
        if (record.state === "sounding") {
          return record.id;
        }
      }
      return null;
    },
    markMuting(id) {
      for (const record of records) {
        if (record.id === id && record.state === "sounding") {
          record.state = "muting";
          return;
        }
      }
    },
    remove(id) {
      const index = records.findIndex((record) => record.id === id);
      if (index >= 0) {
        records.splice(index, 1);
      }
    },
    ids() {
      return records.map((record) => record.id);
    },
    clear() {
      records.length = 0;
    },
    get soundingCount() {
      return records.reduce((count, record) => count + (record.state === "sounding" ? 1 : 0), 0);
    },
    get activeCount() {
      return records.length;
    },
  };
}
