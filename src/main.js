/**
 * src/main.js
 * マジカルミライ2026プロコン メインエントリーポイント。
 * TextAlive App API を使って課題曲を再生し、歌詞をリアルタイム同期表示する。
 *
 * ライフサイクル:
 *   onAppReady  → createFromSongUrl で曲ロード
 *   onVideoReady → 歌詞 unit に animate 関数を割り当て
 *   onTimerReady → UI を有効化
 *   onTimeUpdate → シークバー・時刻表示を更新
 */

import { Player } from "textalive-app-api";
import { SONGS, findSong } from "./songs.js";
import "./style.css";

// ---- URLクエリから曲キーを取得 ----
const params = new URLSearchParams(location.search);
const songKey = params.get("song") ?? "shutter-chance";
const song = findSong(songKey);

// ---- DOM 参照 ----
const elPhrase     = document.getElementById("lyric-phrase");
const elWord       = document.getElementById("lyric-word");
const elBtnPlay    = document.getElementById("btn-play");
const elSeek       = document.getElementById("seek");
const elTimeDisp   = document.getElementById("time-display");
const elStatus     = document.getElementById("status");
const elLoading    = document.getElementById("loading");
const elLoadingTxt = document.getElementById("loading-text");
const elSongTitle  = document.getElementById("song-title");
const elSongSelect = document.getElementById("song-select");

// ---- 曲選択プルダウンを生成 ----
SONGS.forEach((s) => {
  const opt = document.createElement("option");
  opt.value = s.key;
  opt.textContent = `${s.title} / ${s.artist}`;
  if (s.key === songKey) opt.selected = true;
  elSongSelect.appendChild(opt);
});

elSongSelect.addEventListener("change", () => {
  const url = new URL(location.href);
  url.searchParams.set("song", elSongSelect.value);
  location.href = url.toString();
});

// ---- 曲名表示 ----
elSongTitle.textContent = `${song.title} / ${song.artist}`;

// ---- Player 生成 ----
const player = new Player({
  app: {
    token: import.meta.env.VITE_TEXTALIVE_TOKEN,
  },
  // valenceArousal（感情値）と vocalAmplitude（声量）を有効化
  valenceArousalEnabled: true,
  vocalAmplitudeEnabled: true,
  mediaElement: document.querySelector("#audio-media"),
});

// ---- ユーティリティ: ミリ秒 → MM:SS ----
function formatTime(ms) {
  if (!ms || ms < 0) return "0:00";
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ---- ユーティリティ: ロード中テキストを更新 ----
function setLoading(text) {
  elLoadingTxt.textContent = text;
}

// ---- TextAlive リスナー登録 ----
player.addListener({
  /**
   * onAppReady: TextAlive ホストとの接続確立後に呼ばれる。
   * managed=false の場合は自前でロードする。
   */
  onAppReady(app) {
    if (!app.managed) {
      setLoading(`楽曲をロード中: ${song.title}`);
      player.createFromSongUrl(song.songUrl, { video: song.video });
    }
  },

  /**
   * onVideoReady: 楽曲・歌詞情報のロード完了後に呼ばれる。
   * 各 unit (Phrase/Word/Char) に animate 関数を割り当てる。
   */
  onVideoReady(v) {
    setLoading("歌詞情報を処理中...");

    // フレーズ (Phrase) に animate を割り当て
    let phrase = v.firstPhrase;
    while (phrase) {
      phrase.animate = animatePhrase;
      phrase = phrase.next;
    }

    // 単語 (Word) に animate を割り当て
    let word = v.firstWord;
    while (word) {
      word.animate = animateWord;
      word = word.next;
    }
  },

  /**
   * onTimerReady: 再生タイマーの準備完了。シークバーの最大値を設定してUIを有効化。
   */
  onTimerReady() {
    setLoading("準備完了");
    elSeek.max = player.video.duration;

    // ローディング画面をフェードアウト
    elLoading.classList.add("fade-out");
    setTimeout(() => { elLoading.style.display = "none"; }, 450);

    elBtnPlay.disabled = false;
    elStatus.textContent = "再生ボタンで開始できます";
  },

  /**
   * onTimeUpdate: 再生位置が更新されるたびに呼ばれる（約 player.wait ms 間隔）。
   * シークバーと時刻表示を更新する。
   */
  onTimeUpdate(pos) {
    elSeek.value = pos;
    elTimeDisp.textContent =
      `${formatTime(pos)} / ${formatTime(player.video?.duration)}`;
  },

  /** onPlay: 再生開始 */
  onPlay() {
    elBtnPlay.textContent = "⏸ 一時停止";
    elStatus.textContent = "再生中";
  },

  /** onPause: 一時停止 */
  onPause() {
    elBtnPlay.textContent = "▶ 再生";
    elStatus.textContent = "一時停止中";
  },

  /** onStop: 停止（曲末等） */
  onStop() {
    elBtnPlay.textContent = "▶ 再生";
    elStatus.textContent = "停止";
    elPhrase.textContent = "";
    elPhrase.classList.add("hidden");
    elWord.textContent = "";
  },

  /** ロードエラーハンドリング */
  onAppLoad(_app, error) {
    if (error) {
      elStatus.textContent = `ロードエラー: ${error}`;
      elLoading.style.display = "none";
    }
  },
});

// ---- フレーズの animate 関数 ----
// unit.contains(now) で発声中か判定し、テキストを表示する
function animatePhrase(now, unit) {
  if (unit.contains(now)) {
    elPhrase.textContent = unit.text;
    elPhrase.classList.remove("hidden");
  } else if (unit.endTime < now && unit.next && unit.next.startTime > now) {
    // フレーズとフレーズの間：クリア
    elPhrase.classList.add("hidden");
  }
}

// ---- 単語の animate 関数 ----
function animateWord(now, unit) {
  if (unit.contains(now)) {
    elWord.textContent = unit.text;
  }
}

// ---- 再生/一時停止ボタン ----
elBtnPlay.addEventListener("click", () => {
  if (player.isPlaying) {
    player.requestPause();
  } else {
    player.requestPlay();
  }
});

// ---- シークバー操作 ----
let isSeeking = false;

elSeek.addEventListener("mousedown", () => { isSeeking = true; });
elSeek.addEventListener("touchstart", () => { isSeeking = true; }, { passive: true });

elSeek.addEventListener("input", () => {
  elTimeDisp.textContent =
    `${formatTime(Number(elSeek.value))} / ${formatTime(player.video?.duration)}`;
});

elSeek.addEventListener("change", () => {
  player.requestMediaSeek(Number(elSeek.value));
  isSeeking = false;
});
