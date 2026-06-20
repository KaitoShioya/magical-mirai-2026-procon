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
}

export interface Vector3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
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
