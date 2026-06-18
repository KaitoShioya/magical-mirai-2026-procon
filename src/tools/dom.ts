// 開発ツールが使う最小のDOM補助。
// strict（厳格な型検査）下で取得結果の null を除去し、期待する具体型に絞って返す。

/**
 * id で要素を取得する。見つからなければ例外を投げて非null（必ず存在する）ことを保証し、
 * 呼び出し側が指定した具体型（HTMLSelectElement など）として返す。
 * getElementById は HTMLElement を返すため、型引数は HTMLElement の派生に限る。
 */
export function requireElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`要素 #${id} が見つかりません`);
  }
  return el as T;
}
