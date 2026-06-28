// 操作音エンジンの単独受け入れ診断ページ。画面の縦方向（高さ）を7レーンに分割し、タップした高さで
// レーンを選ぶ。どのレーンを叩いても同じ単一の「水滴が弾ける音」を鳴らす（利用者の決定）。
// このページは本番配信（vite build --mode app）には含めない（docs/decisions/architecture.md §7.2）。
// 依存規則に従い rendering・three.js を import しない。表示はブラウザの文書要素だけで行う。

import { createOperationSoundEngine } from "../index";
import { buildOutputGraph } from "../voiceGraph";
import {
  buildDropletVoice,
  OPERATION_LANE_COUNT,
  dropletMaxStopSeconds,
} from "../droplet";
import { SYNTH_POLYPHONY_MAX } from "../synthConstants";
import { PITCH_SLOT_COUNT_DEFAULT } from "../../config/tuning";

// レーン数は操作音のレーン数で決め、判定系共有定数 PITCH_SLOT_COUNT_DEFAULT（値7）と一致することを確かめる。
const LANE_COUNT = OPERATION_LANE_COUNT;
if (LANE_COUNT !== PITCH_SLOT_COUNT_DEFAULT) {
  throw new Error("操作音のレーン数が PITCH_SLOT_COUNT_DEFAULT と一致しない");
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

// タップ面を全画面に置く。7レーンの帯の境界線を引いて、どの高さがどのレーンかを目視できるようにする。
const surface = document.createElement("div");
surface.id = "audio-surface";
surface.style.position = "absolute";
surface.style.inset = "0";
app.appendChild(surface);
for (let i = 1; i < LANE_COUNT; i += 1) {
  const line = document.createElement("div");
  line.style.position = "absolute";
  line.style.left = "0";
  line.style.right = "0";
  // 上端が最も高いレーン、下端が最も低いレーン。
  line.style.top = `${(i / LANE_COUNT) * 100}%`;
  line.style.height = "1px";
  line.style.background = "rgba(159, 251, 208, 0.35)";
  surface.appendChild(line);
}

let lastLane: number | null = null;
let engineEnabled = true;
// 投下中かどうか。真のあいだ、発音が少し大きく・存在感を増す。
let deployActive = false;

function renderHud(): void {
  // 音はどのレーンでも同じ水滴音のため、レーン名は付けず番号だけ表示する。
  const laneText = lastLane === null ? "なし" : `${lastLane}（水滴）`;
  hud.textContent = [
    `状態: ${engine.contextState}`,
    `発音中: ${engine.soundingVoiceCount}`,
    `接続中: ${engine.activeVoiceCount}`,
    `最後のレーン: ${laneText}`,
    `操作音: ${engineEnabled ? "ON" : "OFF"}`,
    `投下: ${deployActive ? "ON" : "OFF"}`,
  ].join("\n");
}

// タップした高さからレーン番号を求める。画面上端が最も高いレーン、下端が最も低いレーン（0）。
function laneFromClientY(clientY: number): number {
  const rect = surface.getBoundingClientRect();
  const normalizedY = (clientY - rect.top) / rect.height;
  const fromBottom = 1 - normalizedY;
  const lane = Math.floor(fromBottom * LANE_COUNT);
  return Math.min(LANE_COUNT - 1, Math.max(0, lane));
}

// 最初の操作で起動し、以後のタップで発音する。unlock は冪等なので毎タップ呼んでも安全。
// 発音は unlock の完了を待ってから行う。理由を先に述べる。初回タップで unlock を待たずに playSlot を呼ぶと、
// AudioContext の起動だけで終わり初回が無音になり得る。完了後に発音すれば初回から鳴る（2回目以降は起動済みで即解決する）。
surface.addEventListener("pointerdown", (event: PointerEvent) => {
  const lane = laneFromClientY(event.clientY);
  lastLane = lane;
  void engine.unlock().then(() => {
    engine.playSlot(lane);
    renderHud();
  });
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

// 多数同時発音を一度に鳴らす（同じ瞬間に重ねる）。レーンを順に使う。
function playMany(count: number): void {
  for (let i = 0; i < count; i += 1) {
    engine.playSlot(i % LANE_COUNT);
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
addButton("較正音", () => {
  void engine.unlock().then(() => renderHud());
  engine.playCalibrationCue();
});
addButton("操作音 OFF/ON", () => {
  engineEnabled = !engineEnabled;
  engine.setEnabled(engineEnabled);
});
addButton("投下 ON/OFF", () => {
  deployActive = !deployActive;
  engine.setDeployTimbre(deployActive);
});

renderHud();
// 接続中の音が減衰で消えると数が変わるため、定期的に表示を更新する。
window.setInterval(renderHud, 200);

// 水滴音の客観測定（オフライン描画）。共有出力グラフ（残響・圧縮・ソフトクリップ込み）を通して鳴らし、
// 単音の最大振幅と二乗平均平方根、多数同時の最大振幅と直流の偏りを測る。音はどのレーンでも同じ水滴音のため、
// レーン別ではなく「単音」と「多数同時」で測る。合否の判定はスモーク側で行い、ここでは測った値を返す。

// 標本化周波数（ヘルツ）。一般的な機器の標本化周波数であり、再現可能な固定値にするため。
const MEASURE_SAMPLE_RATE = 44100;
// 1音の描画長（秒）。水滴音の最長の停止時刻（dropletMaxStopSeconds）に残響（約350ミリ秒）と余裕を足して十分に収まる長さ。
const MEASURE_SECONDS = dropletMaxStopSeconds() + 1;

function peakAbsolute(samples: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const value = Math.abs(samples[i]);
    if (value > peak) {
      peak = value;
    }
  }
  return peak;
}

function rootMeanSquareOf(samples: Float32Array): number {
  if (samples.length === 0) {
    return 0;
  }
  let sumOfSquares = 0;
  for (let i = 0; i < samples.length; i += 1) {
    sumOfSquares += samples[i] * samples[i];
  }
  return Math.sqrt(sumOfSquares / samples.length);
}

// 直流の偏り。レンダー全長の平均の絶対値を最大振幅で割った比。
function dcOffsetRatio(samples: Float32Array): number {
  const peak = peakAbsolute(samples);
  if (peak <= 0) {
    return 0;
  }
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    sum += samples[i];
  }
  return Math.abs(sum / samples.length) / peak;
}

// 水滴音を count 個だけ同時に鳴らしてオフライン描画し、出力の標本列を返す。
// 各音はタップごとの個体差（基音・チャープ・減衰・雑音の種）を持つため、多数同時でも波形は無相関になる。
async function renderDropletsOffline(count: number): Promise<Float32Array> {
  const length = Math.max(1, Math.ceil(MEASURE_SECONDS * MEASURE_SAMPLE_RATE));
  const offline = new OfflineAudioContext(1, length, MEASURE_SAMPLE_RATE);
  const outputs = buildOutputGraph(offline, offline.destination);
  for (let i = 0; i < count; i += 1) {
    buildDropletVoice(offline, outputs, false);
  }
  const buffer = await offline.startRendering();
  return buffer.getChannelData(0);
}

async function audioPercussionStats(): Promise<{
  singlePeak: number | null;
  singleRms: number | null;
  manyPeak: number | null;
  manyDcRatio: number | null;
  error?: string;
}> {
  const empty = { singlePeak: null, singleRms: null, manyPeak: null, manyDcRatio: null };
  try {
    if (typeof OfflineAudioContext === "undefined") {
      return { ...empty, error: "OfflineAudioContext が無い" };
    }
    // 単音（参考: 聞き取りやすさの音量調整の材料）。
    const singleSamples = await renderDropletsOffline(1);
    const singlePeak = peakAbsolute(singleSamples);
    const singleRms = rootMeanSquareOf(singleSamples);
    // 多数同時（同時発音上限ぶん）。重なりの最悪条件。クリップしないこと・直流の偏りが小さいことを測る。
    const manySamples = await renderDropletsOffline(SYNTH_POLYPHONY_MAX);
    const manyPeak = peakAbsolute(manySamples);
    const manyDcRatio = dcOffsetRatio(manySamples);
    return { singlePeak, singleRms, manyPeak, manyDcRatio };
  } catch (error) {
    return { ...empty, error: String(error) };
  }
}

// 検証用アクセサ（ヘッドレススモークが読む）。本番では配信しないページなので window へ直接付ける。
const accessors = window as unknown as {
  __audioState?: () => { contextState: string; sounding: number; active: number };
  __audioPlayMany?: (count: number) => number;
  __audioPercussionStats?: () => Promise<{
    singlePeak: number | null;
    singleRms: number | null;
    manyPeak: number | null;
    manyDcRatio: number | null;
    error?: string;
  }>;
  __audioPlayCalibrationCue?: () => number;
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
// 水滴音の単音・多数同時の測定値を返す（クリップ・直流偏り・単音の大きさの検査に使う）。
accessors.__audioPercussionStats = () => audioPercussionStats();
// 較正音を鳴らし、直後の発音中の数を返す（較正音が操作音の有効・無効に関わらず鳴ることの検査に使う）。
accessors.__audioPlayCalibrationCue = () => {
  engine.playCalibrationCue();
  renderHud();
  return engine.soundingVoiceCount;
};
