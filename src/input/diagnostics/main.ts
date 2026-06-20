// 入力サブシステムの単独診断ページ。入力面を全画面に置き、押下を可視化し、検証用アクセサを公開する。
// このページは本番配信（vite build --mode app）には含めない（docs/decisions/architecture.md §7.2）。
// 依存規則に従い rendering・three.js を import しない。描画はブラウザの文書要素だけで行う。

import { createInput, type Reaction } from "../index";

function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`診断ページの土台要素 #${id} が見つからない`);
  }
  return element;
}

const app = requireElement("app");
const hud = requireElement("hud");

// 入力面要素を全画面に置く。スロットの帯の境界とX方向の色勾配を背景に描いて目視確認できるようにする。
const surface = document.createElement("div");
surface.id = "input-surface";
surface.style.position = "absolute";
surface.style.inset = "0";
surface.style.background = "linear-gradient(to right, hsl(0 70% 18%), hsl(120 70% 18%), hsl(240 70% 18%))";
app.appendChild(surface);

const SLOT_COUNT = 7;

// 帯の境界線を薄く引く。
for (let i = 1; i < SLOT_COUNT; i += 1) {
  const line = document.createElement("div");
  line.style.position = "absolute";
  line.style.left = "0";
  line.style.right = "0";
  line.style.top = `${(i / SLOT_COUNT) * 100}%`;
  line.style.height = "1px";
  line.style.background = "rgba(159, 251, 208, 0.35)";
  surface.appendChild(line);
}

const reactions: Reaction[] = [];

function paintMark(reaction: Reaction): void {
  const rect = surface.getBoundingClientRect();
  const mark = document.createElement("div");
  mark.style.position = "absolute";
  mark.style.left = `${reaction.normalizedX * rect.width}px`;
  mark.style.top = `${reaction.normalizedY * rect.height}px`;
  mark.style.width = "16px";
  mark.style.height = "16px";
  mark.style.marginLeft = "-8px";
  mark.style.marginTop = "-8px";
  mark.style.borderRadius = "50%";
  mark.style.border = "2px solid #9ffbd0";
  mark.style.background = `hsl(${reaction.colorX01 * 360} 80% 55% / 0.6)`;
  mark.style.pointerEvents = "none";
  surface.appendChild(mark);
  // 印は一定時間で消す。残り続けると画面が埋まるため。
  window.setTimeout(() => mark.remove(), 1200);
}

function updateHud(): void {
  const state = input.state();
  const last = reactions[reactions.length - 1];
  hud.textContent = [
    `reactions: ${reactions.length}`,
    `activePointers: ${state.activePointerCount}`,
    `keyboardX: ${state.keyboardColorX01.toFixed(2)}`,
    last
      ? `last: ${last.source} slot=${last.slotIndex} colorX=${last.colorX01.toFixed(2)}`
      : "last: -",
  ].join("\n");
}

const input = createInput({
  target: surface,
  slotCount: SLOT_COUNT,
  onReaction(reaction) {
    reactions.push(reaction);
    paintMark(reaction);
    updateHud();
  },
});
input.setActive(true);
updateHud();

// 検証用アクセサを公開する。入力源は素の文字列で返す。
window.__inputReactions = () => reactions.slice();
window.__inputState = () => {
  const state = input.state();
  return {
    activePointerCount: state.activePointerCount,
    keyboardColorX01: state.keyboardColorX01,
    touchAction: getComputedStyle(surface).touchAction,
  };
};

// ページ破棄時に後始末し、公開したアクセサを削除する。
window.addEventListener("beforeunload", () => {
  input.dispose();
  delete window.__inputReactions;
  delete window.__inputState;
});
