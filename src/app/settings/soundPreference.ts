// 音量（楽曲と操作音のマスター音量）の端末内保存（Issue #77）。設定画面が読み書きし、統括が起動時に楽曲再生と
// 操作音エンジンの両方へ反映する。較正補正値の保存（src/scoring/calibrationStore.ts）と同じ「安全側へ倒れる読出・
// 例外を握りつぶす保存」の様式に倣う。純粋に localStorage だけを扱い、描画・音・曲データへは依存しない。
//
// 音量は0以上100以下の整数で保持する（0で無音、100で最大）。0にできることで規約が求める効果音のOFFを満たす。

// localStorage のキー。名前空間の理由を先に述べる。localStorage は同一オリジンで共有されるため、作品固有の
// 接頭辞 "mm2026." で他のデータとの衝突を防ぐ。
export const SOUND_VOLUME_KEY = "mm2026.soundVolume";

// 既定の音量。半分（50）にする理由を先に述べる。初回は楽曲と操作音の双方を心地よく聴ける中間の音量で始め、
// 大きすぎる音で驚かせないようにする。利用者は設定でいつでも上げ下げできる。
export const SOUND_VOLUME_DEFAULT = 50;

// 音量を0以上100以下へ収める。保存・読出の両方で通し、範囲外の値を安全側へ丸める。
function clampVolume(volume: number): number {
  if (volume < 0) {
    return 0;
  }
  return volume > 100 ? 100 : volume;
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
 * 操作音の音量（0以上100以下の整数）を読み出す。記録が無い・読めない・値が数値でない・非有限のいずれでも既定（半分の50）。
 * 読み出した値は0以上100以下へ丸める。
 */
export function loadSoundVolume(): number {
  const storage = getStorage();
  if (!storage) {
    return SOUND_VOLUME_DEFAULT;
  }
  let raw: string | null;
  try {
    raw = storage.getItem(SOUND_VOLUME_KEY);
  } catch {
    return SOUND_VOLUME_DEFAULT;
  }
  if (raw === null) {
    return SOUND_VOLUME_DEFAULT;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return SOUND_VOLUME_DEFAULT;
  }
  return clampVolume(Math.round(parsed));
}

/**
 * 操作音の音量（0以上100以下）を保存する。保存前に0以上100以下の整数へ丸める。非有限値は保存しない。
 * localStorage が無い・例外を投げる（プライベートモードの容量超過など）ときは握りつぶして何もしない。
 */
export function saveSoundVolume(volume: number): void {
  if (!Number.isFinite(volume)) {
    return;
  }
  const storage = getStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(SOUND_VOLUME_KEY, String(clampVolume(Math.round(volume))));
  } catch {
    // 保存できない環境でも処理を止めない。
  }
}
