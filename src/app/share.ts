// 成果物の共有機構（成果物タスク #70）。端末がファイル共有に対応していれば共有シートへ、対応していなければ
// 画像の保存とテキストの複写へ自動で切り替える。外部サーバーは用いず、端末の機能だけで成立させる。
//
// 結線（src/app）の責務に置く理由を先に述べる。navigator のファイル共有・クリップボード・保存リンクという
// プラットフォーム能力の取りまとめは、画面の文書要素を作る src/ui ではなく、結線の src/app の責務である
// （docs/decisions/architecture.md §4。既存の overlay.ts・attribution.ts と同じ位置付け）。
//
// 分岐の論理を単体テストできるよう、プラットフォーム操作を環境オブジェクト（ShareEnvironment）へ分離して注入する。
// 本物の環境は createBrowserShareEnvironment が navigator・document から組み立てる。

/** 実際に取られた共有の方法。 */
export type ShareMethod = "web-share" | "download-and-copy" | "text-only";

/** 共有の結果。method は取られた方法、shared は共有・保存が成立したか。 */
export interface ShareOutcome {
  method: ShareMethod;
  shared: boolean;
}

/** 共有に渡す内容。画像が無い端末（描画不可）では blob を null にする。 */
export interface SharePayload {
  /** 成果物画像。null のときはテキストのみで共有・保存を成立させる。 */
  blob: Blob | null;
  /** 共有・保存に添えるテキスト（作品名・曲名・スコア・ランクと推奨ハッシュタグ）。 */
  text: string;
  /** 保存・共有するファイル名の拡張子を除いた部分（拡張子は画像の種別から決める）。 */
  baseFileName: string;
}

/** プラットフォーム操作の窓口。本物は createBrowserShareEnvironment、テストは擬似実装を注入する。 */
export interface ShareEnvironment {
  /** この端末がこのファイルを共有シートで共有できるか（ファイル共有対応かつ共有関数あり）。 */
  hasFileShare(file: File): boolean;
  /** ファイルとテキストを共有シートで共有する。共有できたら true、利用者が閉じた（中断）ら false。 */
  shareWithFile(file: File, text: string): Promise<boolean>;
  /** テキストをクリップボードへ複写する。複写できたら true。 */
  copyText(text: string): Promise<boolean>;
  /** ファイルを端末へ保存する（保存リンクの押下）。 */
  downloadFile(file: File): void;
}

/** 画像の種別から保存・共有のファイル名の拡張子を決める。 */
function extensionForType(type: string): string {
  if (type === "image/png") {
    return "png";
  }
  if (type === "image/webp") {
    return "webp";
  }
  if (type === "image/jpeg") {
    return "jpg";
  }
  // 想定外の種別は汎用の拡張子にする（種別と拡張子の食い違いを避けるための保険）。
  return "bin";
}

/**
 * 画像から、種別に一致した名前と種別を持つファイルを作る。理由を先に述べる。共有シートはファイルの種別と拡張子の
 * 一致を要求するため、実際の画像の種別から拡張子と File.type を同じ値で揃える。
 */
export function buildArtifactFile(blob: Blob, baseFileName: string): File {
  const extension = extensionForType(blob.type);
  return new File([blob], `${baseFileName}.${extension}`, { type: blob.type });
}

/** 共有・保存に添えるテキストを組み立てる。作品名・曲名・スコア・ランクと推奨ハッシュタグを含める。 */
export function composeShareText(input: {
  appTitle: string;
  songTitle: string;
  songArtist: string;
  scoreText: string;
  rankText: string;
}): string {
  return [
    `「${input.appTitle}」で深夜の湖を灯しました`,
    `♪ ${input.songTitle} / ${input.songArtist}`,
    `スコア ${input.scoreText}（ランク ${input.rankText}）`,
    "#マジカルミライ2026 #初音ミク #TextAlive",
  ].join("\n");
}

/**
 * 成果物を共有または保存する（成果物タスク #70）。端末により方法を切り替える。
 * 画像があり、端末がファイル共有に対応していれば共有シートを開く。対応していなければ、画像を保存してテキストを複写する。
 * 画像が無い端末ではテキストのみを複写して成立させる。
 * ファイルの種別・名前の拡張子・共有の判定・実際の画像の種別を1つの分岐の中で同じ値に揃える（食い違いを避ける）。
 */
export async function shareArtifact(
  payload: SharePayload,
  env: ShareEnvironment
): Promise<ShareOutcome> {
  if (payload.blob !== null) {
    const file = buildArtifactFile(payload.blob, payload.baseFileName);
    if (env.hasFileShare(file)) {
      const shared = await env.shareWithFile(file, payload.text);
      return { method: "web-share", shared };
    }
    // ファイル共有に非対応。画像を保存し、テキストを複写する。
    env.downloadFile(file);
    await env.copyText(payload.text);
    return { method: "download-and-copy", shared: true };
  }
  // 画像が無い端末。テキストのみで成立させる。
  const copied = await env.copyText(payload.text);
  return { method: "text-only", shared: copied };
}

/**
 * 本物のプラットフォーム操作の窓口を navigator・document から組み立てる。
 * 共有のユーザー操作の活性化が切れないよう、呼び出し側は押下ハンドラ内で画像化と共有を長い待機を入れず連続実行する。
 */
export function createBrowserShareEnvironment(
  nav: Navigator = navigator,
  doc: Document = document
): ShareEnvironment {
  return {
    hasFileShare(file: File): boolean {
      return (
        typeof nav.share === "function" &&
        typeof nav.canShare === "function" &&
        nav.canShare({ files: [file] })
      );
    },
    async shareWithFile(file: File, text: string): Promise<boolean> {
      try {
        await nav.share({ files: [file], text });
        return true;
      } catch (error) {
        // 利用者が共有シートを閉じた（中断）場合は失敗でなく正常終了として扱う。それ以外の異常は呼び出し側へ投げる。
        if (error instanceof DOMException && error.name === "AbortError") {
          return false;
        }
        throw error;
      }
    },
    async copyText(text: string): Promise<boolean> {
      if (nav.clipboard && typeof nav.clipboard.writeText === "function") {
        try {
          await nav.clipboard.writeText(text);
          return true;
        } catch {
          return false;
        }
      }
      return false;
    },
    downloadFile(file: File): void {
      const url = URL.createObjectURL(file);
      const anchor = doc.createElement("a");
      anchor.href = url;
      anchor.download = file.name;
      doc.body.append(anchor);
      anchor.click();
      anchor.remove();
      // 生成したオブジェクトURLを解放する（保持し続けるとメモリが残るため）。
      URL.revokeObjectURL(url);
    },
  };
}
