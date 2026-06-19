// rain 副領域の公開窓口。雨パーティクル（環境演出）を集約する。
// 本編の単一描画領域への結線は #15（層合成）・#59（通し統合）が担う。profiles・tools は import しない
// （依存規則 docs/decisions/architecture.md §5）。

export {
  createRainSystem,
  initRainPositions,
  normalizeCount,
  normalizeDeltaMs,
  stepRainColumn,
} from "./rain";
export type { RainSystem } from "./rain";
