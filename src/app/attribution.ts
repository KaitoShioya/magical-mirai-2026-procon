// 初音ミクの出典（ピアプロ・キャラクター・ライセンス）をアプリ内へ常時表示するバッジ（Issue #64）。
// 画面状態ではないため src/screens に置かず、状態機械が置換する画面表示領域の影響を受けないよう document.body 直下に置く。
// 統括（src/app）が起動時に取り付け、後始末で取り除く。読み込みの成否に依らず常時表示する理由を先に述べる。
// 正典（docs/research/05-asset-procurement.md §5）が指定文言の常設を求め、Issue本文も常時表示を求めるため。
// 包括的なクレジット区画は後続Issue（#77・#82）が用意し、本バッジを統合する。

import type { CharacterCredit } from "../types/character";

export interface AttributionBadge {
  /** 後始末。生成した表示要素を取り除く。 */
  dispose(): void;
}

/**
 * 出典バッジを生成して host（既定は document.body）へ取り付ける。
 * 必須4要素（描いた旨・権利者の社名・ライセンス名とアドレス・ガイドライン遵守の旨）を表示する。
 */
export function createAttributionBadge(
  credit: CharacterCredit,
  host: HTMLElement = document.body
): AttributionBadge {
  const badge = document.createElement("div");
  badge.className = "attribution";

  const subject = document.createElement("span");
  subject.className = "attribution__text";
  subject.textContent = credit.subject;

  const rightsHolder = document.createElement("span");
  rightsHolder.className = "attribution__text";
  rightsHolder.textContent = credit.rightsHolder;

  // ライセンスのアドレスは、外部から参照できるよう新しいタブで開く安全なリンクにする。
  const license = document.createElement("a");
  license.className = "attribution__link";
  license.href = credit.licenseUrl;
  license.target = "_blank";
  license.rel = "noopener noreferrer";
  license.textContent = credit.licenseName;

  const guideline = document.createElement("span");
  guideline.className = "attribution__text";
  guideline.textContent = credit.guidelineNote;

  badge.append(subject, " ", rightsHolder, " ", license, " ", guideline);
  host.append(badge);

  return {
    dispose(): void {
      badge.remove();
    },
  };
}
