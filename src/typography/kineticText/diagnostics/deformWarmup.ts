// 渦・波打ち両方の変形シェーダを先行コンパイルする（先行暖機）。
// 各種類で画面外・不透明度0の変形単位を出し、配置確定（sync）と描画を数フレーム行って GPU プログラムを
// 確定させ、その後に解放する。これをしないと、計測中に最初の変形単位を出す瞬間にシェーダの一度きりの
// コンパイル費用が乗り、初回表示遅延が大きく出る。
// 完了は「両種類について sync 後の描画を終え、暖機用の単位を解放した時点」とする。
import type { DeformKind, KineticTextEngine } from "../types";

const WARM_KINDS: readonly DeformKind[] = ["swirl", "wave"];

// 暖機で描くフレーム数。理由を先に述べる: troika は配置確定（sync）を別作業で非同期に行うため、
// 1フレームでは確定前にコンパイルが走らないことがある。既存の単一文字の暖機（diagnostics/main.ts）が
// 12フレーム回して確定を待つのに合わせ、同じ12フレームを用いる。
const WARM_FRAME_COUNT = 12;

export async function warmUpDeform(options: {
  engine: KineticTextEngine;
  /** 1フレーム描画する。診断ページの合成描画（composer.render など）を渡す。 */
  render: () => void;
  /** 暖機に使う1文字（出現する文字のいずれか）。 */
  sampleChar: string;
  fontName: string;
}): Promise<void> {
  const { engine, render, sampleChar, fontName } = options;
  const nextFrame = (): Promise<void> =>
    new Promise((resolve) => requestAnimationFrame(() => resolve()));

  const handles = WARM_KINDS.map((kind) =>
    engine.spawnDeformingText({
      text: sampleChar,
      fontName,
      // 画面外かつ不透明度0で出す。視錐台カリングは変形単位では無効なので、画面外でも描画されコンパイルされる。
      position: { x: 0, y: -1000, z: 0 },
      fontSize: 1,
      color: 0xffffff,
      opacity: 0,
      kind,
      params: { strength: 0.1, speed: 1, spatialFreq: 0.1, phaseOffset: 0 },
    })
  );

  for (let count = 0; count < WARM_FRAME_COUNT; count += 1) {
    await nextFrame();
    engine.update({ gameTimeMs: 0, frameDeltaMs: 16 });
    render();
  }

  for (const handle of handles) {
    handle.release();
  }
}
