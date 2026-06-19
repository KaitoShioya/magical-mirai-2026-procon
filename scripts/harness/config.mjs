// 品質検査ハーネスの共通定数。接続先・出力先・GPU起動設定・計測時間・端末プロファイルを一元化する。
// ブラウザ起動部品（Playwright）を読み込まない。

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const harnessDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(harnessDir, "..", "..");

// 接続先の既定。runbookは別端末で `npm run dev`（5173番）を起動して BASE を渡す手順を案内する。
export const BASE = process.env.BASE || "http://localhost:5173";

// ローカル実行の出力先（レポートJSONと撮影）。.gitignore 済みの一時生成物。
export const OUT_DIR = join(repoRoot, "scripts", ".quality-out");

// 描画性能検証ツールの入口。
export const PROTOTYPE_PATH = "/prototype.html";

// 起動経路の既定。Playwright公式で channel:"chromium" は新しいヘッドレスモード（GPU適性あり）の
// 有効化手段。既定ヘッドレスは軽量シェルでGPU能力が限定されるため、既定をこれにする。
export const DEFAULT_CHANNEL = "chromium";

// ANGLEバックエンドの既定。WindowsのハードウェアDirectX経路。
export const DEFAULT_ANGLE = "d3d11";

// 計測時間の既定（ミリ秒）。採用理由を先に述べる。500ミリ秒区間ごとに1標本が記録されるため、
// 下位5パーセンタイルが最小値と一致しない（順位2以上になる）には標本数21以上、すなわち10.5秒超が
// 要る。余裕を見て12秒（24区間）を既定とする。
export const DEFAULT_SAMPLE_DURATION_MS = 12000;

// ウォームアップ時間（ミリ秒）。計測開始直後の不安定な区間を計測に含めないため。
export const DEFAULT_WARMUP_MS = 1500;

/**
 * GPU有効化の起動引数を組み立てる。
 * @param {string} angle ANGLEバックエンド（d3d11 など）
 * @returns {string[]}
 */
export function buildGpuArgs(angle) {
  return [
    "--use-gl=angle",
    "--use-angle=" + angle,
    "--enable-gpu",
    "--ignore-gpu-blocklist",
  ];
}

// 端末プロファイル。デスクトップとモバイル相当の2系統で計測する。
// 処理速度の絞り（cpuThrottle）は1で絞らない。モバイル相当は実機の負荷に近づけるため絞る。
export const PROFILES = [
  {
    name: "desktop",
    query: "refl=512&bloomScale=0.5&points=300",
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    isMobile: false,
    cpuThrottle: 1,
  },
  {
    name: "mobile",
    query: "refl=512&bloomScale=0.5&points=300&dpr=2",
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    cpuThrottle: 6,
  },
];
