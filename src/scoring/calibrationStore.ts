// 較正補正値の端末内保存（localStorage への読み書き）。較正UI #50 が測った補正値を保存し、本編プレイの結線 #59 が
// 読み出して JudgeOptions.calibrationOffsetMs へ渡す。較正値は判定に渡る scoring ドメインの値であり、scoring の
// 自己最高記録の保存（README）と同じ層に置く。
//
// 配置と依存の理由を先に述べる。scoring は既に src/config/tuning を参照する（defaultWindows.ts が判定窓の定数を読む）。
// 補正値の既定・調整範囲も曲非依存の横断定数として tuning に置いてあるため、本モジュールはそれを読んでクランプに使う。
// profiles・rendering・tools は取り込まない（architecture.md §3 の依存規則）。

import {
  CALIBRATION_OFFSET_DEFAULT_MS,
  CALIBRATION_OFFSET_MIN_MS,
  CALIBRATION_OFFSET_MAX_MS,
} from "../config/tuning";

// localStorage のキー。名前空間の理由を先に述べる。localStorage は同一オリジンで共有されるため、作品固有の
// 接頭辞 "mm2026." で他のデータとの衝突を防ぐ。
export const CALIBRATION_STORAGE_KEY = "mm2026.calibration";

// 保存形式。版を持つ理由を先に述べる。設定・クレジット画面 #77 が将来項目を足す可能性に備え、形式が変わったとき
// 古い値を安全に無視できるよう版番号を添える。
interface CalibrationRecord {
  version: 1;
  offsetMs: number;
}

// 補正値を調整範囲へ収める。旧範囲で保存された値も安全側へ丸めるため、読み出しと保存の両方で通す。
function clamp(offsetMs: number): number {
  if (offsetMs < CALIBRATION_OFFSET_MIN_MS) {
    return CALIBRATION_OFFSET_MIN_MS;
  }
  if (offsetMs > CALIBRATION_OFFSET_MAX_MS) {
    return CALIBRATION_OFFSET_MAX_MS;
  }
  return offsetMs;
}

// 端末内保存の取得。無い環境（サーバ側描画・一部の単体テスト）や、アクセス自体が例外を投げる環境では null を返す。
function getStorage(): Storage | null {
  try {
    if (typeof globalThis.localStorage === "undefined") {
      return null;
    }
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

/**
 * 較正補正値を読み出す（ミリ秒）。保存が無い・壊れている・形式の版が違う・型が数値でない・非有限のいずれでも
 * fallbackMs を返す。読み出し値は調整範囲へクランプする。
 * @param fallbackMs 取得できないときの戻り値。既定は未較正の既定値（0）。
 */
export function loadCalibrationOffsetMs(
  fallbackMs: number = CALIBRATION_OFFSET_DEFAULT_MS
): number {
  const storage = getStorage();
  if (!storage) {
    return fallbackMs;
  }
  let raw: string | null;
  try {
    raw = storage.getItem(CALIBRATION_STORAGE_KEY);
  } catch {
    return fallbackMs;
  }
  if (raw === null) {
    return fallbackMs;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fallbackMs;
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as CalibrationRecord).version !== 1 ||
    typeof (parsed as CalibrationRecord).offsetMs !== "number" ||
    !Number.isFinite((parsed as CalibrationRecord).offsetMs)
  ) {
    return fallbackMs;
  }
  return clamp((parsed as CalibrationRecord).offsetMs);
}

/**
 * 較正補正値を保存する（ミリ秒）。保存前に調整範囲へクランプする。非有限値は保存しない。
 * localStorage が無い・例外を投げる（プライベートモードの容量超過など）ときは握りつぶして false を返す。成功で true。
 */
export function saveCalibrationOffsetMs(offsetMs: number): boolean {
  if (!Number.isFinite(offsetMs)) {
    return false;
  }
  const storage = getStorage();
  if (!storage) {
    return false;
  }
  const record: CalibrationRecord = { version: 1, offsetMs: clamp(offsetMs) };
  try {
    storage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

/** 較正補正値を消す（やり直し用）。例外は握りつぶす。 */
export function clearCalibrationOffset(): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(CALIBRATION_STORAGE_KEY);
  } catch {
    // 消去できない環境でも処理を止めない。
  }
}
