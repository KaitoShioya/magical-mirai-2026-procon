// 曲プロファイルのJSONスキーマ（型の契約）。
// 解析先行ゲート（docs/research/08-quality-assurance.md §3）が検査する必須項目と、
// 譜面・演出の派生データを1つの型に集約する。実行時の再計算を無くすため、解析と
// 譜面生成の結果はあらかじめ書き込む（docs/research/04-ux-and-chart-design.md §2・§4）。
//
// 単位の約束:
//   - 時刻と長さはすべてミリ秒。フィールド名に Ms を付ける。
//   - 音高はMIDIノート番号（A音を440ヘルツとする標準変換。docs/research/07-feasibility-and-parameters.md §1.3）。
//
// 状態の記号:
//   ★暫定 = 見積もりを初期値とし、実装後のプレイ検証や実データで調整する値。
//   ☆確定 = 標準仕様・作品仕様で固定される値。
//
// 値の生成は下流Issueの責務であり、本ファイルは形を定義するだけである:
//   slots の音高 = #35・#36 / ノーツ = #38・#39・#40 / 無和音の音階埋め = #37 /
//   見せ場・密度・上限・多様性逓減区間 = #41〜#44 / 生成 = #45・#46。

import type { SongVideo } from "../../config/songs";

/** 3次元座標（湖面を基準とする水平面と高さ。座標の尺度は描画側 #40・M2 が定める）。 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** 楽曲同一性と曲長。出典 songmap の song（docs/analysis/takeover.songmap.json）。 */
export interface SongIdentity {
  /** アプリ内部で曲を引くキー。source.songKey と同一の楽曲キーを指す。 */
  key: string;
  title: string;
  artist: string;
  /** 曲長（ミリ秒）。各時刻フィールドはこの値を基準に検査する。 */
  durationMs: number;
}

/** 楽曲ロード元。固定URLと音楽地図識別子がプロファイル生成時の楽曲と一致することを #96 が照合する。
 *  出典 docs/support-page.md、src/config/songs.ts。 */
export interface ProfileSource {
  /** src/config/songs.ts の SONGS に存在するキー。song.key と一致する。 */
  songKey: string;
  /** バージョン番号まで含む完全形の piapro URL。SONGS の登録値と一致する。 */
  songUrl: string;
  /** 音楽地図識別子。SONGS の登録値と一致する。 */
  video: SongVideo;
}

/** 楽曲の調。無和音区間の音階埋め（#37）が参照する。出典 docs/research/07-feasibility-and-parameters.md §1.2。 */
export interface MusicalKey {
  /** 主音の音名クラス。0をハ（C）として0〜11。TAKEOVERはファ（F）=5。 */
  tonicPitchClass: number;
  /** 長調か短調か。TAKEOVERは短調。 */
  mode: "major" | "minor";
}

/** ビート格子の1拍。出典 songmap.beats。 */
export interface Beat {
  index: number;
  /** 小節内の拍位置。 */
  position: number;
  startTimeMs: number;
  endTimeMs: number;
  /** 小節内の拍数。 */
  lengthInBar: number;
  durationMs: number;
}

/** コード進行の1区間。出典 songmap.chords。name は和音記号文字列（"Fm"・"DbM7"・無和音は "N"）。 */
export interface Chord {
  index: number;
  name: string;
  startTimeMs: number;
  endTimeMs: number;
  durationMs: number;
}

/** 繰り返し区間。出典 songmap.segments（TextAliveの繰り返し区間）。サビ区間のみを示す疎な配列。
 *  必須項目「区間と反復」に対応し、三部形式の反復は diversityZones が補う。 */
export interface RepetitiveSegment {
  index: number;
  startTimeMs: number;
  endTimeMs: number;
  durationMs: number;
  isChorus: boolean;
}

/** 声量曲線。values[i] は時刻 i × stepMs の声量。出典 songmap.amplitudeCurve・amplitudeStep・maxVocalAmplitude。 */
export interface LoudnessCurve {
  stepMs: number;
  maxAmplitude: number;
  values: number[];
}

/** 感情曲線の1点。valence（明るさ）と arousal（興奮度）は0〜1。出典 songmap.vaCurve。 */
export interface EmotionPoint {
  tMs: number;
  valence: number;
  arousal: number;
}

/** 感情曲線。出典 songmap.vaCurve・valenceArousal.median。 */
export interface EmotionCurve {
  stepMs: number;
  points: EmotionPoint[];
  median: { valence: number; arousal: number };
}

/** 歌詞の1文字のタイミング。出典 songmap.phrases→words→chars を平坦化。
 *  フレーズ・単語の入れ子は埋め込まない（読ませる歌詞の構造はTextAliveから実行時に読む）。 */
export interface LyricChar {
  startTimeMs: number;
  endTimeMs: number;
  text: string;
}

/** 歌詞密度の1つの時間窓。 */
export interface LyricDensityWindow {
  startTimeMs: number;
  endTimeMs: number;
  charsPerSecond: number;
}

/** 歌詞密度。固定長の時間窓で曲全体を切れ目なく覆う。出典 docs/research/07-feasibility-and-parameters.md §2.6。 */
export interface LyricDensity {
  windowMs: number;
  windows: LyricDensityWindow[];
}

/** 無和音区間の埋め方。previous=直前和音を保持、scale=楽曲の調の音階。
 *  出典 docs/research/07-feasibility-and-parameters.md §1.2。 */
export type NcTreatment = "previous" | "scale";

/** 無和音区間。出典 docs/research/07-feasibility-and-parameters.md §1.2。 */
export interface NcRange {
  startTimeMs: number;
  endTimeMs: number;
  treatment: NcTreatment;
}

/** 見せ場。weight は0〜1の相対重み。isClimax が真は最終見せ場でちょうど1つ。
 *  出典 docs/decisions/app-overall-decisions.md §3.6、Issue #41。 */
export interface Showcase {
  index: number;
  startTimeMs: number;
  endTimeMs: number;
  weight: number;
  isClimax: boolean;
}

/** コードトーン格子の1区間。和音区間ごとに1要素で chords と1対1に対応する。
 *  pitches はY軸スロットの音高（MIDI番号）で、要素数はスロット数（既定7、範囲5〜9）。
 *  無和音区間では chordName は解決後の和音名または調の音階を表し "N" ではない。
 *  出典 docs/research/04-ux-and-chart-design.md §2、Issue #35・#36。 */
export interface ChordToneSlotRegion {
  startTimeMs: number;
  endTimeMs: number;
  chordName: string;
  pitches: number[];
}

/** ノーツ。timeMs は演出に使う実時刻、beatIndex は判定とJUST認定に使う拍格子の索引、
 *  slotIndex は1からスロット数まで（そのノーツのJUST音程＝slots の pitches の何番目か）、
 *  pattern は譜面パターン名（#39が確定）、trajectoryPosition はカメラ軌跡上の3次元位置
 *  （#40が確定、真下が楽曲終了後のひまわり位置）。判定の軌跡上距離と速さは camera と timeMs
 *  から #48 が導出するため保存しない。出典 docs/research/04-ux-and-chart-design.md §1・§4。 */
export interface Note {
  /** プロファイル内で一意の識別子。 */
  id: string;
  timeMs: number;
  beatIndex: number;
  slotIndex: number;
  pattern: string;
  trajectoryPosition: Vec3;
}

/** カメラ軌跡のキーフレーム。キーフレーム間はCatmull-Romスプラインで補間し、その補間を
 *  描画（#40・M2）と判定（#48）が共有する。出典 docs/research/04-ux-and-chart-design.md §4。 */
export interface CameraKeyframe {
  timeMs: number;
  position: Vec3;
  target: Vec3;
}

/** X軸の位置から効果の色への対応の停止点。x は0〜1、color は #RRGGBB 形式。 */
export interface ColorStop {
  x: number;
  color: string;
}

/** タップ効果の色。X軸の位置で効果の色が変わり得点に寄与しない。停止点は先頭 x=0・末尾 x=1 で
 *  全X範囲を覆い、間は消費側（#71・入力演出）が補間する。ひまわりと蝶の固定色は曲非依存のため
 *  ここに置かない。出典 docs/research/04-ux-and-chart-design.md §1、docs/decisions/app-overall-decisions.md §3.9。 */
export interface TapColors {
  xAxisStops: ColorStop[];
}

/** Web Audio の基本波形。 */
export type Waveform = "sine" | "square" | "sawtooth" | "triangle";

/** 操作音のエンベロープ（時間はミリ秒、sustain は0〜1の保持量）。 */
export interface Envelope {
  attackMs: number;
  decayMs: number;
  sustain: number;
  releaseMs: number;
}

/** 操作音の音色。発音周波数はスロット音高から導出するため持たない。
 *  300ヘルツ以下を削り1〜4キロヘルツに置く帯域。出典 docs/research/07-feasibility-and-parameters.md §1.3。 */
export interface SfxTimbre {
  waveform: Waveform;
  envelope: Envelope;
  bandpassLowHz: number;
  bandpassHighHz: number;
}

/** 操作音。通常時と投下時の2音色を持つ（投下でノーツ効果音の音色が変わる）。
 *  同時発音数の上限は曲非依存のため音声機構（#52）か tuning.ts が持つ。
 *  出典 docs/decisions/app-overall-decisions.md §3.6。 */
export interface Sfx {
  normal: SfxTimbre;
  powerUp: SfxTimbre;
}

/** 多様性逓減の三部形式における役割。 */
export type DiversityRole = "theme" | "variation" | "reprise";

/** 多様性逓減の区間（手動記述可）。theme=24秒地点の主題、variation=中盤の変奏、reprise=189秒地点の回帰。
 *  #46が手動記述、#42が自動化。出典 docs/decisions/app-overall-decisions.md §3.5、Issue #46。 */
export interface DiversityZone {
  startTimeMs: number;
  endTimeMs: number;
  role: DiversityRole;
  label: string;
}

/** 一回性のタップ上限。比率 limit / fullPossible は0.4〜0.8。
 *  曲固有の絶対値はプロファイルに置く（src/config/tuning.ts の注記、docs/research/07-feasibility-and-parameters.md §2.2、Issue #44）。 */
export interface TapBudget {
  fullPossible: number;
  limit: number;
}

/** 曲プロファイル。解析の必須項目と譜面派生フィールドを1つに集約する。 */
export interface SongProfile {
  /** スキーマ契約の版数。初期値1。想定版数と異なるプロファイルは拒否する。 */
  schemaVersion: number;
  song: SongIdentity;
  source: ProfileSource;
  /** 代表テンポ（毎分拍数）。拍ごとの正確な時刻は beats が持つ。TAKEOVERは175。★暫定。 */
  tempoBpm: number;
  musicalKey: MusicalKey;
  beats: Beat[];
  chords: Chord[];
  repetitiveSegments: RepetitiveSegment[];
  loudnessCurve: LoudnessCurve;
  emotionCurve: EmotionCurve;
  lyricChars: LyricChar[];
  lyricDensity: LyricDensity;
  ncRanges: NcRange[];
  showcases: Showcase[];
  slots: ChordToneSlotRegion[];
  notes: Note[];
  camera: CameraKeyframe[];
  colors: TapColors;
  sfx: Sfx;
  diversityZones: DiversityZone[];
  tapBudget: TapBudget;
}
