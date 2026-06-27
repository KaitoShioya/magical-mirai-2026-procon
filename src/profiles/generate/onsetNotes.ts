// オンセット（音の立ち上がり）を拍格子から選び、密度プランと音楽的強調で間引いてノーツを生成する曲非依存の純粋関数。
// Issue #38 を再設計（譜面再設計プラン フェーズ2、不満①③の根治）。
//
// 旧実装は拍格子だけで機械的に間引いた（サビ毎拍・非サビ2拍に1回）。これは声量・コード変化・歌詞密度・小節内拍位置を
// 読まず、休符・溜め・配置の変化が無く単調だった（不満①）。さらにサビは全拍埋めで一律最大密度になり、難しいのに
// 面白くなかった（不満③）。本再設計は density.ts の密度プラン（区間分類 regions・classifiedBeats と区間別目標数
// countTargetNotes(plan).byRegion.targetNotes）と強調信号（小節内拍位置=強拍優先・コード変化近接・声量・歌詞オンセット
// 近接・見せ場信号 selectionSignal）を消費し、各区間で強調スコア上位から目標数だけ拍を選ぶ方式へ書き換える。
//
// 設計の要点（採用理由を先に述べる）:
//   - 目標密度は0.25刻みに限定する（density.ts の countTargetNotes が0.25刻みの累積で目標数を出すため）。
//     区間別目標数は countTargetNotes(plan).byRegion.targetNotes をそのまま使い、密度設計と数値を一致させる。
//   - 休符区間は置かない。サビ密度の波は「目標数を固定し強調の高い拍へ寄せる配置」で作る（不満③）。
//     これにより盛り上がる小節に密、息継ぎの小節に疎、が一律最大密度なしで生まれる。
//   - サビ3反復は同一の拍選別テンプレートを共有する。多様性逓減（diversityIndex.ts）は同リズム系列を前提に
//     同一 beatOffset の正解音程が反復間で変わったかを比較するため（基準G）、反復間で選別がずれると突き合わせが壊れる。
//     よって反復不変の信号（小節内拍位置 + サビ開始基準の相対コード変化）だけから先頭サビで相対拍位置（beatOffset）を
//     選び、同一の相対 offset 集合を各サビへ写して実拍を選ぶ。
//   - 1拍1ノーツ上限と beatIndex 有効性を満たす。選別出口で同一 beatIndex 重複が無いことを検査し、あれば文脈付き
//     例外で失敗させる（多様性逓減のキー衝突と判定の同時刻化を発生源で止めるため）。
//
// 依存方針: 本モジュールは src/profiles/generate/types（共通型 ChorusSegment）のみを取り込み、中核（engine・chart・
// scoring・input・audio）・rendering・tools・three.js を取り込まない（src/profiles/README.md・
// src/profiles/generate/README.md の依存規則）。最終ノーツ型 Note への依存も持たない（中間型のため）。

import type { ChorusSegment } from "./types";

/** 拍格子の1要素。音楽地図 beats から強調選別に要る項目を受け取る。 */
export interface OnsetBeat {
  /** 拍格子の索引（音楽地図の beats[i].index）。判定とJUST認定に使う。 */
  index: number;
  /** 拍の開始時刻（ミリ秒）。演出の実時刻と区間判定に使う。 */
  startTimeMs: number;
  /** 小節内拍位置（音楽地図の beats[i].position、1始まり。1が小節頭＝強拍）。強調選別に使う。 */
  position: number;
  /** 小節内拍数（音楽地図の beats[i].length。通常4）。強拍判定の分母に使う。 */
  lengthInBar: number;
}

/** 区間分類。density.ts の DensityClass と同義（依存を避け再宣言する）。 */
export type OnsetSectionClass = "chorus" | "base" | "rest" | "buildup";

/** 密度プランの区間（onsetNotes が読む最小形）。density.ts の DensityRegion から境界と分類だけを写す。 */
export interface OnsetRegion {
  startMs: number;
  endMs: number;
  className: OnsetSectionClass;
}

/** 区間別目標ノーツ数（onsetNotes が読む最小形）。countTargetNotes(plan).byRegion から regionIndex と targetNotes を写す。 */
export interface OnsetRegionTarget {
  regionIndex: number;
  targetNotes: number;
}

/** オンセット選択の入力。すべて音楽地図・密度プラン由来の素のデータで受け取り、TextAlive や tools の型に依存しない。
 *  beats は開始時刻の昇順が必須（音楽地図が保証する）。本関数は並べ替えない（決定論と既存不変条件「出力は入力の拍順を
 *  保つ」のため）。 */
export interface OnsetInput {
  /** 拍格子（昇順）。各拍の position/lengthInBar を強調選別に使う。 */
  beats: OnsetBeat[];
  /** サビ区間。反復テンプレートの共有対象を識別するため、また sectionKind の付与に使う。 */
  chorusSegments: ChorusSegment[];
  /** 密度プランの区間列（曲全域被覆）。各拍の所属区間と分類を引く。 */
  regions: OnsetRegion[];
  /** 区間別目標ノーツ数。各区間でこの数だけ拍を選ぶ。 */
  regionTargets: OnsetRegionTarget[];
  /** コード変化時刻（各コード区間の開始時刻、昇順）。強調スコアのコード変化近接に使う。 */
  chordChangeTimesMs: number[];
  /** 歌詞文字の開始時刻（昇順想定）。強調スコアの歌詞オンセット近接に使う。 */
  lyricCharOnsetsMs: number[];
  /** 声量曲線（正規化前の素値・刻み・最大値）。強調スコアの声量に使う。 */
  loudness: { stepMs: number; maxAmplitude: number; values: number[] };
  /** 見せ場信号（density.ts の selectionSignal）。強調スコアの見せ場成分に使う。 */
  selectionSignal: { stepMs: number; samples: { timeMs: number; value: number }[] };
}

/** オンセット選択のオプション。すべて既定値を持ち、曲横展開で上書きできる。
 *  各重みは強調スコアの線形結合の係数で、初期値を根拠付きで定める（プレイ検証で調整）。 */
export interface OnsetOptions {
  /** 小節内強拍の重み。強拍（小節頭）を弱拍より高くする。 */
  beatPositionWeight: number;
  /** コード変化近接の重み。コード境界の拍を音楽的節目として優先する。 */
  chordChangeWeight: number;
  /** 声量の重み。声が大きい箇所を優先する。 */
  loudnessWeight: number;
  /** 歌詞オンセット近接の重み。歌が立つ拍を優先する。 */
  lyricWeight: number;
  /** 見せ場信号の重み。クライマックス周辺を優先する。 */
  showcaseWeight: number;
  /** コード変化・歌詞オンセットの近接核の半幅（ミリ秒）。この幅以内なら近接度が正。 */
  proximityHalfMs: number;
  /** 局所密度の上限を測る窓の長さ（拍数）。この窓に最大 windowCap 個までノーツを許す。 */
  windowBeats: number;
  /** 局所密度の上限（windowBeats 拍の窓あたりの最大ノーツ数）。偏りを許しつつ密のピークを抑える。 */
  windowCap: number;
  /** ノーツ id の接頭辞。 */
  idPrefix: string;
}

/** 中間ノーツ（第1段の出力）。最終 Note のうち第1段で確定する項目に、密度の出所を加える。
 *  slotIndex と pattern は #39、trajectoryPosition は #40 が後段で付与するため、本型は持たない。 */
export interface OnsetNote {
  /** プロファイル内で一意の識別子。idPrefix と固定4桁ゼロ埋め連番を連結する。 */
  id: string;
  /** 演出に使う実時刻（選んだ拍の startTimeMs）。 */
  timeMs: number;
  /** 判定とJUST認定に使う拍格子の索引（選んだ拍の index）。 */
  beatIndex: number;
  /** 密度の出所。達成基準の密度差検査と下流の密度精緻化に使う。サビ区間内をchorus、それ以外をnonChorusとする。 */
  sectionKind: "chorus" | "nonChorus";
}

/** 既定オプション。
 *  各重みの採用理由を先に述べる。小節内強拍とコード変化は反復不変でサビテンプレートの骨格を成すため最も重くする
 *  （beatPositionWeight=1.0・chordChangeWeight=0.9）。声量・歌詞は反復間で揺れる補助信号のため中程度
 *  （loudnessWeight=0.6・lyricWeight=0.6）。見せ場は曲全体の盛り上がりの薄い背景バイアスのため最も軽くする
 *  （showcaseWeight=0.3）。proximityHalfMs=200ミリ秒は声量サンプル間隔と同程度で、拍（約343ミリ秒）の半分弱に
 *  あたり、隣接コード境界・歌詞の取り違えを避けつつ近接を捉える幅である。
 *  windowBeats=4・windowCap=3 の採用理由を先に述べる。1小節（4拍）の窓に最大3ノーツまで許すと、強調の山では3連の
 *  短い塊（偏り＝リズムの抑揚）が生まれて単調さが解消し（実機目視で平準化が単調と判明）、同時に4拍すべては埋めない
 *  ため毎拍の密な連続（旧30ノーツ問題）と過度な難易度を防ぐ。窓上限比 3/4=0.75 は目標密度0.5を上回るため目標数を選び切れる。
 *  いずれも初期見積もりでプレイ検証で調整する。 */
export const DEFAULT_ONSET_OPTIONS: OnsetOptions = {
  beatPositionWeight: 1.0,
  chordChangeWeight: 0.9,
  loudnessWeight: 0.6,
  lyricWeight: 0.6,
  showcaseWeight: 0.3,
  proximityHalfMs: 200,
  windowBeats: 4,
  windowCap: 3,
  idPrefix: "note-",
};

/** id 連番のゼロ埋め桁数。固定4桁にする理由は旧実装と同じで、全idを等幅にして桁が総数に依存して揺れないため。 */
const ID_DIGITS = 4;

/** 値を下限と上限の間に収める。 */
function clamp(value: number, lower: number, upper: number): number {
  return Math.min(Math.max(value, lower), upper);
}

/** 時刻がいずれかのサビ区間の右半開区間（startMs 以上 endMs 未満）に入るかを判定する。
 *  右半開で統一する理由は types.ts の ChorusSegment の定義と既存の見せ場生成に揃え、境界の拍を二重に数えないため。 */
function isInsideAnyChorus(timeMs: number, chorusSegments: readonly ChorusSegment[]): boolean {
  return chorusSegments.some((s) => timeMs >= s.startMs && timeMs < s.endMs);
}

/** 時刻が属する区間の添字を右半開で引く。どの区間にも入らない場合は−1。 */
function regionIndexAt(timeMs: number, regions: readonly OnsetRegion[]): number {
  for (let i = 0; i < regions.length; i++) {
    if (timeMs >= regions[i].startMs && timeMs < regions[i].endMs) return i;
  }
  return -1;
}

/** 時刻における正規化声量（0以上1以下）を返す。負値（無音センチネル）は0に、最大超過は1に丸める。 */
function normalizedLoudnessAt(
  timeMs: number,
  loudness: OnsetInput["loudness"],
): number {
  if (!(loudness.maxAmplitude > 0) || loudness.values.length === 0) return 0;
  const idx = clamp(Math.floor(timeMs / loudness.stepMs), 0, loudness.values.length - 1);
  const raw = Math.max(loudness.values[idx], 0);
  return Math.min(raw / loudness.maxAmplitude, 1);
}

/** 時刻における見せ場信号（0以上1以下）を、サンプル列の最近接サンプルから返す。 */
function showcaseSignalAt(
  timeMs: number,
  signal: OnsetInput["selectionSignal"],
): number {
  if (signal.samples.length === 0) return 0;
  // サンプルは時刻昇順。二分探索を避け、刻みから近接添字を当てて前後を比較する素直な走査で十分（曲長で数百サンプル）。
  let best = signal.samples[0];
  let bestDist = Math.abs(timeMs - best.timeMs);
  for (const s of signal.samples) {
    const d = Math.abs(timeMs - s.timeMs);
    if (d < bestDist) {
      best = s;
      bestDist = d;
    }
  }
  return clamp(best.value, 0, 1);
}

/** 時刻と「昇順の時刻配列」の最近接要素との近接度（0以上1以下）を三角核で返す。
 *  半幅以内で線形に1へ近づき、半幅を超えると0。配列が空なら0。 */
function proximityToTimes(timeMs: number, sortedTimesMs: readonly number[], halfMs: number): number {
  if (sortedTimesMs.length === 0 || !(halfMs > 0)) return 0;
  let nearest = Infinity;
  for (const t of sortedTimesMs) {
    const d = Math.abs(timeMs - t);
    if (d < nearest) nearest = d;
    // 既に半幅を割り込んだら、これ以上近づいても近接度は1で頭打ちのため十分。ただし配列は昇順でも対象時刻が
    // 配列途中にあるため早期打ち切りはしない（単純さと正しさを優先）。
  }
  return Math.max(0, 1 - nearest / halfMs);
}

/** 小節内拍位置から強拍度（0以上1以下）を返す。小節頭（position=1）を最大の1とし、後ろの拍ほど下げる。
 *  採用理由を先に述べる。小節頭が最も強い拍で、4拍子では3拍目が次に強い。位置の素朴な強弱（1>3>2>4）を
 *  決定論的な数値へ写す。lengthInBar が異常（1以下）なら一律0.5にして偏りを作らない。 */
function strongBeatScore(position: number, lengthInBar: number): number {
  if (!(lengthInBar > 1)) return 0.5;
  // 4拍子の典型: position 1=1.0, 3=0.7, 2=0.4, 4=0.4。一般化のため、1拍目を最強、中央拍を中強、他を弱とする。
  if (position === 1) return 1.0;
  // 小節の中央（4拍子なら3拍目）を中強。中央位置は floor(lengthInBar/2)+1。
  const midPosition = Math.floor(lengthInBar / 2) + 1;
  if (position === midPosition) return 0.7;
  return 0.4;
}

/** 単一拍の強調スコアを重み付き和で返す。受け入れ基準を実データで検証するため公開する。
 *  反復不変成分（強拍・コード変化近接）と反復可変成分（声量・歌詞・見せ場）を分けて扱えるよう、
 *  invariantOnly=true のときは反復不変成分だけで計算する（サビテンプレートの共有に使う）。 */
export function accentScore(
  beat: OnsetBeat,
  input: OnsetInput,
  options: OnsetOptions,
  invariantOnly: boolean,
  chordChangeTimesMs: readonly number[],
): number {
  const strong = strongBeatScore(beat.position, beat.lengthInBar) * options.beatPositionWeight;
  const chordNear =
    proximityToTimes(beat.startTimeMs, chordChangeTimesMs, options.proximityHalfMs) *
    options.chordChangeWeight;
  if (invariantOnly) {
    return strong + chordNear;
  }
  const loud = normalizedLoudnessAt(beat.startTimeMs, input.loudness) * options.loudnessWeight;
  const lyric =
    proximityToTimes(beat.startTimeMs, input.lyricCharOnsetsMs, options.proximityHalfMs) *
    options.lyricWeight;
  const show = showcaseSignalAt(beat.startTimeMs, input.selectionSignal) * options.showcaseWeight;
  return strong + chordNear + loud + lyric + show;
}

/** 連続した拍位置の score 配列から、強調スコアの高い順に count 個を選ぶ。ただし「windowBeats 拍の窓に windowCap 個まで」
 *  の局所上限を守る。選び方の理由を先に述べる。等間隔に1つずつ選ぶと局所密度が一定になり単調に感じる（実機目視）。
 *  強調順に選ぶと音楽の山にノーツが寄って偏り（リズムの抑揚）が生まれるが、無制限だと密のピークで難しくなる。窓内上限で
 *  局所密度の上限を抑えつつ偏りを許すことで、難易度を中庸に保ったまま単調さを解消する。同点は拍位置の昇順で決定論にする。
 *  局所上限で目標数に届かない場合は、未選択の拍位置を等間隔で補う（密度を満たすため）。
 *  引数 scores は拍位置（=配列添字）昇順に並んだ各拍の強調スコアで、戻り値は選ばれた拍位置（添字）の昇順配列。 */
function selectWithLocalCap(
  scores: readonly number[],
  count: number,
  windowBeats: number,
  windowCap: number,
): number[] {
  const n = scores.length;
  if (count <= 0 || n === 0) return [];
  if (count >= n) return Array.from({ length: n }, (_, i) => i);
  const selected = new Array<boolean>(n).fill(false);
  let selectedCount = 0;
  // pos を加えても、pos を含む長さ windowBeats の全ての窓で選択数が windowCap 以下かを判定する。
  const windowOk = (pos: number): boolean => {
    const from = Math.max(0, pos - windowBeats + 1);
    const to = Math.min(n - windowBeats, pos);
    for (let k = from; k <= to; k++) {
      let c = 0;
      for (let i = k; i < k + windowBeats; i++) {
        if (selected[i] || i === pos) c++;
      }
      if (c > windowCap) return false;
    }
    return true;
  };
  const order = scores
    .map((score, i) => ({ i, score }))
    .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.i - b.i));
  for (const o of order) {
    if (selectedCount >= count) break;
    if (windowOk(o.i)) {
      selected[o.i] = true;
      selectedCount += 1;
    }
  }
  if (selectedCount < count) {
    const unselected: number[] = [];
    for (let i = 0; i < n; i++) if (!selected[i]) unselected.push(i);
    const remaining = count - selectedCount;
    for (let s = 0; s < remaining && s < unselected.length; s++) {
      const idx = unselected[Math.floor((s * unselected.length) / remaining)];
      if (!selected[idx]) {
        selected[idx] = true;
        selectedCount += 1;
      }
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (selected[i]) out.push(i);
  return out;
}

/**
 * 拍格子・密度プラン・強調信号から、区間別目標数ぶんの拍を強調スコア上位で選び、中間ノーツの配列を返す。
 *
 * 手順:
 * 1. サビ区間（className==='chorus'）を開始順に集める。3反復は同じ拍数を前提に、反復不変の信号（小節内拍位置 +
 *    サビ開始基準の相対コード変化）だけから先頭サビの拍列を目標数ぶんのセグメントへ等分し、各セグメントで反復不変
 *    スコア最大の相対拍位置（beatOffset）を選ぶ。同一の相対 offset 集合を各サビへ写して実拍を選ぶ。これで3サビの
 *    beatOffset 集合が一致する（基準G・多様性逓減の前提）。
 * 2. サビ以外の区間は、各区間の拍列を目標数ぶんのセグメントへ等分し各セグメントで強調スコア（全成分）最大の拍を
 *    選ぶ。休符（rest）は目標0で何も置かない。等分により局所密度を区間平均へ揃え密のピークを避ける。
 * 3. 選ばれた拍を拍索引昇順に並べ、中間ノーツへ写す。出口で同一 beatIndex 重複が無いことを検査する。
 *
 * 出力は拍索引（=入力の拍順）の昇順で、決定論である。
 */
export function generateOnsetNotes(input: OnsetInput, options?: Partial<OnsetOptions>): OnsetNote[] {
  const opts: OnsetOptions = { ...DEFAULT_ONSET_OPTIONS, ...options };

  const targetByRegion = new Map<number, number>();
  for (const t of input.regionTargets) targetByRegion.set(t.regionIndex, t.targetNotes);

  // 各拍を所属区間へ振り分ける。region 外の拍（被覆漏れ）は選別対象外にする。
  const beatsByRegion = new Map<number, OnsetBeat[]>();
  for (const beat of input.beats) {
    const ri = regionIndexAt(beat.startTimeMs, input.regions);
    if (ri < 0) continue;
    const list = beatsByRegion.get(ri);
    if (list) list.push(beat);
    else beatsByRegion.set(ri, [beat]);
  }

  // サビ区間の添字（開始順）。
  const chorusRegionIndices = input.regions
    .map((r, i) => ({ r, i }))
    .filter((x) => x.r.className === "chorus")
    .sort((a, b) => a.r.startMs - b.r.startMs)
    .map((x) => x.i);

  // 選ばれた拍を集める集合（beatIndex）。サビは共有テンプレートで、非サビは個別スコアで選ぶ。
  const selectedBeats: OnsetBeat[] = [];

  // ── サビ3反復の共有テンプレート ──
  // 反復不変の相対コード変化時刻を作る。各サビの「サビ開始時刻からの相対」に揃え、3反復で同じ相対集合になる前提に立つ。
  if (chorusRegionIndices.length > 0) {
    // 先頭サビを基準にテンプレートを作る。
    const firstChorus = input.regions[chorusRegionIndices[0]];
    const firstChorusBeats = (beatsByRegion.get(chorusRegionIndices[0]) ?? []).slice();
    // 横展開の防御。サビ共有テンプレートは全反復が同一拍数であることを前提に、同一の相対拍位置集合を各反復へ写す。
    // 拍数が異なると相対位置が反復間でずれて beatOffset 集合が一致せず、多様性逓減（基準G）が無言で壊れるため、
    // 一致しない場合は発生源で文脈付き例外を投げて止める。TAKEOVER は各サビ64拍で一致し、この例外は起きない。
    const firstChorusBeatCount = firstChorusBeats.length;
    for (const ri of chorusRegionIndices) {
      const count = (beatsByRegion.get(ri) ?? []).length;
      if (count !== firstChorusBeatCount) {
        throw new Error(
          `サビ反復の拍数が一致しません（区間[${ri}]は${count}拍、先頭サビは${firstChorusBeatCount}拍）。` +
            `サビ共有テンプレートは全反復が同一拍数であることを前提とします`,
        );
      }
    }
    // 反復不変の相対コード変化（先頭サビ基準）。各サビへ写すときは「そのサビの開始 + 相対」で復元する。
    const relChordChanges = input.chordChangeTimesMs
      .filter((t) => t >= firstChorus.startMs && t < firstChorus.endMs)
      .map((t) => t - firstChorus.startMs);

    // 先頭サビで beatOffset（サビ先頭拍の index を0とした相対拍位置）ごとの強調スコアを作る。
    // 強調は強拍 + 相対コード変化に加え、先頭サビの声量と歌詞近接を含める。先頭サビの信号を使う理由を先に述べる。
    // 強拍だけだと毎小節同じ位置が選ばれて単調になる（実機目視）。先頭サビの声量・歌詞はサビ内で変化しリズムの抑揚を
    // 与える一方、3反復すべてに同一の offset 集合として写すため、反復間の整列（基準G・多様性逓減の前提）は保たれる。
    const anchorIndex = firstChorusBeats.length > 0 ? firstChorusBeats[0].index : 0;
    const templateScores: number[] = firstChorusBeats.map((beat) => {
      const relBeatMs = beat.startTimeMs - firstChorus.startMs;
      const strong = strongBeatScore(beat.position, beat.lengthInBar) * opts.beatPositionWeight;
      const chordNear =
        proximityToTimes(relBeatMs, relChordChanges, opts.proximityHalfMs) * opts.chordChangeWeight;
      const loud = normalizedLoudnessAt(beat.startTimeMs, input.loudness) * opts.loudnessWeight;
      const lyric =
        proximityToTimes(beat.startTimeMs, input.lyricCharOnsetsMs, opts.proximityHalfMs) * opts.lyricWeight;
      return strong + chordNear + loud + lyric;
    });
    // 目標数は先頭サビ区間の目標数を使う（3反復とも同じ拍数・同じ目標数になる前提。実データで64拍/32ノーツ）。
    // 非サビと同じく局所上限付きの強調選択で、偏り（リズムの抑揚）を許しつつ密のピークを抑える。
    const chorusTarget = targetByRegion.get(chorusRegionIndices[0]) ?? 0;
    const chosenPositions = selectWithLocalCap(templateScores, chorusTarget, opts.windowBeats, opts.windowCap);
    // 反復間で beatOffset 集合を一致させるため、選んだ拍位置を offset へ写し昇順で確定する。
    const templateOffsets = chosenPositions
      .map((pos) => firstChorusBeats[pos].index - anchorIndex)
      .sort((a, b) => a - b);

    // 各サビへ同一の相対 offset 集合を写し、実拍を選ぶ。
    for (const ri of chorusRegionIndices) {
      const cbeats = (beatsByRegion.get(ri) ?? []).slice();
      if (cbeats.length === 0) continue;
      const anchor = cbeats[0].index;
      const byOffset = new Map<number, OnsetBeat>();
      for (const b of cbeats) byOffset.set(b.index - anchor, b);
      for (const off of templateOffsets) {
        const b = byOffset.get(off);
        if (b) selectedBeats.push(b);
      }
    }
  }

  // ── サビ以外の区間 ──
  for (let ri = 0; ri < input.regions.length; ri++) {
    if (input.regions[ri].className === "chorus") continue; // サビは上で処理済み。
    const target = targetByRegion.get(ri) ?? 0;
    if (target <= 0) continue; // 休符（rest）など目標0は何も置かない。
    const rbeats = beatsByRegion.get(ri) ?? [];
    const scores = rbeats.map((beat) => accentScore(beat, input, opts, false, input.chordChangeTimesMs));
    for (const pos of selectWithLocalCap(scores, target, opts.windowBeats, opts.windowCap)) {
      selectedBeats.push(rbeats[pos]);
    }
  }

  // 拍索引昇順に並べ替え、同一 beatIndex 重複を検査する。
  selectedBeats.sort((a, b) => a.index - b.index);
  const seen = new Set<number>();
  for (const b of selectedBeats) {
    if (seen.has(b.index)) {
      throw new Error(
        `オンセット選別で同一 beatIndex（${b.index}）が重複しました。多様性逓減のキー衝突と判定の同時刻化を防ぐため` +
          `1拍1ノーツの上限を満たす必要があります`,
      );
    }
    seen.add(b.index);
  }

  // 中間ノーツへ写す。id は選択順（=拍索引昇順）の4桁ゼロ埋め連番。
  return selectedBeats.map((beat, i) => ({
    id: `${opts.idPrefix}${String(i).padStart(ID_DIGITS, "0")}`,
    timeMs: beat.startTimeMs,
    beatIndex: beat.index,
    sectionKind: isInsideAnyChorus(beat.startTimeMs, input.chorusSegments) ? "chorus" : "nonChorus",
  }));
}
