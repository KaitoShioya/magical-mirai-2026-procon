// 題名画面。課題曲6曲を一覧し、実装済み曲だけを開始できる入口（Issue #5）。
// 実装済み曲のボタンを押すとウォームアップへ進む。未実装曲は「準備中」として無効化する。

import type { Screen, ScreenContext, ScreenFactory, SongChoice } from "./types";

export const createTitleScreen: ScreenFactory = (context: ScreenContext): Screen => {
  const element = document.createElement("section");
  element.className = "screen screen--title";
  element.dataset.screen = "title";

  const heading = document.createElement("h1");
  heading.className = "screen__title";
  heading.textContent = "マジカルミライ2026 リリックアプリ";

  const guide = document.createElement("p");
  guide.className = "screen__text";
  guide.textContent = "課題曲を選んではじめる";

  const list = document.createElement("ul");
  list.className = "song-list";
  for (const song of context.songs) {
    list.append(createSongItem(song));
  }

  element.append(heading, guide, list);

  // クリックは一覧へ1つだけ委譲する。無効ボタン（未実装曲）はクリック事象を発火しないため、
  // 実装済み曲のボタンだけがこの委譲に届く。押された要素から最も近い開始ボタンを辿って遷移する。
  const onListClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('[data-action="start"]')) {
      context.requestTransition("warmup");
    }
  };

  return {
    element,
    onEnter(): void {
      list.addEventListener("click", onListClick);
    },
    onUpdate(): void {
      // 題名画面は時間進行を持たない。
    },
    onExit(): void {
      list.removeEventListener("click", onListClick);
    },
  };
};

/** 課題曲1曲ぶんのボタンを作る。実装済みは開始ボタン、未実装は「準備中」の無効ボタン。 */
function createSongItem(song: SongChoice): HTMLLIElement {
  const item = document.createElement("li");
  item.className = "song-list__item";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "screen__button song-choice";
  button.dataset.songKey = song.key;

  const title = document.createElement("span");
  title.className = "song-choice__title";
  title.textContent = song.title;

  const artist = document.createElement("span");
  artist.className = "song-choice__artist";
  artist.textContent = song.artist;

  button.append(title, artist);

  if (song.implemented) {
    // 実装済み曲だけが開始操作を持つ。スモークテストはこの data-action="start" を辿る。
    button.dataset.action = "start";
    // 開始は前進的な操作のため、ひまわりの灯しのオレンジで表す肯定操作とする（押下でソナーの波紋）。
    button.classList.add("ui-button--primary");
  } else {
    // 未実装曲は押せない無効ボタンとし「準備中」を明示する。
    button.disabled = true;
    button.dataset.comingSoon = "true";
    const badge = document.createElement("span");
    badge.className = "song-choice__badge";
    badge.textContent = "準備中";
    button.append(badge);
  }

  item.append(button);
  return item;
}
