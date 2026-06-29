// 音楽地図ダンプ（songmap）と曲別の手動入力から、検証を通る曲プロファイル（SongProfile）を組み立てる
// 曲非依存の純粋関数。Issue #45 の中核。
//
// 役割を先に述べる。スキーマ（#34）と各派生フィールドの生成関数（#35〜#44）は実装済みだが、それらを正しい順序と
// 正しい入力形へ結線して1本のプロファイルにまとめる入口が無い。本関数はその結線を行い、songmap を SongProfile へ
// 変換し、検証関数 validateProfile（#34）に通した結果まで返す。ファイル入出力は行わず、コマンド本体（scripts）が担う。
//
// 半自動である理由を先に述べる。テンポ・拍・和音・スロット・見せ場・密度・タップ上限・ノーツ・多様性逓減区間は
// songmap から自動で導出できるが、調（musicalKey）・カメラ軌跡（camera）・色（colors）・操作音（sfx）は songmap から
// 導出できない設計判断であり、曲別の手動入力として受け取る。多様性逓減区間（diversityZones）は songmap のサビ区間から
// 自動生成し（Issue #42）、曲固有のラベルだけを曲別入力（diversityZoneLabels）で任意に上書きする。
//
// 依存方針: スキーマと生成層と utils（カメラ軌跡評価器）だけを取り込み、中核（engine 等）・rendering・tools は
// 取り込まない（docs/decisions/architecture.md §5 の依存規則）。カメラ軌跡評価器は src/utils 配下であり rendering ではない。

import type {
  SongProfile,
  ProfileSource,
  MusicalKey,
  Chord,
  NcRange,
  NcTreatment,
  ChordToneSlotRegion,
  Note,
  CameraKeyframe,
  TapColors,
  Sfx,
  LyricDensity,
} from "../schema/profileSchema";
import { validateProfile, type ValidationResult } from "../schema/validateProfile";
import { isNoChordSymbol } from "../../utils/chordPitch";
import { createCameraTrajectory } from "../../utils/cameraTrajectory";
import { resolveNoChordRegions } from "./noChordResolution";
import { generateChordToneSlots, type ResolvedChordRegion } from "./chordToneSlots";
import { generateShowcases, mergeContiguousChorusSegments } from "./showcases";
import {
  generateDensityPlan,
  countTargetNotes,
  DEFAULT_DENSITY_OPTIONS,
  type DensityInput,
  type DensityOptions,
} from "./density";
import {
  generateTapBudget,
  DEFAULT_CHORUS_TAPS_PER_BEAT,
  DEFAULT_NON_CHORUS_TAPS_PER_BEAT,
} from "./tapBudget";
import {
  generateOnsetNotes,
  DEFAULT_ONSET_OPTIONS,
  type OnsetOptions,
} from "./onsetNotes";
import { applyNotePatterns } from "./notePatterns";
import { placeNotesOnTrajectory } from "./noteTrajectory";
import {
  type RawSongmap,
  toBeats,
  toChords,
  toRepetitiveSegments,
  toChorusSegments,
  toDensityBeats,
  toLoudnessCurve,
  toEmotionCurve,
  toLyricChars,
  toLyricCharOnsetsMs,
  toOnsetInput,
  toPhraseOnsetsMs,
  toTapBudgetInput,
  toShowcaseInput,
} from "./songmapAdapters";
import { deriveDiversityZones } from "./diversityZones";
import { DEFAULT_SHOWCASE_OPTIONS } from "./types";

/** 曲別の手動入力。songmap から導出できないフィールドを受け取る。
 *  実内容の確定は後続 Issue の責務であり、#45 では検証を通る暫定値で足りる（camera・colors・sfx）。
 *  diversityZoneLabels は省略可能で、省略時は多様性逓減区間に汎用ラベルが付く。 */
export interface ManualProfileInputs {
  /** 楽曲の調。無和音区間を調の音階へ解決するときに使う。 */
  musicalKey: MusicalKey;
  /** クライマックス（最終見せ場）の代表時刻（ミリ秒）。見せ場生成と密度生成が使う。 */
  climaxAnchorMs: number;
  /** カメラ軌跡のキーフレーム。ノーツの軌跡上位置の算出に使う。2点以上で時刻が厳密増加し、曲全体を覆う必要がある。
   *  省略した場合は曲長から暫定の2点直線軌跡を自動生成する（実カメラ軌跡の設計は後続 Issue #32 が行う）。 */
  camera?: CameraKeyframe[];
  /** X軸の色。検証を通る停止点を持つ。 */
  colors: TapColors;
  /** 操作音の音色（通常時・投下時）。 */
  sfx: Sfx;
  /** 多様性逓減区間のラベルの曲別上書き。索引 i = 自動抽出された i 番目の区間のラベル。
   *  境界と役割は songmap のサビ区間から自動決定する（Issue #42）。要素が undefined・空文字、または
   *  配列自体が未指定の区間は汎用ラベル（第N反復区間（役割））を自動生成する。 */
  diversityZoneLabels?: ReadonlyArray<string | undefined>;
  /** 無和音区間の埋め方の曲別上書き。和音索引（整数）で指定する。指定が無い区間は既定規則で決める。
   *  和音索引で指定する理由を先に述べる。songmap の時刻は浮動小数点で人が手で書いた時刻と厳密一致しないが、
   *  和音索引は整数で曖昧さが無いためである。 */
  ncTreatmentOverrides?: Record<number, NcTreatment>;
  /** 譜面密度の曲別上書き（DensityOptions の一部）。指定したフィールドだけ既定値（DEFAULT_DENSITY_OPTIONS）へ上書きする。
   *  曲ごとに上書きできる設計は density.ts の DensityOptions が元から想定している（横展開時の調整点）。
   *  難易度は「1拍あたり密度×毎秒拍数」で決まるため、拍格子の粗い（毎分拍数の小さい）楽曲では1拍あたり密度を上げて
   *  毎秒ノーツ数を保つ。1拍あたり密度の上限は1.0（拍索引が一意のため1拍に最大1ノーツ）である。 */
  density?: Partial<DensityOptions>;
  /** オンセット選択（強調による拍の偏り）の曲別上書き（OnsetOptions の一部）。指定したフィールドだけ既定値
   *  （DEFAULT_ONSET_OPTIONS）へ上書きする。曲ごとに上書きできる設計は onsetNotes.ts の OnsetOptions が元から想定している。
   *  声量・歌詞などの重みを上げると、ノーツの塊と空白が楽曲の声量・歌詞の起伏へ寄り、頻度の偏り（緩急）が楽曲内容に沿う。
   *  注記: 1拍あたり密度が1.0のときは目標数が全拍数に達し全拍が無選択で採られるため、本上書きは密度が1.0未満のときに効く。 */
  onset?: Partial<OnsetOptions>;
}

/** 手動カメラ軌跡が与えられないときの暫定カメラを作る。曲頭と曲尾の2点だけの直線的な軌跡で、検証関数（カメラは曲頭0ミリ秒から
 *  曲長まで覆う）とカメラ軌跡評価器（2点以上・時刻が厳密増加）の要求を満たす最小構成である。末尾時刻を曲長から導くため、
 *  曲長が変わっても曲尾に追従し、曲別入力に曲長を重複して書く必要が無い。実カメラ軌跡の設計は後続 Issue #32 が行う。 */
function buildPlaceholderCamera(durationMs: number): CameraKeyframe[] {
  return [
    { timeMs: 0, position: { x: 0, y: 6, z: 14 }, target: { x: 0, y: 0, z: 0 } },
    { timeMs: durationMs, position: { x: 0, y: 6, z: 14 }, target: { x: 0, y: 0, z: 0 } },
  ];
}

/** 数値配列の中央値を返す。空配列は0を返す。 */
function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/** 無和音「N」区間ごとに NcRange を作る。treatment は曲別上書きがあればそれを、無ければ既定規則で決める。
 *  既定規則を先に述べる。直前の和音区間が存在し、かつ無和音でないなら "previous"、それ以外（曲頭で直前が無い、
 *  または直前も無和音）なら "scale" とする。この規則の理由を先に述べる。検証関数 validateProfile と
 *  無和音解決 resolveNoChordRegions の双方が "previous" に対し「直前に無和音でない和音が境界で隣接する」ことを
 *  要求するためであり、曲頭と連続無和音の双方を "scale" に倒すことで違反を起こさない。 */
export function buildNcRanges(
  chords: Chord[],
  overrides: Record<number, NcTreatment> | undefined,
): NcRange[] {
  const ncRanges: NcRange[] = [];
  for (let i = 0; i < chords.length; i++) {
    const chord = chords[i];
    if (!isNoChordSymbol(chord.name)) {
      continue;
    }
    const override = overrides?.[chord.index];
    let treatment: NcTreatment;
    if (override !== undefined) {
      treatment = override;
    } else {
      const previous = i > 0 ? chords[i - 1] : undefined;
      treatment = previous !== undefined && !isNoChordSymbol(previous.name) ? "previous" : "scale";
    }
    ncRanges.push({ startTimeMs: chord.startTimeMs, endTimeMs: chord.endTimeMs, treatment });
  }
  return ncRanges;
}

/** 全和音区間ぶんの ResolvedChordRegion を作る。無和音区間は解決後の和音名、無和音でない区間は和音名そのものを使う。
 *  結果は和音区間と1対1（同じ件数・同じ境界）であり、スロット生成に渡すとスロット数が和音区間数と一致する。 */
function buildResolvedChordRegions(chords: Chord[], musicalKey: MusicalKey, ncRanges: NcRange[]): ResolvedChordRegion[] {
  const resolutions = resolveNoChordRegions(chords, ncRanges, musicalKey);
  const resolvedNameByChordIndex = new Map(resolutions.map((r) => [r.chordIndex, r.resolvedChordName]));
  return chords.map((chord) => {
    if (!isNoChordSymbol(chord.name)) {
      return { startTimeMs: chord.startTimeMs, endTimeMs: chord.endTimeMs, chordName: chord.name };
    }
    const resolvedName = resolvedNameByChordIndex.get(chord.index);
    if (resolvedName === undefined) {
      throw new Error(`無和音区間（和音索引${chord.index}）の解決後和音名が得られませんでした`);
    }
    return { startTimeMs: chord.startTimeMs, endTimeMs: chord.endTimeMs, chordName: resolvedName };
  });
}

/** songmap・手動入力・ロード元から曲プロファイルを組み立て、検証結果とともに返す。 */
export function buildProfile(args: {
  songmap: RawSongmap;
  manual: ManualProfileInputs;
  source: ProfileSource;
}): { profile: SongProfile; validation: ValidationResult } {
  const { songmap, manual, source } = args;

  // 1. songmap → スキーマ配列・生成関数入力。
  const durationMs = songmap.song.duration;
  const beats = toBeats(songmap);

  // 和音の終了時刻を曲長で丸める。理由を先に述べる。音楽地図は最終和音の終了時刻を曲長より微小に超えて記録することが
  // あり（TAKEOVER は19ミリ秒超過）、検証関数は和音の連続被覆には末尾の超過を許容する一方、無和音区間（ncRanges）には
  // 許容差1ミリ秒しか認めず、かつ無和音区間と和音の「N」区間が許容差1ミリ秒で一致することを要求する。両者を同じ値に
  // するため、和音・無和音区間・スロットの素になる和音の終了時刻を曲長で丸めて整合させる。曲長以内の和音は変わらない。
  const clampedChords = toChords(songmap).map((c) => {
    const endTimeMs = Math.min(c.endTimeMs, durationMs);
    return { ...c, endTimeMs, durationMs: endTimeMs - c.startTimeMs };
  });
  // 末尾の和音区間が曲長に届かない場合、最後の区間を曲長まで延ばして連続被覆を保つ。理由を先に述べる。検証は和音が曲頭から
  // 曲長まで切れ目なく覆うことを要求するが、音楽地図の最終和音は曲長より手前で終わることがある（本曲は259ミリ秒の隙間）。
  // 最終区間を曲長へ延ばせば末尾の短い隙間をその区間で覆える（最終区間が無和音なら直前和音または音階へ解決される）。
  // TAKEOVER は最終和音が曲長を超えており上で曲長へ丸められ既に曲長に一致するため、この延長は無処理になる。
  const chords = clampedChords.map((c, i) =>
    i === clampedChords.length - 1 && c.endTimeMs < durationMs
      ? { ...c, endTimeMs: durationMs, durationMs: durationMs - c.startTimeMs }
      : c,
  );
  const repetitiveSegments = toRepetitiveSegments(songmap);
  const loudnessCurve = toLoudnessCurve(songmap);
  const emotionCurve = toEmotionCurve(songmap);
  const lyricChars = toLyricChars(songmap);
  const chorusSegments = toChorusSegments(songmap);
  const lyricCharOnsetsMs = toLyricCharOnsetsMs(songmap);

  // 2. 無和音区間。
  const ncRanges = buildNcRanges(chords, manual.ncTreatmentOverrides);

  // 3. スロット（全和音区間に無和音解決を施してから生成する）。
  const resolvedRegions = buildResolvedChordRegions(chords, manual.musicalKey, ncRanges);
  const slots: ChordToneSlotRegion[] = generateChordToneSlots(resolvedRegions);

  // 4. 見せ場（climaxAnchorMs は手動入力。見せ場生成ではオプション引数で渡す）。
  //    見せ場の個数は、既定値と曲のサビ群（連続サビを統合したブロック）の数の大きい方にする。理由を先に述べる。見せ場生成は
  //    戦略Bで各サビ群を必ず見せ場にするため、見せ場の個数がサビ群の数より少ないと失敗する。また見せ場生成は隣接する反復区間を
  //    1つのサビ群へ統合してから不変窓にする（接する区間を別々の窓にすると窓どうしが重なるため）ので、個数の下限も統合後のサビ群の数で
  //    数える。サビ群の数は曲ごとに異なるため、既定値を下限としつつサビ群の数まで個数を増やすことで、サビの多い曲でも全サビ群を見せ場に
  //    できる。サビ群が既定値以下の曲では既定値のままで、非サビの高声量点が残りの見せ場を補う（従来の挙動を保つ）。
  const showcaseCount = Math.max(
    DEFAULT_SHOWCASE_OPTIONS.count,
    mergeContiguousChorusSegments(chorusSegments).length,
  );
  const showcases = generateShowcases(toShowcaseInput(songmap), {
    climaxAnchorMs: manual.climaxAnchorMs,
    count: showcaseCount,
  });

  // 5. 歌詞密度（密度プランから windowMs と windows だけをスキーマの LyricDensity へ写す）。
  const densityInput: DensityInput = {
    durationMs,
    beats: toDensityBeats(songmap),
    chorusSegments,
    lyricCharOnsetsMs,
    showcases,
    climaxAnchorMs: manual.climaxAnchorMs,
  };
  // 譜面密度の曲別上書きを既定値へ重ねる（指定の無いフィールドは既定値のまま）。countTargetNotes は密度プランから
  // 計数するため、上書きした密度はノーツ数まで一貫して反映される。
  const densityOptions: DensityOptions = { ...DEFAULT_DENSITY_OPTIONS, ...manual.density };
  const densityPlan = generateDensityPlan(densityInput, densityOptions);
  const lyricDensity: LyricDensity = {
    windowMs: densityPlan.lyricDensity.windowMs,
    windows: densityPlan.lyricDensity.windows,
  };

  // 6. タップ上限。母数（叩ける音の最大個数の見積もり）の1拍あたり密度は、譜面密度の上書きと連動させる。
  //    連動させる理由を先に述べる。母数は「各拍に置きうるタップ数の上限」であり、実際のノーツ数は休符・溜め・量子化で
  //    母数以下になるのが設計前提（tapBudget.ts の密度モデルの範囲）である。譜面密度だけを上げて母数を据え置くと、実ノーツ数が
  //    母数を超えて一回性（上限＝母数の約6割）の意味が崩れる。母数の密度を「母数の既定値」と「譜面密度」の大きい方にすることで、
  //    母数は常に譜面密度以上（ゆえに実ノーツ数以上）になり、譜面密度を上げても上限が約6割の比率を保つ。既定の譜面密度
  //    （サビ0.5・基本0.5）は母数の既定値（サビ1.0・非サビ0.5）以下のため、上書きの無い楽曲では母数は変わらない。
  const tapBudget = generateTapBudget(toTapBudgetInput(songmap), {
    chorusTapsPerBeat: Math.max(DEFAULT_CHORUS_TAPS_PER_BEAT, densityOptions.chorusDensityPerBeat),
    nonChorusTapsPerBeat: Math.max(DEFAULT_NON_CHORUS_TAPS_PER_BEAT, densityOptions.baseDensityPerBeat),
  });

  // 7. ノーツ（オンセット選択→パターン付与→軌跡上配置を識別子で突き合わせて最終 Note へ合成）。
  //    手動カメラが無い場合は曲長から暫定カメラを自動生成する。
  //    再設計（不満①②③）: 密度プランの区間分類・区間別目標数・見せ場信号をオンセット選別へ結線し、
  //    番号割当には拍・フレーズ先頭時刻・多様性逓減区間（反復役割）を渡す。
  const camera = manual.camera ?? buildPlaceholderCamera(durationMs);
  const diversityZones = deriveDiversityZones(chorusSegments, manual.diversityZoneLabels);
  const targetCounts = countTargetNotes(densityPlan);
  const onsetInput = toOnsetInput(songmap, {
    regions: densityPlan.regions.map((r) => ({
      startMs: r.startMs,
      endMs: r.endMs,
      className: r.className,
    })),
    regionTargets: targetCounts.byRegion.map((r) => ({
      regionIndex: r.regionIndex,
      targetNotes: r.targetNotes,
    })),
    selectionSignal: densityPlan.selectionSignal,
  });
  // オンセット選択の曲別上書きを既定値へ重ねる（指定の無いフィールドは既定値のまま）。
  const onsetOptions: OnsetOptions = { ...DEFAULT_ONSET_OPTIONS, ...manual.onset };
  const onsets = generateOnsetNotes(onsetInput, onsetOptions);
  const patterned = applyNotePatterns({
    notes: onsets,
    slots,
    loudness: loudnessCurve,
    beats: beats.map((b) => ({
      index: b.index,
      position: b.position,
      lengthInBar: b.lengthInBar,
      startTimeMs: b.startTimeMs,
    })),
    phraseOnsetsMs: toPhraseOnsetsMs(songmap),
    diversityZones,
  });
  const trajectory = createCameraTrajectory(camera);
  const placements = placeNotesOnTrajectory(
    patterned.map((n) => ({ id: n.id, timeMs: n.timeMs })),
    trajectory,
  );
  const positionById = new Map(placements.map((p) => [p.id, p.trajectoryPosition]));
  const notes: Note[] = patterned.map((n) => {
    const trajectoryPosition = positionById.get(n.id);
    if (trajectoryPosition === undefined) {
      throw new Error(`ノーツ ${n.id} の軌跡上位置が見つかりませんでした`);
    }
    return {
      id: n.id,
      timeMs: n.timeMs,
      beatIndex: n.beatIndex,
      slotIndex: n.slotIndex,
      pattern: n.pattern,
      trajectoryPosition,
    };
  });

  // 7.5. 最終 Note 配列での同一 beatIndex 重複検査（結線の取り違えを最終段でも捕捉する。再設計プラン新節5）。
  //      判定は playSession が beatIndex から判定時刻を引き、多様性逓減は beatOffset キーを拍単位で一意とするため、
  //      同一 beatIndex の重複は同時刻判定とキー衝突を招く重大な不変条件である。
  {
    const seenBeatIndex = new Set<number>();
    for (const n of notes) {
      if (seenBeatIndex.has(n.beatIndex)) {
        throw new Error(`最終ノーツ配列に同一 beatIndex（${n.beatIndex}）が重複しています（ノーツ ${n.id}）`);
      }
      seenBeatIndex.add(n.beatIndex);
    }
  }

  // 8. 代表テンポ。拍の長さの中央値から求める。
  //    中央値を使う理由を先に述べる。曲尾の長さ0の拍や曲頭の不規則な拍といった外れ値に対し平均より頑健だからである。
  const medianBeatDurationMs = median(beats.map((b) => b.durationMs));
  if (!(medianBeatDurationMs > 0)) {
    throw new Error(`拍の長さの中央値が正ではありません（${medianBeatDurationMs}）。テンポを算出できません`);
  }
  const tempoBpm = Math.round(60000 / medianBeatDurationMs);

  // 9. 組み立てと検証。song.key は source.songKey に合わせ、題名・作者・曲長は songmap から採る。
  const profile: SongProfile = {
    schemaVersion: 1,
    song: {
      key: source.songKey,
      title: songmap.song.name,
      artist: songmap.song.artist,
      durationMs,
    },
    source,
    tempoBpm,
    musicalKey: manual.musicalKey,
    beats,
    chords,
    repetitiveSegments,
    loudnessCurve,
    emotionCurve,
    lyricChars,
    lyricDensity,
    ncRanges,
    showcases,
    slots,
    notes,
    camera,
    colors: manual.colors,
    sfx: manual.sfx,
    diversityZones,
    tapBudget,
  };

  return { profile, validation: validateProfile(profile) };
}
