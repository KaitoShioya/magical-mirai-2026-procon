// 品質検査ハーネスのモード判定（純粋）。
// ローカル（手元のGPU環境で描画・撮影・指標抽出）か、クラウド（GPU無しのCIでファイル存在と
// スキーマ検査だけ）かを決める。実行そのものは run-local.mjs / run-cloud.mjs が担い、本ファイルは
// 判定だけを担う。これによりクラウド経路がブラウザ起動部品の読み込みに到達しない構造を保つ。

/**
 * 実行モードを決める。
 * 優先順位は、起動引数 --mode の明示 ＞ 環境変数 HARNESS_MODE ＞ CI検出（CI が "true" ならクラウド）
 * ＞ 既定ローカル、とする。
 * @param {{ cliMode?: string, env?: Record<string, string | undefined> }} options
 * @returns {"local" | "cloud"}
 */
export function resolveMode(options = {}) {
  const { cliMode, env = process.env } = options;
  if (cliMode === "local" || cliMode === "cloud") {
    return cliMode;
  }
  const harnessMode = env.HARNESS_MODE;
  if (harnessMode === "local" || harnessMode === "cloud") {
    return harnessMode;
  }
  if (env.CI === "true") {
    return "cloud";
  }
  return "local";
}
