// 受け入れ診断専用の暫定TAKEOVER拍データ（Issue #76）。
// これは検証のための仮データであり、本編は参照しない。実データは Issue #46（TAKEOVER曲プロファイル）が
// 生成し、本編プレイ中の駆動は Issue #59 が行う。本ファイルは #46 完了時に削除または置換する。
// カメラ軌跡（#13）の provisionalTakeoverCamera.ts と同じ位置づけ・作法である。
//
// 拍の構造は出典 docs/analysis/takeover.songmap.json に揃える。値の採用理由を先に述べる。
//   - 曲長237250ミリ秒・先頭拍310ミリ秒は songmap の duration・先頭拍 startTime に一致させる。
//   - 拍間隔は毎分175拍から導く。1分=60000ミリ秒を175で割り342.857…ミリ秒とする（songmap の拍長と一致）。
//   - 小節あたり4拍とする。songmap は先頭の小節だけ3拍（アウフタクト）で以降は4拍だが、演出は拍時刻と
//     小節頭の周期にのみ依存するため、検証では一定の4拍に揃える。一定の拍密度は拡大・揺れの重なりと
//     性能に対する最も厳しい条件であり、受け入れ判定の代表性を高める。
//   - 拍内位置は1始まり（1が小節頭）とする。songmap が1始まりであることに合わせる。

/** TAKEOVERの曲長（ミリ秒）。出典 docs/analysis/takeover.songmap.json の duration。 */
export const TAKEOVER_DURATION_MS = 237250;

/** 先頭拍の開始時刻（ミリ秒）。出典 docs/analysis/takeover.songmap.json の先頭拍 startTime。 */
const FIRST_BEAT_MS = 310;

/** 代表テンポ（毎分拍数）。出典 docs/analysis/takeover.songmap.json・src/config/tuning.ts。 */
const TEMPO_BPM = 175;

/** 1拍の長さ（ミリ秒）。1分=60000ミリ秒を毎分拍数で割る。 */
const BEAT_INTERVAL_MS = 60000 / TEMPO_BPM;

/** 小節あたりの拍数。 */
const BEATS_PER_BAR = 4;

/** 暫定TAKEOVER拍。startTimeMs は拍開始時刻、position は小節内位置（1始まり、1が小節頭）。 */
export interface ProvisionalBeat {
  index: number;
  position: number;
  startTimeMs: number;
}

/** 先頭拍から曲長まで一定間隔・一定拍数で並べた暫定拍列。 */
export const PROVISIONAL_TAKEOVER_BEATS: readonly ProvisionalBeat[] = (() => {
  const beats: ProvisionalBeat[] = [];
  let index = 0;
  for (
    let startTimeMs = FIRST_BEAT_MS;
    startTimeMs <= TAKEOVER_DURATION_MS;
    startTimeMs += BEAT_INTERVAL_MS
  ) {
    beats.push({
      index,
      position: (index % BEATS_PER_BAR) + 1,
      startTimeMs,
    });
    index += 1;
  }
  return beats;
})();
