/**
 * src/analyze.js
 * 楽曲データダンプツール (analysis.html 用)。
 * 曲ロード完了後に songMap をJSON化し、window.__songMap に格納する。
 * document.title = "DUMP_READY" で完了を通知する（Playwright 等で待機可能）。
 *
 * 取得データ:
 *   song: 基本情報(name/artist/duration)
 *   beats: ビートリスト [{index, position, startTime, endTime, length}]
 *   chords: コードリスト [{index, name, startTime, endTime}]
 *   segments: repetitiveSegments [{index, startTime, endTime, duration, isChorus}]
 *   phrases: 全フレーズ [{startTime, endTime, text, words:[...]}]
 *   maxVocalAmplitude: 最大声量
 *   valenceArousal: {median} 中央値
 *
 * API メモ:
 *   - beats は player.getBeats() で取得 (IBeat: position, length, index, startTime, endTime, duration)
 *   - chords は player.getChords() で取得 (IChord: name, index, startTime, endTime, duration)
 *   - サビ区間は player.getChoruses() で取得 (IRepetitiveSegment[])
 *   - 全繰り返し区間は player.findChorus 等でも検索可能
 *   - IRepetitiveSegments には chorus: boolean と segments: IRepetitiveSegment[] が含まれる
 */

import { Player } from "textalive-app-api";
import { SONGS, findSong } from "./songs.js";

// ---- URLクエリから曲キーを取得 ----
const params = new URLSearchParams(location.search);
const songKey = params.get("song") ?? "shutter-chance";
const song = findSong(songKey);

// ---- DOM 参照 ----
const elStatus  = document.getElementById("status");
const elOutput  = document.getElementById("output");
const elDlBtn   = document.getElementById("dl-btn");
const elSongSel = document.getElementById("song-select");

// ---- 曲選択プルダウン生成 ----
SONGS.forEach((s) => {
  const opt = document.createElement("option");
  opt.value = s.key;
  opt.textContent = `${s.title} / ${s.artist}`;
  if (s.key === songKey) opt.selected = true;
  elSongSel.appendChild(opt);
});

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
  mediaElement: document.querySelector("#audio-media"),
});

function setStatus(text) {
  elStatus.textContent = text;
  console.log("[analyze]", text);
}

player.addListener({
  onAppReady(app) {
    if (!app.managed) {
      setStatus(`楽曲ロード中: ${song.title}`);
      player.createFromSongUrl(song.songUrl, { video: song.video });
    }
  },

  onVideoReady(_v) {
    setStatus("歌詞・音楽地図ロード完了。タイマー準備中...");
  },

  onTimerReady() {
    setStatus("タイマー準備完了。songMap を構築中...");
    buildSongMap();
  },

  onAppLoad(_app, error) {
    if (error) setStatus(`ロードエラー: ${error}`);
  },
});

/** songMap を構築して window.__songMap に保存し、表示・ダウンロード可能にする */
function buildSongMap() {
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

  // ---- ビートリスト (player.getBeats()) ----
  const beats = player.getBeats().map((b) => ({
    index: b.index,
    position: b.position,   // 小節中のビート位置
    startTime: b.startTime,
    endTime: b.endTime,
    length: b.length,       // 小節中のビート数
    duration: b.duration,
  }));

  // ---- コードリスト (player.getChords()) ----
  const chords = player.getChords().map((c) => ({
    index: c.index,
    name: c.name,
    startTime: c.startTime,
    endTime: c.endTime,
    duration: c.duration,
  }));

  // ---- repetitiveSegments: サビ区間 (player.getChoruses()) ----
  // getChoruses() は IRepetitiveSegment[] を返す
  const choruses = player.getChoruses();
  const segments = choruses.map((seg, i) => ({
    index: seg.index ?? i,
    startTime: seg.startTime,
    endTime: seg.endTime,
    duration: seg.duration,
    isChorus: true,
  }));

  // ---- フレーズ（歌詞）----
  // 注意: word.next / char.next はフレーズ境界を越えて曲全体を辿るため、
  // 親の children 配列で辿る（next で辿ると全フレーズに後続全単語が重複して入る）
  const phrases = [];
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

  // ---- 声量サンプリング（500ms 刻みで最大声量を求める） ----
  let maxVocalAmplitude = 0;
  const step = 500;
  for (let t = 0; t < duration; t += step) {
    const amp = player.getVocalAmplitude(t);
    if (amp > maxVocalAmplitude) maxVocalAmplitude = amp;
  }

  // ---- 声量カーブ（200ms刻み。ボルテージ解析＝見せ場マップ算出用） ----
  const amplitudeStep = 200;
  const amplitudeCurve = [];
  for (let t = 0; t < duration; t += amplitudeStep) {
    amplitudeCurve.push(Math.round(player.getVocalAmplitude(t)));
  }

  // ---- 感情値カーブ（1000ms刻み） ----
  const vaCurve = [];
  for (let t = 0; t < duration; t += 1000) {
    const va = player.getValenceArousal(t);
    vaCurve.push(va ? { t, v: +va.v.toFixed(3), a: +va.a.toFixed(3) } : { t, v: null, a: null });
  }

  // ---- 感情値サンプリング（1000ms 刻りで中央値を計算） ----
  const vaList = [];
  for (let t = 0; t < duration; t += 1000) {
    const va = player.getValenceArousal(t);
    if (va) vaList.push(va);
  }
  let valenceArousalMedian = null;
  if (vaList.length > 0) {
    // ValenceArousalValue は { v: valence, a: arousal } 形状
    const sortedByV = [...vaList].sort((a, b) => a.v - b.v);
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

  // グローバル変数に保存（Playwright 等から取得可能）
  window.__songMap = songMap;

  // ---- UI に表示（巨大JSONのDOM描画はフリーズの原因になるため先頭のみプレビュー） ----
  const json = JSON.stringify(songMap, null, 2);
  const PREVIEW_LIMIT = 100_000;
  elOutput.textContent =
    json.length > PREVIEW_LIMIT
      ? json.slice(0, PREVIEW_LIMIT) +
        `\n... (全 ${json.length.toLocaleString()} 文字。全文はダウンロードボタンから)`
      : json;

  // ---- サマリー表示 ----
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

  // ---- Playwright 等の完了通知 ----
  document.title = "DUMP_READY";
}
