import { describe, expect, it } from "vitest";
import {
  buildArtifactFile,
  composeShareText,
  shareArtifact,
  type ShareEnvironment,
} from "./share";

function makeBlob(type: string): Blob {
  return new Blob([new Uint8Array([1, 2, 3])], { type });
}

/** 呼び出しを記録する擬似環境を作る。fileShare で hasFileShare の返り、shareResult で shareWithFile の返り、copyResult で copyText の返りを決める。 */
function fakeEnv(options: {
  fileShare: boolean;
  shareResult?: boolean;
  copyResult?: boolean;
}): ShareEnvironment & {
  calls: { shareWithFile: number; copyText: number; downloadFile: number };
} {
  const calls = { shareWithFile: 0, copyText: 0, downloadFile: 0 };
  return {
    calls,
    hasFileShare: () => options.fileShare,
    shareWithFile: async () => {
      calls.shareWithFile += 1;
      return options.shareResult ?? true;
    },
    copyText: async () => {
      calls.copyText += 1;
      return options.copyResult ?? true;
    },
    downloadFile: () => {
      calls.downloadFile += 1;
    },
  };
}

describe("buildArtifactFile ファイルの種別と拡張子", () => {
  it("画像の種別から拡張子と File.type を揃える", () => {
    expect(buildArtifactFile(makeBlob("image/png"), "art").name).toBe("art.png");
    expect(buildArtifactFile(makeBlob("image/webp"), "art").name).toBe("art.webp");
    expect(buildArtifactFile(makeBlob("image/jpeg"), "art").name).toBe("art.jpg");
    const file = buildArtifactFile(makeBlob("image/webp"), "art");
    expect(file.type).toBe("image/webp");
  });
});

describe("composeShareText 共有テキスト", () => {
  it("作品名・曲名・スコア・ランク・ハッシュタグを含む", () => {
    const text = composeShareText({
      appTitle: "あなたが奏でた湖",
      songTitle: "TAKEOVER",
      songArtist: "Twinfield",
      scoreText: "12345",
      rankText: "S",
    });
    expect(text).toContain("あなたが奏でた湖");
    expect(text).toContain("TAKEOVER / Twinfield");
    expect(text).toContain("スコア 12345（ランク S）");
    expect(text).toContain("#マジカルミライ2026");
  });
});

describe("shareArtifact 端末による切り替え", () => {
  const payload = { text: "共有文", baseFileName: "art" };

  it("ファイル共有対応の端末は共有シートで共有する", async () => {
    const env = fakeEnv({ fileShare: true, shareResult: true });
    const outcome = await shareArtifact({ ...payload, blob: makeBlob("image/webp") }, env);
    expect(outcome).toEqual({ method: "web-share", shared: true });
    expect(env.calls.shareWithFile).toBe(1);
    expect(env.calls.downloadFile).toBe(0);
  });

  it("中断（利用者が閉じた）は共有不成立だが正常終了", async () => {
    const env = fakeEnv({ fileShare: true, shareResult: false });
    const outcome = await shareArtifact({ ...payload, blob: makeBlob("image/webp") }, env);
    expect(outcome).toEqual({ method: "web-share", shared: false });
  });

  it("ファイル共有非対応の端末は保存とテキスト複写へ切り替える", async () => {
    const env = fakeEnv({ fileShare: false });
    const outcome = await shareArtifact({ ...payload, blob: makeBlob("image/png") }, env);
    expect(outcome).toEqual({ method: "download-and-copy", shared: true });
    expect(env.calls.downloadFile).toBe(1);
    expect(env.calls.copyText).toBe(1);
    expect(env.calls.shareWithFile).toBe(0);
  });

  it("画像が無い端末はテキストのみで成立させる", async () => {
    const env = fakeEnv({ fileShare: false, copyResult: true });
    const outcome = await shareArtifact({ ...payload, blob: null }, env);
    expect(outcome).toEqual({ method: "text-only", shared: true });
    expect(env.calls.copyText).toBe(1);
    expect(env.calls.downloadFile).toBe(0);
  });
});
