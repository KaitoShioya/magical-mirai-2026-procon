// 平面反射からの物体除外（Issue #92）。反射テクスチャを描く処理だけを囲み、指定した物体をその間だけ
// 非表示にして反射から外す純粋な補助。three.js へ依存するのは型 Object3D のみで、描画器・シーンには依存しない。
//
// 採用理由を先に述べる。反射からの除外は Object3D.layers を使わない方針（Issue #92 のオーナー指示、
// src/rendering/README.md の取り込み・合成方針）のため、反射描画の直前直後で visible を切り替える。
// 平面反射（Reflector）は onBeforeRender の中で反射テクスチャ向けの描画を1回だけ行うため、その呼び出し
// だけを本補助で囲めば、反射からのみ物体が消え、本描画（および後処理）には物体が残る。

import type { Object3D } from "three";

/**
 * renderReflection（反射テクスチャを描く処理）を実行する間だけ、objects のうち表示中のものを非表示にする。
 * 実行後は、本補助が非表示にしたものだけを表示へ戻す。元から非表示だった物体には触れない。
 * renderReflection が例外を投げても、本補助が非表示にしたものの表示状態を必ず元へ戻す。
 *
 * 退避したものだけを戻す理由を先に述べる。読み込み前の中心オブジェクト差し替えなど、別の理由で元から
 * 非表示の物体を誤って表示にしないためである。
 * 例外時も戻す理由を先に述べる。反射描画が失敗しても、本描画に用いる表示状態を確実に回復するためである。
 */
export function withReflectionHidden(
  objects: Iterable<Object3D>,
  renderReflection: () => void
): void {
  const hidden: Object3D[] = [];
  for (const object of objects) {
    if (object.visible) {
      object.visible = false;
      hidden.push(object);
    }
  }
  try {
    renderReflection();
  } finally {
    for (const object of hidden) {
      object.visible = true;
    }
  }
}
