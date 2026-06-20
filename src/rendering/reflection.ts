// 起動時パラメータ refl の解釈（純粋関数）。three.js にもブラウザにも依存しないため、viewport.ts と
// 同様に node 環境の単体テストで決定的に検証できる。本編の入口（src/main.ts）が URL クエリの refl を
// この関数で解釈し、描画基盤（renderRoot）へ反射解像度として渡す。
// 受け入れ基準（Issue #9）: 反射解像度は256と512で可変、refl=0 で無効化できる。

import { DEFAULT_REFLECTION_RESOLUTION, REFLECTION_RESOLUTIONS } from "./constants";

/**
 * 反射解像度を解釈する。
 * 採用理由を先に述べる。技術要件が256と512のみを可変解像度として挙げ、refl=0 を無効と規定するため、
 * 無効化は明示的な数値0に限定し、判別不能な入力は黒画面や過大解像度でなく既定の高品質側へ寄せて事故を防ぐ。
 * 判定は次の順で行う。
 * 1. 未指定（null・undefined）、文字列で空または空白のみは既定値を返す。これを先に落とすのは、refl= の
 *    ような空指定が数値変換で0になり、意図せず無効化されるのを防ぐためである。
 * 2. 数値へ変換して有限の数でない（非数）ものは既定値を返す。
 * 3. 受け付ける値の集合（0・256・512）に含まれる値は、その値を返す（0は無効化を表す）。
 * 4. それ以外の数（負・256/512以外）は既定値を返す。
 * 同名パラメータの重複は、読取層（src/main.ts の URLSearchParams.get）が最初の値を採るため、この関数へは
 * 単一の値が渡る前提である。
 * @param raw URL クエリから読んだ生の値、または数値
 * @returns 反射解像度（0は無効、256または512は有効解像度）
 */
export function resolveReflectionResolution(raw: string | number | null | undefined): number {
  if (raw === null || raw === undefined) {
    return DEFAULT_REFLECTION_RESOLUTION;
  }
  if (typeof raw === "string" && raw.trim() === "") {
    return DEFAULT_REFLECTION_RESOLUTION;
  }
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value)) {
    return DEFAULT_REFLECTION_RESOLUTION;
  }
  if ((REFLECTION_RESOLUTIONS as readonly number[]).includes(value)) {
    return value;
  }
  return DEFAULT_REFLECTION_RESOLUTION;
}
