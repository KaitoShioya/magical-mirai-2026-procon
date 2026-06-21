// タップ総数上限算出（曲非依存の純粋関数。Issue #44）。
// 曲解析データ（拍の開始時刻の並びとサビ区間）から、一回性を成立させる2つの値を決定論的に算出する。
//   - fullPossible: フルに可能なタップの総数（母数）。叩ける音の最大個数の見積もり。
//   - limit: タップ総数上限。1回のプレイで使えるタップの上限。
// 出力は曲プロファイルの tapBudget フィールド（src/profiles/schema/profileSchema.ts の TapBudget）に適合する。
//
// 一回性の定義（採用理由を先に述べる）。1回のプレイで叩ける音を全部は取り切れない上限を設けると、限られたタップを
// どの見せ場へ投下するかという取捨選択が生じ、別の配分を試す動機（反復プレイ）が生まれる。よって本作の一回性とは
// 「タップ総数上限が母数より小さく、全ての見せ場を最適に投下できないこと」を意味する（docs/decisions/app-overall-decisions.md §3.7）。
//
// 母数を音楽地図から算出する理由を先に述べる。tapBudget は母数と上限の2値を持ち、両方がプロファイルに入る。
// データドリブンの原則（CLAUDE.md）は数値を主観で置かず解析から導くことを求める。母数は拍の個数とサビ区間から
// 再現できる（docs/research/07-feasibility-and-parameters.md §2.1）ため、固定値で埋めず算出する。
//
// 密度モデルの範囲（採用理由を先に述べる）。本モジュールの密度は「母数の見積もりに用いる粗いモデル」であり、サビと
// 非サビの2値だけを持つ。§2.1 はフルに可能なタップの総数を、サビ1拍に1回・非サビ2拍に1回の2値で見積もる。一方
// §2.6 が定める密度の谷（休符）・見せ場前の溜め・16分音符の量子化といった細かい配置密度は、実際のノーツ数を母数より
// 少なくする要素であり、譜面密度設計（Issue #43）とノーツ生成（Issue #38）の責務である。本モジュールはそれらを扱わない。
//
// 本モジュールは曲プロファイルJSONへの書き込みを行わない。算出した値を曲プロファイルへ記述するのは Issue #45・#46 の責務である。
//
// 依存方針の理由を先に述べる。本モジュールは曲プロファイルの1フィールドを生成する処理であり、見せ場マップ生成（Issue #41、
// src/profiles/generate/showcases.ts）と責務が同種であるため src/profiles/generate に置く。中核（engine・chart・scoring・
// input・audio）・tools・rendering・three.js は import しない（src/profiles/generate/README.md、architecture.md §5 の依存規則）。

import {
  TAP_LIMIT_RATIO_DEFAULT,
  TAP_LIMIT_RATIO_MIN,
  TAP_LIMIT_RATIO_MAX,
} from "../../config/tuning";
import type { TapBudget } from "../schema/profileSchema";

/** 母数算出と上限算出の入力。音楽地図由来の拍の開始時刻とサビ区間。 */
export interface TapBudgetInput {
  /** 拍の開始時刻のミリ秒。厳密昇順（結果として重複なし）であることを契約とする。 */
  beatsMs: readonly number[];
  /** サビ区間のミリ秒。各区間は開始が終端より小さく有限。並び順と重なりは許容する。 */
  chorusSegments: readonly { startMs: number; endMs: number }[];
}

/** 母数算出と上限算出のオプション。既定値は TAKEOVER の密度設計（§2.6）と比率の既定（§2.2）に一致させる。 */
export interface TapBudgetOptions {
  /** サビの密度（1拍あたりのタップ数）。既定は1拍に1回。 */
  chorusTapsPerBeat?: number;
  /** 非サビの密度（1拍あたりのタップ数）。既定は2拍に1回。 */
  nonChorusTapsPerBeat?: number;
  /** タップ総数上限の比率。既定は TAP_LIMIT_RATIO_DEFAULT。範囲は TAP_LIMIT_RATIO_MIN〜MAX。 */
  limitRatio?: number;
}

/** 母数算出の密度の既定値。サビは1拍に1回（§2.6）。 */
const DEFAULT_CHORUS_TAPS_PER_BEAT = 1.0;
/** 母数算出の密度の既定値。非サビは2拍に1回（§2.6）。 */
const DEFAULT_NON_CHORUS_TAPS_PER_BEAT = 0.5;

/** タップ総数上限算出の入力が契約に反したことを表す例外。黙って契約を崩さず、文脈付きで失敗させる。 */
export class InvalidTapBudgetInputError extends Error {
  constructor(message: string) {
    super(`タップ総数上限算出の入力が不正: ${message}`);
    this.name = "InvalidTapBudgetInputError";
  }
}

/**
 * 各拍が、与えられたいずれかのサビ区間に含まれるかを真偽で判定する。
 * 判定境界は開始を含み終端を含まない半開区間とする。理由を先に述べる。区間の終端は次の区間の開始に接する設計のため、
 * 終端を含めると境界の拍を二重に数える恐れがある。半開区間にすると二重計上を防げる
 * （src/profiles/generate/showcases.takeover.test.ts の判定規約と同一）。
 */
function isBeatInsideAnyChorus(
  beatMs: number,
  chorusSegments: readonly { startMs: number; endMs: number }[],
): boolean {
  return chorusSegments.some((segment) => beatMs >= segment.startMs && beatMs < segment.endMs);
}

/** サビ区間の各区間が有限かつ開始が終端より小さいことを検査する。意味の壊れた区間からは半開区間の判定が成り立たないため。 */
function validateChorusSegments(
  chorusSegments: readonly { startMs: number; endMs: number }[],
): void {
  chorusSegments.forEach((segment, index) => {
    if (!Number.isFinite(segment.startMs) || !Number.isFinite(segment.endMs)) {
      throw new InvalidTapBudgetInputError(
        `サビ区間[${index}]の値が非有限（開始${segment.startMs}、終端${segment.endMs}）`,
      );
    }
    if (segment.startMs >= segment.endMs) {
      throw new InvalidTapBudgetInputError(
        `サビ区間[${index}]の開始が終端以上（開始${segment.startMs}、終端${segment.endMs}）`,
      );
    }
  });
}

/** 拍の配列が空でなく、各値が有限で、厳密昇順（結果として重複なし）であることを検査する。 */
function validateBeats(beatsMs: readonly number[]): void {
  if (beatsMs.length === 0) {
    throw new InvalidTapBudgetInputError("拍の配列が空である");
  }
  for (let i = 0; i < beatsMs.length; i++) {
    const beat = beatsMs[i];
    if (!Number.isFinite(beat)) {
      throw new InvalidTapBudgetInputError(`拍[${i}]の時刻が非有限（${beat}）`);
    }
    if (i > 0 && !(beat > beatsMs[i - 1])) {
      throw new InvalidTapBudgetInputError(
        `拍が厳密昇順でない（拍[${i - 1}]=${beatsMs[i - 1]}、拍[${i}]=${beat}）`,
      );
    }
  }
}

/** 密度が有限の正の値であることを検査する。密度0は母数0を招きスキーマの「母数は正」に反するため許さない。 */
function validateDensity(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new InvalidTapBudgetInputError(`${name}は有限の正の値である必要がある（受け取った値 ${value}）`);
  }
}

/**
 * フルに可能なタップの総数（母数）を、拍の並びとサビ区間から算出する。
 * 各拍がいずれかのサビ区間に入るかを真偽で1回だけ数え、サビの拍数×サビ密度と非サビの拍数×非サビ密度を合計し、
 * 最近接整数へ丸めて返す。理由を先に述べる。母数は叩ける音の個数であり整数でなければならない（スキーマの非負整数検査に
 * 合致させる必要がある）。最近接整数化は見積もりからの差を最小にする。
 * サビ区間が空のときは全ての拍を非サビとして扱う（サビが無い曲では全拍を非サビとして母数を出すのが純関数として自然である）。
 */
export function estimateFullPossibleTaps(input: TapBudgetInput, options?: TapBudgetOptions): number {
  validateBeats(input.beatsMs);
  validateChorusSegments(input.chorusSegments);

  const chorusTapsPerBeat = options?.chorusTapsPerBeat ?? DEFAULT_CHORUS_TAPS_PER_BEAT;
  const nonChorusTapsPerBeat = options?.nonChorusTapsPerBeat ?? DEFAULT_NON_CHORUS_TAPS_PER_BEAT;
  validateDensity(chorusTapsPerBeat, "サビの密度");
  validateDensity(nonChorusTapsPerBeat, "非サビの密度");

  let chorusBeatCount = 0;
  for (const beatMs of input.beatsMs) {
    if (isBeatInsideAnyChorus(beatMs, input.chorusSegments)) chorusBeatCount++;
  }
  const nonChorusBeatCount = input.beatsMs.length - chorusBeatCount;

  const total = chorusBeatCount * chorusTapsPerBeat + nonChorusBeatCount * nonChorusTapsPerBeat;
  const fullPossible = Math.round(total);

  if (fullPossible <= 0) {
    throw new InvalidTapBudgetInputError(`算出した母数が正でない（${fullPossible}）`);
  }
  return fullPossible;
}

/**
 * 母数から、タップ総数上限を算出して TapBudget を返す。
 * 上限 = round(母数 × 比率)。理由を先に述べる。上限は「フルの約6割」という目安への最近接整数が設計意図を最もよく表す。
 * 比率の範囲は TAP_LIMIT_RATIO_MIN〜MAX。理由を先に述べる。比率0.4未満は取捨選択が鋭くなりすぎ「失敗のない床」と矛盾し、
 * 0.8超は取り切れて一回性が薄れる（§2.2）。
 */
export function calculateTapBudget(fullPossible: number, options?: TapBudgetOptions): TapBudget {
  if (!Number.isInteger(fullPossible) || fullPossible <= 0) {
    throw new InvalidTapBudgetInputError(`母数は正の整数である必要がある（受け取った値 ${fullPossible}）`);
  }
  const ratio = options?.limitRatio ?? TAP_LIMIT_RATIO_DEFAULT;
  // 有限数であることを範囲検査より先に確かめる。理由を先に述べる。比較演算は非数（NaN）に対して常に偽を返すため、
  // 有限数ガードがないと NaN が範囲検査をすり抜け、上限が非数になった不正な値を返してしまう。
  if (!Number.isFinite(ratio) || ratio < TAP_LIMIT_RATIO_MIN || ratio > TAP_LIMIT_RATIO_MAX) {
    throw new InvalidTapBudgetInputError(
      `比率は${TAP_LIMIT_RATIO_MIN}〜${TAP_LIMIT_RATIO_MAX}の有限数である必要がある（受け取った値 ${ratio}）`,
    );
  }

  const limit = Math.round(fullPossible * ratio);

  // 事後検証。理由を先に述べる。母数の丸めと上限の丸めが重なると、母数が小さい曲では比率が境界をわずかに外れることがある。
  // 黙って範囲外の値を返さないため、ここで上限と母数の比率を検査し、外れる場合は失敗させる。
  const resultRatio = limit / fullPossible;
  if (resultRatio < TAP_LIMIT_RATIO_MIN || resultRatio > TAP_LIMIT_RATIO_MAX) {
    throw new InvalidTapBudgetInputError(
      `算出した上限の比率が範囲外（母数${fullPossible}、上限${limit}、比率${resultRatio}）`,
    );
  }
  return { fullPossible, limit };
}

/**
 * 曲解析データから tapBudget（母数と上限）を算出する。estimateFullPossibleTaps と calculateTapBudget の合成。
 * Issue #45・#46 はこの関数1つで曲の tapBudget を得る。
 */
export function generateTapBudget(input: TapBudgetInput, options?: TapBudgetOptions): TapBudget {
  const fullPossible = estimateFullPossibleTaps(input, options);
  return calculateTapBudget(fullPossible, options);
}
