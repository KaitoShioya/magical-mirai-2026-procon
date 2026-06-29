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
    implemented: true,
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
    implemented: false,
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
    implemented: false,
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

/** キーで曲を引く。見つからなければ既定曲、それも無ければ先頭曲を返す。
 *  題名画面の一覧表示など、実装の有無に依らず曲を引きたい用途に使う。 */
export function findSong(key: string): Song {
  return (
    SONGS.find((s) => s.key === key) ??
    SONGS.find((s) => s.key === DEFAULT_SONG_KEY) ??
    SONGS[0]
  );
}

/** 再生対象として実装済みの曲を解決する。キー（URL引数 song などの外部入力。null も受ける）が存在し
 *  かつ実装済みならその曲を、そうでなければ既定曲（DEFAULT_SONG_KEY の曲）を返す。
 *  findSong と分ける理由を先に述べる。findSong は実装フラグを見ず未実装曲も返すため、未実装曲のキーで
 *  再生を始めると曲プロファイルが無く破綻する。再生対象の解決は本関数を唯一の窓口とし、実装済みのみを返す。
 *  既定曲が実装済みであることは songs.test.ts が保証する。 */
export function resolveImplementedSong(key: string | null): Song {
  const requested = key === null ? undefined : SONGS.find((s) => s.key === key);
  if (requested !== undefined && requested.implemented) {
    return requested;
  }
  return findSong(DEFAULT_SONG_KEY);
}
