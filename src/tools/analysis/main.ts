// 楽曲データ解析ツール（analysis.html の入口）。
// 曲ロード完了後に songMap を構築し window.__songMap へ格納し、document.title を "DUMP_READY" にする。
// これは scripts/dump-songmap.mjs が依存する実行時契約であり、名前・形・タイミングを変えない。
//
// TextAlive linked list の罠: フレーズ内の子は phrase.children / word.children で辿る。
// word.next / char.next はフレーズ境界を越えて曲全体を辿り重複爆発するため使わない。

import { Player, type IPlayerApp } from "textalive-app-api";
import { SONGS, findSong, DEFAULT_SONG_KEY } from "../../config/songs";
import { requireElement } from "../dom";

// ---- URLクエリから曲キーを取得 ----
const params = new URLSearchParams(location.search);
const songKey = params.get("song") ?? DEFAULT_SONG_KEY;
const song = findSong(songKey);

// ---- DOM 参照 ----
const elStatus = requireElement<HTMLElement>("status");
const elOutput = requireElement<HTMLPreElement>("output");
const elDlBtn = requireElement<HTMLButtonElement>("dl-btn");
const elSongSel = requireElement<HTMLSelectElement>("song-select");
const elMedia = requireElement<HTMLAudioElement>("audio-media");

// ---- 曲選択プルダウン生成 ----
for (const s of SONGS) {
  const opt = document.createElement("option");
  opt.value = s.key;
  opt.textContent = `${s.title} / ${s.artist}`;
  if (s.key === songKey) opt.selected = true;
  elSongSel.appendChild(opt);
}

elSongSel.addEventListener("change", () => {
  const url = new URL(location.href);
  url.searchParams.set("song", elSongSel.value);
  location.href = url.toString();
});

// ---- Player 生成 ----
const player = new Player({
  app: { token: import.meta.env.VITE_TEXTALIVE_TOKEN },
  valenceArousalEnabled: true,
  vocalAmplitudeEnabled: true,
  mediaElement: elMedia,
});

function setStatus(text: string): void {
  elStatus.textContent = text;
  console.log("[analyze]", text);
}

player.addListener({
  onAppReady(app: IPlayerApp) {
    if (!app.managed) {
      setStatus(`楽曲ロード中: ${song.title}`);
      player.createFromSongUrl(song.songUrl, { video: song.video });
    }
  },

  onVideoReady() {
    setStatus("歌詞・音楽地図ロード完了。タイマー準備中...");
  },

  onTimerReady() {
    setStatus("タイマー準備完了。songMap を構築中...");
    buildSongMap();
  },

  onAppLoad(_app: IPlayerApp, error?: string) {
    if (error) setStatus(`ロードエラー: ${error}`);
  },
});

/** songMap を構築して window.__songMap に保存し、表示・ダウンロード可能にする */
function buildSongMap(): void {
  const v = player.video;
  const duration = v.duration; // ミリ秒

  // ---- 基本情報 ----
  const songInfo = {
    name: song.title,
    artist: song.artist,
    key: song.key,
    songUrl: song.songUrl,
    duration,
    durationSec: parseFloat((duration / 1000).toFixed(2)),
  };

  // ---- ビートリスト ----
  const beats = player.getBeats().map((b) => ({
    index: b.index,
    position: b.position,
    startTime: b.startTime,
    endTime: b.endTime,
    length: b.length,
    duration: b.duration,
  }));

  // ---- コードリスト ----
  const chords = player.getChords().map((c) => ({
    index: c.index,
    name: c.name,
    startTime: c.startTime,
    endTime: c.endTime,
    duration: c.duration,
  }));

  // ---- 繰り返し区間（サビ） ----
  const segments = player.getChoruses().map((seg) => ({
    index: seg.index,
    startTime: seg.startTime,
    endTime: seg.endTime,
    duration: seg.duration,
    isChorus: true,
  }));

  // ---- フレーズ（歌詞）。children で辿る（next で辿らない） ----
  const phrases: Array<{
    startTime: number;
    endTime: number;
    text: string;
    words: Array<{
      startTime: number;
      endTime: number;
      text: string;
      pos: string;
      chars: Array<{ startTime: number; endTime: number; text: string }>;
    }>;
  }> = [];
  let phrase = v.firstPhrase;
  while (phrase) {
    const words = phrase.children.map((word) => ({
      startTime: word.startTime,
      endTime: word.endTime,
      text: word.text,
      pos: word.pos,
      chars: word.children.map((ch) => ({
        startTime: ch.startTime,
        endTime: ch.endTime,
        text: ch.text,
      })),
    }));
    phrases.push({
      startTime: phrase.startTime,
      endTime: phrase.endTime,
      text: phrase.text,
      words,
    });
    phrase = phrase.next;
  }

  // ---- 最大声量（500ms 刻み） ----
  let maxVocalAmplitude = 0;
  for (let t = 0; t < duration; t += 500) {
    const amp = player.getVocalAmplitude(t);
    if (amp > maxVocalAmplitude) maxVocalAmplitude = amp;
  }

  // ---- 声量カーブ（200ms 刻み） ----
  const amplitudeStep = 200;
  const amplitudeCurve: number[] = [];
  for (let t = 0; t < duration; t += amplitudeStep) {
    amplitudeCurve.push(Math.round(player.getVocalAmplitude(t)));
  }

  // ---- 感情値カーブ（1000ms 刻み） ----
  const vaCurve: Array<{ t: number; v: number; a: number }> = [];
  const vaList: Array<{ v: number; a: number }> = [];
  for (let t = 0; t < duration; t += 1000) {
    const va = player.getValenceArousal(t);
    vaCurve.push({ t, v: +va.v.toFixed(3), a: +va.a.toFixed(3) });
    vaList.push({ v: va.v, a: va.a });
  }

  // ---- 感情値の中央値 ----
  let valenceArousalMedian: { valence: number; arousal: number } | null = null;
  if (vaList.length > 0) {
    const sortedByV = [...vaList].sort((x, y) => x.v - y.v);
    const mid = Math.floor(sortedByV.length / 2);
    valenceArousalMedian = {
      valence: sortedByV[mid].v,
      arousal: sortedByV[mid].a,
    };
  }

  // ---- songMap 組み立て ----
  const songMap = {
    song: songInfo,
    beats,
    chords,
    segments,
    phrases,
    maxVocalAmplitude,
    valenceArousal: { median: valenceArousalMedian },
    amplitudeStep,
    amplitudeCurve,
    vaCurve,
  };

  // グローバル変数に保存（scripts/dump-songmap.mjs が取得する契約）
  window.__songMap = songMap;

  // ---- UI 表示（巨大JSONのDOM描画はフリーズの原因になるため先頭のみプレビュー） ----
  const json = JSON.stringify(songMap, null, 2);
  const PREVIEW_LIMIT = 100_000;
  elOutput.textContent =
    json.length > PREVIEW_LIMIT
      ? json.slice(0, PREVIEW_LIMIT) +
        `\n... (全 ${json.length.toLocaleString()} 文字。全文はダウンロードボタンから)`
      : json;

  setStatus(
    `完了: ${song.title} | ビート数: ${beats.length} | コーラス区間数: ${segments.length} | フレーズ数: ${phrases.length} | 曲長: ${songInfo.durationSec}s`
  );

  // ---- ダウンロードボタンを有効化 ----
  elDlBtn.disabled = false;
  elDlBtn.addEventListener("click", () => {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${song.key}.songmap.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // ---- 完了通知（scripts/dump-songmap.mjs が待機する契約） ----
  document.title = "DUMP_READY";
}
