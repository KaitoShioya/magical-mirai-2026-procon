// 操作音のON/OFFの端末内保存（Issue #77）。設定画面が読み書きし、統括が起動時に操作音エンジンへ反映する。
// 較正補正値の保存（src/scoring/calibrationStore.ts）と同じ「安全側へ倒れる読出・例外を握りつぶす保存」の様式に倣う。
// 純粋に localStorage だけを扱い、描画・音・曲データへは依存しない。

// localStorage のキー。名前空間の理由を先に述べる。localStorage は同一オリジンで共有されるため、作品固有の
// 接頭辞 "mm2026." で他のデータとの衝突を防ぐ。
export const SOUND_PREFERENCE_KEY = "mm2026.soundEnabled";

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
 * 操作音を鳴らすか。記録が無い・読めない・値が想定外のいずれでも既定で鳴らす（true）。
 * 既定を true にする理由を先に述べる。初回は作品の手応え（水滴音）を既定で味わえるようにするためである。
 * 保存値は "true" / "false" の文字列で持ち、"false" のときだけ鳴らさない。
 */
export function loadSoundEnabled(): boolean {
  const storage = getStorage();
  if (!storage) {
    return true;
  }
  let raw: string | null;
  try {
    raw = storage.getItem(SOUND_PREFERENCE_KEY);
  } catch {
    return true;
  }
  return raw !== "false";
}

/**
 * 操作音のON/OFFを保存する。localStorage が無い・例外を投げる（プライベートモードの容量超過など）ときは
 * 握りつぶして何もしない。
 */
export function saveSoundEnabled(enabled: boolean): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(SOUND_PREFERENCE_KEY, enabled ? "true" : "false");
  } catch {
    // 保存できない環境でも処理を止めない。
  }
}
