// 操作音エンジンの単独受け入れ診断ページ。画面の縦方向（Y軸）を7スロットに分割し、タップした高さで
// スロット（＝和音構成音）を選んで発音する。コンセプトのY軸音程に一致し、音程の聞き分けを実演する。
// このページは本番配信（vite build --mode app）には含めない（docs/decisions/architecture.md §7.2）。
// 依存規則に従い rendering・three.js を import しない。表示はブラウザの文書要素だけで行う。

import { createOperationSoundEngine } from "../index";
import { midiToFrequency } from "../pitch";
import { buildOutputGraph, buildVoice } from "../voiceGraph";
import { PITCH_SLOT_COUNT_DEFAULT } from "../../config/tuning";

// 診断専用のサンプル音高（固定値）。docs/research/07 §2.3 のスロット定義「3和音の6音（3和音を2オクターブへ
// 展開した6音）に安全な付加音を1つ加えた7音」に揃える。支配和音ファのナチュラルマイナーの3和音（ファ・ラ♭・ド）
// を2オクターブへ展開した6音と、安全付加音の♭7度（ミ♭）1音。research 07 §1.3 は短調の安全付加音として
// ♭7度と11度を挙げるが、付加音を1音とするため11度（シ♭）は割愛する。
// 全ての基音が300ヘルツを超え、最上音は1キロヘルツを超える。和音名から音高集合への変換と音域配置の本実装は #36。
const SAMPLE_SLOT_PITCHES = [65, 68, 72, 75, 77, 80, 84];
// 和音切替の実演用に、相対的な長調（ラ♭メジャー）の構成音へ切り替えるサンプル。
const SAMPLE_SLOT_PITCHES_ALT = [68, 72, 75, 79, 80, 84, 87];

// スロット数はサンプル配列の長さで決め、判定系共有定数 PITCH_SLOT_COUNT_DEFAULT（値7）と一致することを確かめる。
const SLOT_COUNT = SAMPLE_SLOT_PITCHES.length;
if (SLOT_COUNT !== PITCH_SLOT_COUNT_DEFAULT) {
  throw new Error("診断サンプルのスロット数が PITCH_SLOT_COUNT_DEFAULT と一致しない");
}

function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`診断ページの土台要素 #${id} が見つからない`);
  }
  return element;
}

const app = requireElement("app");
const hud = requireElement("hud");

const engine = createOperationSoundEngine();
let currentPitches = SAMPLE_SLOT_PITCHES;
engine.setSlotPitches(currentPitches);

// タップ面を全画面に置く。7スロットの帯の境界線を引いて、どの高さがどのスロットかを目視できるようにする。
const surface = document.createElement("div");
surface.id = "audio-surface";
surface.style.position = "absolute";
surface.style.inset = "0";
app.appendChild(surface);
for (let i = 1; i < SLOT_COUNT; i += 1) {
  const line = document.createElement("div");
  line.style.position = "absolute";
  line.style.left = "0";
  line.style.right = "0";
  // 上端が最も高いスロット、下端が最も低いスロット。
  line.style.top = `${(i / SLOT_COUNT) * 100}%`;
  line.style.height = "1px";
  line.style.background = "rgba(159, 251, 208, 0.35)";
  surface.appendChild(line);
}

let lastSlot: number | null = null;
let lastFrequencyHz: number | null = null;

function renderHud(): void {
  const slotText = lastSlot === null ? "なし" : String(lastSlot);
  const freqText = lastFrequencyHz === null ? "なし" : `${lastFrequencyHz.toFixed(1)}Hz`;
  hud.textContent = [
    `状態: ${engine.contextState}`,
    `発音中: ${engine.soundingVoiceCount}`,
    `接続中: ${engine.activeVoiceCount}`,
    `最後のスロット: ${slotText}`,
    `最後の周波数: ${freqText}`,
    `操作音: ${engineEnabled ? "ON" : "OFF"}`,
    `投下: ${deployActive ? "ON" : "OFF"}`,
    `和音: ${currentPitches === SAMPLE_SLOT_PITCHES ? "ファのナチュラルマイナー" : "ラ♭メジャー"}`,
  ].join("\n");
}

let engineEnabled = true;
// 投下中かどうか。真のあいだ、発音に倍音層が重なる（明るく聞こえる）。
let deployActive = false;

// タップした高さからスロット番号を求める。画面上端が最も高いスロット、下端が最も低いスロット（0）。
function slotFromClientY(clientY: number): number {
  const rect = surface.getBoundingClientRect();
  const normalizedY = (clientY - rect.top) / rect.height;
  const fromBottom = 1 - normalizedY;
  const slot = Math.floor(fromBottom * SLOT_COUNT);
  return Math.min(SLOT_COUNT - 1, Math.max(0, slot));
}

// 最初の操作で起動し、以後のタップで発音する。unlock は冪等なので毎タップ呼んでも安全。
surface.addEventListener("pointerdown", (event: PointerEvent) => {
  void engine.unlock().then(() => renderHud());
  const slot = slotFromClientY(event.clientY);
  lastSlot = slot;
  const midiNote = currentPitches[slot];
  lastFrequencyHz = midiToFrequency(midiNote);
  engine.playSlot(slot);
  renderHud();
});

// 操作ボタン群。
const controls = requireElement("controls");

function addButton(label: string, onClick: () => void): void {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", () => {
    onClick();
    renderHud();
  });
  controls.appendChild(button);
}

// 多数同時発音を一度に鳴らす（同じ瞬間に重ねる）。スロットの音高を順に使う。
function playMany(count: number): void {
  for (let i = 0; i < count; i += 1) {
    engine.playSlot(i % SLOT_COUNT);
  }
}

addButton("16音同時", () => {
  void engine.unlock().then(() => renderHud());
  playMany(16);
});
addButton("30音同時", () => {
  void engine.unlock().then(() => renderHud());
  playMany(30);
});
addButton("和音切替", () => {
  currentPitches =
    currentPitches === SAMPLE_SLOT_PITCHES ? SAMPLE_SLOT_PITCHES_ALT : SAMPLE_SLOT_PITCHES;
  engine.setSlotPitches(currentPitches);
});
addButton("操作音 OFF/ON", () => {
  engineEnabled = !engineEnabled;
  engine.setEnabled(engineEnabled);
});
// 投下中の音色（倍音層を重ねる）を切り替える。ONのあいだのタップは明るく・厚く聞こえる。
addButton("投下 ON/OFF", () => {
  deployActive = !deployActive;
  engine.setDeployTimbre(deployActive);
});

renderHud();
// 接続中の音が減衰で消えると数が変わるため、定期的に表示を更新する。
window.setInterval(renderHud, 200);

// 明るさ測定（投下時に音色が明るくなることの客観確認）。共有出力グラフを通したオフライン描画から
// 通常時と投下時の周波数重心を求め、投下時が高いことをヘッドレススモークが確認する。
// 数値と理由は実装プラン（判断4）に対応する。

// 標本化周波数（ヘルツ）。一般的な機器の標本化周波数であり、再現可能な固定値にするため。
const MEASURE_SAMPLE_RATE = 44100;
// 測定音高（音高番号）。基本周波数約523ヘルツ・倍音約1046ヘルツとも高域通過300・低域通過4500の通過域に収まる中音域。
const MEASURE_MIDI = 72;
// 測定の固定音量。投下時の倍音込み瞬間最大（0.25×(1+0.35)=0.3375）が圧縮閾値（線形で約0.5）を約0.16の余裕で
// 下回り、動的圧縮を不動作（素通り）に保つ。これにより重心を形作るのは高域通過・低域通過だけになる。
const MEASURE_GAIN = 0.25;
// 解析前のプリロール時間（秒）。圧縮立ち上がり3ミリ秒とフィルター過渡を吸収し、解析区間を定常状態にするため。
const MEASURE_PREROLL_SEC = 0.05;
// 解析窓の長さ（標本数）。2のべき乗で高速フーリエ変換に適し、分解能約10.8ヘルツで基本523と倍音1046を分離できる。
const MEASURE_WINDOW_SIZE = 4096;

// 反復型の基数2高速フーリエ変換（長さは2のべき乗）。re・im を破壊的に変換する。
function fastFourierTransform(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; (j & bit) !== 0; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      const tempRe = re[i];
      re[i] = re[j];
      re[j] = tempRe;
      const tempIm = im[i];
      im[i] = im[j];
      im[j] = tempIm;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const stepRe = Math.cos(angle);
    const stepIm = Math.sin(angle);
    const half = len >> 1;
    for (let start = 0; start < n; start += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < half; k += 1) {
        const evenRe = re[start + k];
        const evenIm = im[start + k];
        const oddSourceRe = re[start + k + half];
        const oddSourceIm = im[start + k + half];
        const oddRe = oddSourceRe * curRe - oddSourceIm * curIm;
        const oddIm = oddSourceRe * curIm + oddSourceIm * curRe;
        re[start + k] = evenRe + oddRe;
        im[start + k] = evenIm + oddIm;
        re[start + k + half] = evenRe - oddRe;
        im[start + k + half] = evenIm - oddIm;
        const nextRe = curRe * stepRe - curIm * stepIm;
        curIm = curRe * stepIm + curIm * stepRe;
        curRe = nextRe;
      }
    }
  }
}

// 解析区間にハン窓を掛けた高速フーリエ変換から周波数重心（ヘルツ）を求める。
function spectralCentroid(samples: Float32Array, start: number, size: number): number {
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let n = 0; n < size; n += 1) {
    // ハン窓: 窓の端の不連続による周波数の漏れを抑え、重心が端で偏らないようにする。
    const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / (size - 1));
    re[n] = samples[start + n] * hann;
  }
  fastFourierTransform(re, im);
  const bins = size >> 1;
  const magnitudes = new Float64Array(bins + 1);
  let maxMagnitude = 0;
  for (let k = 0; k <= bins; k += 1) {
    const magnitude = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
    magnitudes[k] = magnitude;
    if (magnitude > maxMagnitude) {
      maxMagnitude = magnitude;
    }
  }
  // 数値計算の最小値付近の微小な区間が高い周波数へ偽の重みを与えるのを防ぐため、最大振幅の1000分の1未満を除外する。
  const magnitudeFloor = maxMagnitude / 1000;
  let weightedSum = 0;
  let magnitudeSum = 0;
  // 直流（0ヘルツ、添字0）は音高にも明るさにも寄与しないため除外する。
  for (let k = 1; k <= bins; k += 1) {
    const magnitude = magnitudes[k];
    if (magnitude < magnitudeFloor) {
      continue;
    }
    const frequency = (k * MEASURE_SAMPLE_RATE) / size;
    weightedSum += frequency * magnitude;
    magnitudeSum += magnitude;
  }
  return magnitudeSum > 0 ? weightedSum / magnitudeSum : 0;
}

// 倍音の有無で1音をオフライン描画し、定常区間の周波数重心を返す。
async function measureCentroid(withOvertone: boolean): Promise<number> {
  const prerollSamples = Math.ceil(MEASURE_PREROLL_SEC * MEASURE_SAMPLE_RATE);
  const length = prerollSamples + MEASURE_WINDOW_SIZE;
  const offline = new OfflineAudioContext(1, length, MEASURE_SAMPLE_RATE);
  const input = buildOutputGraph(offline, offline.destination);
  const frequencyHz = midiToFrequency(MEASURE_MIDI);
  if (frequencyHz === null) {
    throw new Error("測定音高の周波数が求まらない");
  }
  const voice = buildVoice(offline, input, frequencyHz, withOvertone);
  // 包絡を外して一定音量にする（音色の明るさは定常状態の周波数分布の性質のため）。
  voice.gain.gain.value = MEASURE_GAIN;
  for (const oscillator of voice.oscillators) {
    oscillator.start(0);
  }
  const buffer = await offline.startRendering();
  return spectralCentroid(buffer.getChannelData(0), prerollSamples, MEASURE_WINDOW_SIZE);
}

// 通常時・投下時の周波数重心を返す。仕組みが無い、または失敗した場合は両方 null と説明文を返す。
async function audioBrightness(): Promise<{
  normalCentroid: number | null;
  deployCentroid: number | null;
  error?: string;
}> {
  try {
    if (typeof OfflineAudioContext === "undefined") {
      return { normalCentroid: null, deployCentroid: null, error: "OfflineAudioContext が無い" };
    }
    const normalCentroid = await measureCentroid(false);
    const deployCentroid = await measureCentroid(true);
    return { normalCentroid, deployCentroid };
  } catch (error) {
    return { normalCentroid: null, deployCentroid: null, error: String(error) };
  }
}

// 検証用アクセサ（ヘッドレススモークが読む）。本番では配信しないページなので window へ直接付ける。
const accessors = window as unknown as {
  __audioState?: () => { contextState: string; sounding: number; active: number };
  __audioPlayMany?: (count: number) => number;
  __audioBrightness?: () => Promise<{
    normalCentroid: number | null;
    deployCentroid: number | null;
    error?: string;
  }>;
};
accessors.__audioState = () => ({
  contextState: engine.contextState,
  sounding: engine.soundingVoiceCount,
  active: engine.activeVoiceCount,
});
// 指定数を一度に鳴らし、直後の発音中の数を返す（同時発音上限の検査に使う）。
accessors.__audioPlayMany = (count: number) => {
  playMany(count);
  renderHud();
  return engine.soundingVoiceCount;
};
// 通常時・投下時の周波数重心を返す（投下時に明るく聞こえることの検査に使う）。
accessors.__audioBrightness = () => audioBrightness();
