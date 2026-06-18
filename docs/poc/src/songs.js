/**
 * src/songs.js
 * 課題曲6曲の定義。
 * songUrl と video オブジェクトは support-page.md から一字一句転記。
 * ロード時は player.createFromSongUrl(song.songUrl, { video: song.video }) で使用。
 */

export const SONGS = [
  {
    key: "kotaete",
    title: "こたえて",
    artist: "imie",
    songUrl: "https://piapro.jp/t/6W2N/20251215164617",
    video: {
      // 音楽地図訂正履歴
      beatId: 4827293,
      chordId: 2963754,
      repetitiveSegmentId: 3086261,

      // 歌詞URL: https://piapro.jp/t/9o24
      // 歌詞タイミング訂正履歴: https://textalive.jp/lyrics/piapro.jp%2Ft%2F6W2N%2F20251215164617
      lyricId: 126519,
      lyricDiffId: 28645,
    },
    // コーラス補正あり: https://developer.textalive.jp/events/magicalmirai2026/6W2N_chorus_timings.jsonc
    hasChorusCorrectionJsonc: true,
  },
  {
    key: "after-the-curtain",
    title: "アフター・ザ・カーテン",
    artist: "Rulmry",
    songUrl: "https://piapro.jp/t/zoqO/20251214200738",
    video: {
      // 音楽地図訂正履歴
      beatId: 4827294,
      chordId: 2963755,
      repetitiveSegmentId: 3086262,

      // 歌詞URL: https://piapro.jp/t/EVO2
      // 歌詞タイミング訂正履歴: https://textalive.jp/lyrics/piapro.jp%2Ft%2FzoqO%2F20251214200738
      lyricId: 126591,
      lyricDiffId: 28627,
    },
  },
  {
    key: "shutter-chance",
    title: "シャッターチャンス",
    artist: "夜未アガリ",
    songUrl: "https://piapro.jp/t/PNpQ/20251209170719",
    video: {
      // 音楽地図訂正履歴
      beatId: 4827295,
      chordId: 2963756,
      repetitiveSegmentId: 3086263,

      // 歌詞URL: https://piapro.jp/t/wyWv
      // 歌詞タイミング訂正履歴: https://textalive.jp/lyrics/piapro.jp%2Ft%2FPNpQ%2F20251209170719
      lyricId: 126542,
      lyricDiffId: 28628,
    },
  },
  {
    key: "sekai-saigo",
    title: "世界最後の音楽隊",
    artist: "夏山よつぎ×ど～ぱみん",
    songUrl: "https://piapro.jp/t/B3yJ/20251215061727",
    video: {
      // 音楽地図訂正履歴
      beatId: 4827296,
      chordId: 2963757,
      repetitiveSegmentId: 3086264,

      // 歌詞URL: https://piapro.jp/t/9U-6
      // 歌詞タイミング訂正履歴: https://textalive.jp/lyrics/piapro.jp%2Ft%2FB3yJ%2F20251215061727
      lyricId: 126594,
      lyricDiffId: 28629,
    },
  },
  {
    key: "toritsuku-logy",
    title: "トリツクロジー",
    artist: "鶴三",
    songUrl: "https://piapro.jp/t/QBdL/20251215094303",
    video: {
      // 音楽地図訂正履歴
      beatId: 4827297,
      chordId: 2963758,
      repetitiveSegmentId: 3086265,

      // 歌詞URL: https://piapro.jp/t/Nixq
      // 歌詞タイミング訂正履歴: https://textalive.jp/lyrics/piapro.jp%2Ft%2FQBdL%2F20251215094303
      lyricId: 126593,
      lyricDiffId: 28630,
    },
  },
  {
    key: "takeover",
    title: "TAKEOVER",
    artist: "Twinfield",
    songUrl: "https://piapro.jp/t/E2i3/20251215092113",
    video: {
      // 音楽地図訂正履歴
      beatId: 4827298,
      chordId: 2963759,
      repetitiveSegmentId: 3086266,

      // 歌詞URL: https://piapro.jp/t/zxWP
      // 歌詞タイミング訂正履歴: https://textalive.jp/lyrics/piapro.jp%2Ft%2FE2i3%2F20251215092113
      lyricId: 126533,
      lyricDiffId: 28631,
    },
  },
];

/** key で曲を引く */
export function findSong(key) {
  return SONGS.find((s) => s.key === key) ?? SONGS.find((s) => s.key === "shutter-chance");
}
