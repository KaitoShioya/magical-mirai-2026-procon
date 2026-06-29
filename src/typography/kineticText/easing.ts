// イージング基盤（動きの速さの変化を表す関数群）。
// 設計根拠: docs/decisions/visual-expression-design.md 付録A（イージング対応表）。原典は AviUtl の
// UndoFish 版イージング一覧で、「1＝直線、加えて10系統がそれぞれ入り・出・入り出・出入りの4変種を持つ全41番」。
// 系統の順は 正弦・二次・三次・四次・五次・指数・円弧・弾性・戻り・跳ね。各系統の4番は順に入り・出・入り出・出入り。
//
// 入力は動きの進行度 t（0で開始、1で完了）、出力も進行度（0から1へ。行き過ぎ戻りでは一時的に1を超え、または
// 0を下回る）。呼び出し側が t を [0,1] に収めて渡す前提とし、本モジュールは付録A.0.1の数式を逐語で実装する。
// 三次ベジェ曲線で表せない系統（弾性・跳ね・各系統の出入り）も数式で直接実装する（付録A.5の確定方針）。
//
// 依存規則（docs/decisions/architecture.md §5）: 純粋関数のみ。three.js・profiles・tools を取り込まない。

/** 動きの進行度（0から1）を進行度へ写す関数。 */
export type EasingFn = (t: number) => number;

/** 名前で参照できるイージングの一覧（全系統の入り・出・入り出・出入り）。 */
export type EasingName =
  | "linear"
  | "inSine" | "outSine" | "inOutSine" | "outInSine"
  | "inQuad" | "outQuad" | "inOutQuad" | "outInQuad"
  | "inCubic" | "outCubic" | "inOutCubic" | "outInCubic"
  | "inQuart" | "outQuart" | "inOutQuart" | "outInQuart"
  | "inQuint" | "outQuint" | "inOutQuint" | "outInQuint"
  | "inExpo" | "outExpo" | "inOutExpo" | "outInExpo"
  | "inCirc" | "outCirc" | "inOutCirc" | "outInCirc"
  | "inElastic" | "outElastic" | "inOutElastic" | "outInElastic"
  | "inBack" | "outBack" | "inOutBack" | "outInBack"
  | "inBounce" | "outBounce" | "inOutBounce" | "outInBounce";

/** モーションセットの設定が受け取るイージングの指定（番号・名前・関数のいずれか）。 */
export type EasingRef = number | EasingName | EasingFn;

// ---- 直線 ----
export const linear: EasingFn = (t) => t;

// ---- 正弦 ----
export const inSine: EasingFn = (t) => 1 - Math.cos((t * Math.PI) / 2);
export const outSine: EasingFn = (t) => Math.sin((t * Math.PI) / 2);
export const inOutSine: EasingFn = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

// ---- 多項式（二次・三次・四次・五次は次数 n を変えるだけ。n=2,3,4,5）----
/** 入りの多項式。序盤が遅い。 */
export const inPow = (t: number, n: number): number => Math.pow(t, n);
/** 出の多項式。終盤が遅い。charSmash の減衰の再表現に使う（1 - outPow(u,n) = (1-u)^n の恒等式）。 */
export const outPow = (t: number, n: number): number => 1 - Math.pow(1 - t, n);
/** 入り出の多項式。両端が遅い。 */
export const inOutPow = (t: number, n: number): number =>
  t < 0.5 ? Math.pow(2, n - 1) * Math.pow(t, n) : 1 - Math.pow(-2 * t + 2, n) / 2;

const bindPow = (n: number): { in: EasingFn; out: EasingFn; inOut: EasingFn } => ({
  in: (t) => inPow(t, n),
  out: (t) => outPow(t, n),
  inOut: (t) => inOutPow(t, n),
});
const quad = bindPow(2);
const cubic = bindPow(3);
const quart = bindPow(4);
const quint = bindPow(5);

export const inQuad: EasingFn = quad.in;
export const outQuad: EasingFn = quad.out;
export const inOutQuad: EasingFn = quad.inOut;
export const inCubic: EasingFn = cubic.in;
export const outCubic: EasingFn = cubic.out;
export const inOutCubic: EasingFn = cubic.inOut;
export const inQuart: EasingFn = quart.in;
export const outQuart: EasingFn = quart.out;
export const inOutQuart: EasingFn = quart.inOut;
export const inQuint: EasingFn = quint.in;
export const outQuint: EasingFn = quint.out;
export const inOutQuint: EasingFn = quint.inOut;

// ---- 指数 ----
export const inExpo: EasingFn = (t) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10));
export const outExpo: EasingFn = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const inOutExpo: EasingFn = (t) =>
  t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2;

// ---- 円弧 ----
export const inCirc: EasingFn = (t) => 1 - Math.sqrt(1 - t * t);
export const outCirc: EasingFn = (t) => Math.sqrt(1 - (t - 1) * (t - 1));
export const inOutCirc: EasingFn = (t) =>
  t < 0.5
    ? (1 - Math.sqrt(1 - Math.pow(2 * t, 2))) / 2
    : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2;

// ---- 弾性（減衰振動。係数は付録A.0.1のとおり）----
const ELASTIC_C4 = (2 * Math.PI) / 3;
const ELASTIC_C5 = (2 * Math.PI) / 4.5;
export const inElastic: EasingFn = (t) =>
  t === 0 ? 0 : t === 1 ? 1 : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * ELASTIC_C4);
export const outElastic: EasingFn = (t) =>
  t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ELASTIC_C4) + 1;
export const inOutElastic: EasingFn = (t) =>
  t === 0
    ? 0
    : t === 1
      ? 1
      : t < 0.5
        ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * ELASTIC_C5)) / 2
        : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * ELASTIC_C5)) / 2 + 1;

// ---- 戻り（予備動作・行き過ぎ戻り。係数は付録A.0.1のとおり）----
const BACK_C1 = 1.70158;
const BACK_C2 = BACK_C1 * 1.525;
const BACK_C3 = BACK_C1 + 1;
export const inBack: EasingFn = (t) => BACK_C3 * t * t * t - BACK_C1 * t * t;
export const outBack: EasingFn = (t) => 1 + BACK_C3 * Math.pow(t - 1, 3) + BACK_C1 * Math.pow(t - 1, 2);
export const inOutBack: EasingFn = (t) =>
  t < 0.5
    ? (Math.pow(2 * t, 2) * ((BACK_C2 + 1) * 2 * t - BACK_C2)) / 2
    : (Math.pow(2 * t - 2, 2) * ((BACK_C2 + 1) * (t * 2 - 2) + BACK_C2) + 2) / 2;

// ---- 跳ね（複数回の跳ね返り。0以上1以下に収まり1を超えない）----
export const outBounce: EasingFn = (t) => {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
};
export const inBounce: EasingFn = (t) => 1 - outBounce(1 - t);
export const inOutBounce: EasingFn = (t) =>
  t < 0.5 ? (1 - outBounce(1 - 2 * t)) / 2 : (1 + outBounce(2 * t - 1)) / 2;

/**
 * 出入りの変種を作る合成器（任意系統）。前半に出、後半に入りを連結する（付録A.0.1）。
 * outIn(out, inn)(0.5) は構成上ちょうど0.5になる。
 */
export const outIn = (out: EasingFn, inn: EasingFn): EasingFn => (t) =>
  t < 0.5 ? out(2 * t) / 2 : 0.5 + inn(2 * t - 1) / 2;

export const outInSine: EasingFn = outIn(outSine, inSine);
export const outInQuad: EasingFn = outIn(outQuad, inQuad);
export const outInCubic: EasingFn = outIn(outCubic, inCubic);
export const outInQuart: EasingFn = outIn(outQuart, inQuart);
export const outInQuint: EasingFn = outIn(outQuint, inQuint);
export const outInExpo: EasingFn = outIn(outExpo, inExpo);
export const outInCirc: EasingFn = outIn(outCirc, inCirc);
export const outInElastic: EasingFn = outIn(outElastic, inElastic);
export const outInBack: EasingFn = outIn(outBack, inBack);
export const outInBounce: EasingFn = outIn(outBounce, inBounce);

/**
 * 重ね掛け（イージングの合成）。外側のイージングが、内側でイージング済みの進行度を再び変調する g(f(t))。
 * 設計根拠: 付録A.3。入場の減速に退場の加速を重ねると、完全停止する前に次方向への加速が始まる。
 */
export const composeEasing = (outer: EasingFn, inner: EasingFn): EasingFn => (t) => outer(inner(t));

/**
 * 番号 1〜41 から関数を引く表（添字＝番号−1）。
 * 系統の並びは原典どおり 直線・正弦・二次・三次・四次・五次・指数・円弧・弾性・戻り・跳ね、
 * 各系統で 入り・出・入り出・出入り の順（付録A.0）。
 */
const BY_NUMBER: readonly EasingFn[] = [
  linear, // 1
  inSine, outSine, inOutSine, outInSine, // 2-5 正弦
  inQuad, outQuad, inOutQuad, outInQuad, // 6-9 二次
  inCubic, outCubic, inOutCubic, outInCubic, // 10-13 三次
  inQuart, outQuart, inOutQuart, outInQuart, // 14-17 四次
  inQuint, outQuint, inOutQuint, outInQuint, // 18-21 五次
  inExpo, outExpo, inOutExpo, outInExpo, // 22-25 指数
  inCirc, outCirc, inOutCirc, outInCirc, // 26-29 円弧
  inElastic, outElastic, inOutElastic, outInElastic, // 30-33 弾性
  inBack, outBack, inOutBack, outInBack, // 34-37 戻り
  inBounce, outBounce, inOutBounce, outInBounce, // 38-41 跳ね
];

const BY_NAME: Readonly<Record<EasingName, EasingFn>> = {
  linear,
  inSine, outSine, inOutSine, outInSine,
  inQuad, outQuad, inOutQuad, outInQuad,
  inCubic, outCubic, inOutCubic, outInCubic,
  inQuart, outQuart, inOutQuart, outInQuart,
  inQuint, outQuint, inOutQuint, outInQuint,
  inExpo, outExpo, inOutExpo, outInExpo,
  inCirc, outCirc, inOutCirc, outInCirc,
  inElastic, outElastic, inOutElastic, outInElastic,
  inBack, outBack, inOutBack, outInBack,
  inBounce, outBounce, inOutBounce, outInBounce,
};

/** 番号（1〜41）からイージング関数を引く。範囲外は実装の誤りなので例外を投げる。 */
export function easingByNumber(n: number): EasingFn {
  if (!Number.isInteger(n) || n < 1 || n > BY_NUMBER.length) {
    throw new Error(`イージング番号は1から${BY_NUMBER.length}の整数である必要があります（受け取り: ${n}）。`);
  }
  return BY_NUMBER[n - 1];
}

/** 名前からイージング関数を引く。 */
export function easingByName(name: EasingName): EasingFn {
  return BY_NAME[name];
}

/**
 * 指定（番号・名前・関数）を関数へ解決する。モーションセットの生成時に1回だけ呼び、毎フレームの評価では
 * 解決済みの関数を使う（評価のホットパスで確保や分岐を起こさないため）。
 */
export function resolveEasing(ref: EasingRef): EasingFn {
  if (typeof ref === "function") return ref;
  if (typeof ref === "number") return easingByNumber(ref);
  return easingByName(ref);
}
