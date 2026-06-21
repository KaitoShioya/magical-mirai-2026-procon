// 操作音エンジンの単独受け入れ診断ページ。画面の縦方向（Y軸）を7スロットに分割し、タップした高さで
// スロット（＝和音構成音）を選んで発音する。コンセプトのY軸音程に一致し、音程の聞き分けを実演する。
// このページは本番配信（vite build --mode app）には含めない（docs/decisions/architecture.md §7.2）。
// 依存規則に従い rendering・three.js を import しない。表示はブラウザの文書要素だけで行う。

import { createOperationSoundEngine } from "../index";
import { midiToFrequency } from "../pitch";
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
    `和音: ${currentPitches === SAMPLE_SLOT_PITCHES ? "ファのナチュラルマイナー" : "ラ♭メジャー"}`,
  ].join("\n");
}

let engineEnabled = true;

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

renderHud();
// 接続中の音が減衰で消えると数が変わるため、定期的に表示を更新する。
window.setInterval(renderHud, 200);

// 検証用アクセサ（ヘッドレススモークが読む）。本番では配信しないページなので window へ直接付ける。
const accessors = window as unknown as {
  __audioState?: () => { contextState: string; sounding: number; active: number };
  __audioPlayMany?: (count: number) => number;
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
