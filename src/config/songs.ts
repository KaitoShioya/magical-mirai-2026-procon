// 課題曲6曲のロード設定。
// 値は楽曲ロードの正典 docs/support-page.md の確定情報と照合済みである。
// 読み込みは player.createFromSongUrl(song.songUrl, { video: song.video }) で行う。
// 短縮URL（https://piapro.jp/t/曲ID）は使えない。バージョン番号まで含む完全形を使う。
// 6曲設定の拡張・未実装曲の無効化は Issue #5 で行う。本Issueでは最小の登録に留める。

/** TextAlive の音楽地図（ビート・コード・繰り返し区間・歌詞）を固定するための識別子 */
export interface SongVideo {
  beatId: number;
  chordId: number;
  repetitiveSegmentId: number;
  lyricId: number;
  lyricDiffId: number;
}

/** 課題曲1曲のロード設定 */
export interface Song {
  /** アプリ内部で曲を引くためのキー */
  key: string;
  title: string;
  artist: string;
  /** バージョン番号まで含む完全形の piapro URL */
  songUrl: string;
  video: SongVideo;
  /**
   * 遊べる状態まで実装が済んでいれば true。題名画面はこの値で開始可否を分け、
   * false の曲を「準備中」として無効化する（Issue #5）。6曲すべてが自分の状態を明示するため必須にする。
   * 現状は縦切りで最初に完成させる TAKEOVER のみ true。
   */
  implemented: boolean;
  /** コーラス補正のコメント付きJSONがある場合に true（「こたえて」のみ） */
  hasChorusCorrectionJsonc?: boolean;
}

/** 曲が見つからないときの既定キー。
 *  縦切りで最初に完成させる対象（作品仕様の正典 docs/idea/concept-final.md）に合わせ TAKEOVER とする。 */
export const DEFAULT_SONG_KEY = "takeover";

export const SONGS: readonly Song[] = [
  {
    key: "kotaete",
    title: "こたえて",
    artist: "imie",
    songUrl: "https://piapro.jp/t/6W2N/20251215164617",
    video: {
      beatId: 4827293,
      chordId: 2963754,
      repetitiveSegmentId: 3086261,
      lyricId: 126519,
      lyricDiffId: 28645,
    },
    implemented: false,
    // コーラス補正: https://developer.textalive.jp/events/magicalmirai2026/6W2N_chorus_timings.jsonc
    hasChorusCorrectionJsonc: true,
  },
  {
    key: "after-the-curtain",
    title: "アフター・ザ・カーテン",
    artist: "Rulmry",
    songUrl: "https://piapro.jp/t/zoqO/20251214200738",
    video: {
      beatId: 4827294,
      chordId: 2963755,
      repetitiveSegmentId: 3086262,
      lyricId: 126591,
      lyricDiffId: 28627,
    },
    implemented: true,
  },
  {
    key: "shutter-chance",
    title: "シャッターチャンス",
    artist: "夜未アガリ",
    songUrl: "https://piapro.jp/t/PNpQ/20251209170719",
    video: {
      beatId: 4827295,
      chordId: 2963756,
      repetitiveSegmentId: 3086263,
      lyricId: 126542,
      lyricDiffId: 28628,
    },
    implemented: true,
  },
  {
    key: "sekai-saigo",
    title: "世界最後の音楽隊",
    artist: "夏山よつぎ×ど～ぱみん",
    songUrl: "https://piapro.jp/t/B3yJ/20251215061727",
    video: {
      beatId: 4827296,
      chordId: 2963757,
      repetitiveSegmentId: 3086264,
      lyricId: 126594,
      lyricDiffId: 28629,
    },
    implemented: false,
  },
  {
    key: "toritsuku-logy",
    title: "トリツクロジー",
    artist: "鶴三",
    songUrl: "https://piapro.jp/t/QBdL/20251215094303",
    video: {
      beatId: 4827297,
      chordId: 2963758,
      repetitiveSegmentId: 3086265,
      lyricId: 126593,
      lyricDiffId: 28630,
    },
    implemented: false,
  },
  {
    key: "takeover",
    title: "TAKEOVER",
    artist: "Twinfield",
    songUrl: "https://piapro.jp/t/E2i3/20251215092113",
    video: {
      beatId: 4827298,
      chordId: 2963759,
      repetitiveSegmentId: 3086266,
      lyricId: 126533,
      lyricDiffId: 28631,
    },
    implemented: true,
  },
];

/** キーで曲を引く。見つからなければ既定曲、それも無ければ先頭曲を返す。 */
export function findSong(key: string): Song {
  return (
    SONGS.find((s) => s.key === key) ??
    SONGS.find((s) => s.key === DEFAULT_SONG_KEY) ??
    SONGS[0]
  );
}
