// audio サブシステムの公開窓口。統括（src/app）と受け入れ診断が、エンジン生成関数と型だけを用いる。
// 内部実装（音声グラフ・純粋ロジック）は外へ公開しない。

export { createOperationSoundEngine } from "./operationSoundEngine";
export type { OperationSoundEngine, EngineContextState } from "./types";
