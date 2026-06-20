// キネティック文字エンジンの共有型。
// 依存規則（docs/decisions/architecture.md §5）: 判定・得点・時刻の論理を持たない。
// 時刻は数値（gameTimeMs・frameDeltaMs）で受け取り、profiles・tools は import しない。

import type { Scene, Camera } from "three";

// フォントの出典の型は、クレジットの共有型の層（src/types/credits.ts）に集約した。
// 取り込み経路を変えないよう、ここでは同名で再公開する。
import type { FontCredit } from "../../types/credits";
export type { FontCredit };

/** 登録されたフォント1件。 */
export interface FontEntry {
  /** 演出から参照する論理名。 */
  readonly name: string;
  /** フォントファイルのURL（troika対応形式 .woff）。 */
  readonly url: string;
  /** ウェイト（数値）。 */
  readonly weight: number;
  /** 出典情報。 */
  readonly credit: FontCredit;
  /**
   * 未収録文字を回す代替フォントの論理名（省略可能）。このフォントの収録範囲（暖めた文字集合）に無い文字を
   * 描くとき、ここで指定した論理名のフォントを使う。未指定のときは troika 既定フォントへ回す。
   * 代替フォントの具体資産（収録範囲・ファイルの大きさ・ライセンス）は統合（#33・#59）で決める。
   */
  readonly fallbackName?: string;
}

/** 論理名から実フォントを引く登録の仕組み。シーン・演出別の差し替えを担う。 */
export interface FontRegistry {
  register(entry: FontEntry): void;
  /** 論理名でフォントを引く。未登録のときは例外を投げる。 */
  resolve(name: string): FontEntry;
  list(): readonly FontEntry[];
}

/** 単一文字層と一括文字層それぞれの同時上限。 */
export interface LayerLimits {
  readonly single: number;
  readonly batched: number;
}

/** エンジン生成時に外から注入する依存。描画器は持たず、シーンとカメラを受け取る。 */
export interface EngineInitDeps {
  readonly scene: Scene;
  readonly camera: Camera;
  readonly fonts: FontRegistry;
  readonly limits: LayerLimits;
  /**
   * 画面の縦のデバイス画素数を返す（最小表示寸法の下限計算に使う）。
   * 省略時、または透視投影カメラでないとき、エンジンは寸法の下限を適用しない（合成側 #131 が適用する）。
   */
  readonly viewportPixelHeight?: () => number;
  /**
   * ブルーム閾値（線形空間の相対輝度）。発光抑制で塗りをこの値以下へ収める。
   * 既定 0.5。正典は src/rendering/constants.ts の BLOOM_THRESHOLD で、診断と本編はそこから渡す。
   */
  readonly bloomThreshold?: number;
  /**
   * 縁取りと影だけで不利な背景の代表集合に対し4.5:1へ届かないと計測で判明した場合に true。
   * 可読性下地を有効化する。既定 false。
   */
  readonly readabilityNeedsBacking?: boolean;
}

export interface Vector3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * 読ませる役の可読性属性（Issue #31）。色値は sRGB の16進で持つ（塗り色 color と同じ表現）。
 * 縁取りは troika の stroke 系、影は troika の outline 系へ対応づける。縁取りと影はいずれも暗い分離側で、
 * 発光抑制（明るい成分の輝度上限 maxBrightLuminance）の対象は塗りに限る。具体値は #33 が決め、本型は
 * 値を受け取る器である。幅・ずれ・ぼかしは数値（ワールド単位）か、fontSize に対する百分率の文字列（"14%" など）。
 */
export interface ReadabilityOptions {
  /** 縁取りの色（sRGBの16進）。troika strokeColor（stroke非対応時は outlineColor で代替）。 */
  readonly borderColor: number;
  /** 縁取りの幅。troika strokeWidth（代替時は outlineWidth）。 */
  readonly borderWidth: number | string;
  /** 縁取りの不透明度（0から1）。troika strokeOpacity（代替時は outlineOpacity）。 */
  readonly borderOpacity: number;
  /** 影の色（sRGBの16進）。troika outlineColor。 */
  readonly shadowColor: number;
  /** 影の太さ。troika outlineWidth。 */
  readonly shadowWidth: number | string;
  /** 影のずれ横。troika outlineOffsetX。 */
  readonly shadowOffsetX: number | string;
  /** 影のずれ縦。troika outlineOffsetY。 */
  readonly shadowOffsetY: number | string;
  /** 影のぼかし。troika outlineBlur。 */
  readonly shadowBlur: number | string;
  /** 影の不透明度（0から1）。troika outlineOpacity。 */
  readonly shadowOpacity: number;
  /** 明るい成分（塗り）の相対輝度の上限（0から1、線形空間）。発光抑制の上限。 */
  readonly maxBrightLuminance: number;
  /** 最小画面画素高（デバイス画素）。大きさの段で満たす下限。 */
  readonly minPixelHeight: number;
}

/** troika の機能のうち、可読性に使うものが実体で効くかの可否（実行時に判定して保持する）。 */
export interface ReadabilityCapability {
  /** 縁取り用の stroke 系（strokeWidth・strokeColor・strokeOpacity）が使えるか。 */
  readonly stroke: boolean;
  /** 影用の outline のずれ（outlineOffsetX・outlineOffsetY）が使えるか。 */
  readonly outlineOffset: boolean;
  /** 影用の outline のぼかし（outlineBlur）が使えるか。 */
  readonly outlineBlur: boolean;
}

/** 読ませる役の描画モード。縁取りと影の競合を明示で解消する（プラン「解決済みの描画モード」）。 */
export type ReadabilityMode = "borderAndShadow" | "borderOnly" | "borderAndBacking";

/** 可読性下地の形。無し／文字形の暗い複製／単位背面の暗い面。 */
export type ReadabilityBacking = "none" | "glyphCopy" | "unitPlate";

/**
 * 確定可読性指定。可読性属性と機能可否から確定した、実際に適用する値の集合。
 * #131 の合成の段に対応づけて持つ（大きさの段・発光の段・最後段の可読性補正）。
 */
export interface ResolvedReadabilityStyle {
  // 大きさの段
  readonly minPixelHeight: number;
  // 発光の段
  /** 発光抑制で上限以下へ収めた塗り色（sRGBの16進）。 */
  readonly fillColor: number;
  /** 明るい成分の相対輝度の上限（線形）。 */
  readonly maxBrightLuminance: number;
  /** 明るい成分をブルーム閾値以下へ抑えるか。 */
  readonly clampBrightBelowBloom: boolean;
  // 最後段の可読性補正
  readonly mode: ReadabilityMode;
  /** 縁取りを stroke と outline のどちらで描くか。 */
  readonly borderVia: "stroke" | "outline";
  /** 別建ての影（outline のずれとぼかし）を持つか。 */
  readonly hasShadow: boolean;
  readonly backing: ReadabilityBacking;
  readonly borderColor: number;
  readonly borderWidth: number | string;
  readonly borderOpacity: number;
  readonly shadowColor: number;
  readonly shadowWidth: number | string;
  readonly shadowOffsetX: number | string;
  readonly shadowOffsetY: number | string;
  readonly shadowBlur: number | string;
  readonly shadowOpacity: number;
}

/** 単一文字層へ1文字を出す要求。 */
export interface GlyphSpawnRequest {
  readonly char: string;
  readonly fontName: string;
  readonly position: Vector3Like;
  readonly fontSize: number;
  /** 16進の色（例: 0xffffff）。 */
  readonly color: number;
  readonly opacity: number;
  /** 表示残存時間（ミリ秒）。これを過ぎると update で自動解放する。省略時は自動解放しない。 */
  readonly lifetimeMs?: number;
  /** 可読性属性。与えると読ませる役として可読性処理を適用する。省略時は演出役として現状の挙動。 */
  readonly readability?: ReadabilityOptions;
}

/** 一括文字層へフレーズを出す要求。 */
export interface PhraseSpawnRequest {
  readonly text: string;
  readonly fontName: string;
  /** フレーズ先頭の基準位置。 */
  readonly position: Vector3Like;
  /** 文字間隔（横方向、ワールド単位）。 */
  readonly letterSpacing: number;
  readonly fontSize: number;
  readonly color: number;
  readonly opacity: number;
  readonly lifetimeMs?: number;
  /** 可読性属性。与えると読ませる役として可読性処理を適用し、既定で単一文字層で描く。省略時は演出役。 */
  readonly readability?: ReadabilityOptions;
}

/**
 * 出した文字（または文字群）を後から操作する取っ手。
 * エンジンは演出意図を持たず、動き（位置・回転・大きさ・色・不透明度）の指定は呼び出し側が行う。
 */
export interface GlyphHandle {
  setPosition(x: number, y: number, z: number): void;
  /** オイラー角（ラジアン）で回転を設定する。 */
  setRotation(x: number, y: number, z: number): void;
  setScale(scale: number): void;
  setColor(color: number): void;
  setOpacity(opacity: number): void;
  /**
   * 最後段の可読性補正を適用し直す（Issue #31）。確定可読性指定の塗り色・縁取り・影を反映する。
   * 寸法は変えない（寸法の下限は大きさの段で扱う）。#131 が合成の最後段で呼ぶことを想定する。
   */
  applyReadability(style: ResolvedReadabilityStyle): void;
  /** 表示を終え、資源をプールへ返す。冪等。 */
  release(): void;
}

export interface EngineUpdateArgs {
  readonly gameTimeMs: number;
  readonly frameDeltaMs: number;
}

/** 診断用の内部状態。 */
export interface EngineStats {
  readonly activeGlyphs: number;
  readonly pooledGlyphs: number;
  readonly activeBatchedMembers: number;
  /** 未収録文字を代替フォント（または troika 既定）へ回した延べ回数。 */
  readonly fallbackFontUses: number;
  /** フォントの取得に失敗して代替へ回した延べ回数。 */
  readonly fontLoadFailures: number;
  /** 可読性下地を有効化して描いた現在数（#131 の性能合算へ渡す費用の一部）。 */
  readonly activeBackings: number;
}

export interface KineticTextEngine {
  /** 指定文字の距離場を事前生成して暖める。 */
  warmUp(characters: string): Promise<void>;
  spawnGlyph(request: GlyphSpawnRequest): GlyphHandle;
  spawnPhrase(request: PhraseSpawnRequest): GlyphHandle;
  /** 毎フレームの寿命処理（自動解放）とカメラ正対を行う。 */
  update(args: EngineUpdateArgs): void;
  dispose(): void;
  stats(): EngineStats;
}
