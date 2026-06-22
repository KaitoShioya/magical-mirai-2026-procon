// 反応強度の純粋関数（Issue #51）。タップ判定の結果を、光点（蝶・ひまわり）の大きさと明るさを駆動する
// 0以上1以下の強度の組に写す。採用する形の根拠を先に述べる。
// 出典 docs/idea/concept-final.md §6 が「タイミング精度→大きさ、音程精度→輝度」と定めるため、出力は大きさと明るさの
// 2要素を持ち、それぞれが別の精度だけに依存する（2チャンネル独立）。スコアへ寄与する単一の総合値は本モジュールの対象外で、
// Issue #55・#56 が timingAccuracy・pitchAccuracy・各JUSTを直接消費する（src/scoring/types.ts の JudgmentResult 注釈）。
// 写像は恒等（精度をそのまま駆動値とする）にする。理由を述べる。受け入れ基準「精度が高いほど光点が大きく明るい」を最も素直に
// 満たす単調増加であり、本モジュールが新しい閾値や係数を持ち込まない。光点が完全消失しない可視下限と実際の表示範囲は描画層の
// 写像（src/rendering/entities/butterflyReactionMapping.ts の reactionToScale・reactionToBrightness）が与えるため、
// 可視下限の定義を描画層に一元化でき、本モジュールと描画層で値が二重化しない。
// 依存規則（docs/decisions/architecture.md §5、src/scoring/README.md）に従い profiles・rendering・tools・three.js を取り込まない。

import type { JudgmentResult } from "./types";

/**
 * 光点の見た目を駆動する反応強度。
 * size・brightness はいずれも0以上1以下の強度であり、描画層が用いる実寸の大きさ・輝度の値ではない。
 * 描画層の reactionToScale・reactionToBrightness がこの強度を実際の表示範囲へ変換する。
 * 強度と実寸を同じ語で扱うと、変換後の実寸と混同して結線時に二重変換などの誤りを生むため、語の役割をここで分離する。
 * 表示範囲の具体的な最小値・最大値は描画層の定数（src/rendering/constants.ts）が単一の所有元であり、本ファイルには複製しない。
 */
export interface ReactionStrength {
  /** 光点の大きさを駆動する0以上1以下の強度。タイミング精度由来。 */
  size: number;
  /** 光点の明るさを駆動する0以上1以下の強度。音程精度由来。 */
  brightness: number;
}

/**
 * 値を0以上1以下の強度へ収める。非有限値の防御と範囲外値の丸めを1つにまとめる。
 * 非有限値で0を返す根拠を先に述べる。既存 timingAccuracy が非有限値で0を返すのと同じ規約に合わせ、失敗のない床の方針
 * （判定を止めない。出典 docs/idea/concept-final.md §4）を保つ。下流 butterflyReactionMapping は非有限値で例外を投げるため、
 * ここで0へ倒すことで有限値だけが下流へ流れ、例外を未然に防ぐ。
 */
function clampUnitInterval(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value <= 0) {
    return 0;
  }
  return value >= 1 ? 1 : value;
}

/**
 * 判定結果から反応強度（大きさ・明るさを駆動する0以上1以下の強度の組）を返す。
 * タイミング精度を大きさへ、音程精度を明るさへ、丸めと非有限値の防御のみ施してそのまま写す。
 * 入力に JudgmentResult 全体を受け取る理由を述べる。判定の単一の出力型を素直に消費でき、将来 isFloor 等の参照が必要に
 * なっても呼び出し側の契約を変えずに済む。
 */
export function reactionStrength(judgment: JudgmentResult): ReactionStrength {
  return {
    size: clampUnitInterval(judgment.timingAccuracy),
    brightness: clampUnitInterval(judgment.pitchAccuracy),
  };
}
