import { describe, expect, it } from "vitest";
import { buildCloudVideoAttachmentUrl, buildCloudVideoDownloadFileName, formatCloudVideoDownloadError } from "./cloudVideos";

describe("formatCloudVideoDownloadError", () => {
  it("points operators to CORS or network settings for browser download failures", () => {
    expect(formatCloudVideoDownloadError(new TypeError("Failed to fetch"))).toBe("取得失敗: Storage CORS設定またはネットワークを確認してください");
    expect(formatCloudVideoDownloadError(new Error("動画の取得中にネットワークエラーが発生しました。"))).toBe("取得失敗: Storage CORS設定またはネットワークを確認してください");
  });

  it("identifies permission failures", () => {
    expect(formatCloudVideoDownloadError(new Error("動画の取得に失敗しました。HTTP 403"))).toBe("取得失敗: Storageの読み取り権限を確認してください");
    expect(formatCloudVideoDownloadError({ code: "storage/unauthorized" })).toBe("取得失敗: Storageの読み取り権限を確認してください");
  });

  it("identifies missing storage objects", () => {
    expect(formatCloudVideoDownloadError(new Error("動画の取得に失敗しました。HTTP 404"))).toBe("取得失敗: Storage上の動画ファイルが見つかりません");
    expect(formatCloudVideoDownloadError({ code: "storage/object-not-found" })).toBe("取得失敗: Storage上の動画ファイルが見つかりません");
  });
});

describe("buildCloudVideoAttachmentUrl", () => {
  it("adds a content disposition override for browser downloads", () => {
    const url = buildCloudVideoAttachmentUrl("https://firebasestorage.googleapis.com/v0/b/app/o/video.mp4?alt=media&token=abc", "イベントCM.mp4");
    const parsed = new URL(url);

    expect(parsed.searchParams.get("alt")).toBe("media");
    expect(parsed.searchParams.get("token")).toBe("abc");
    expect(parsed.searchParams.get("response-content-disposition")).toBe("attachment; filename=\"CM.mp4\"; filename*=UTF-8''%E9%96%8B%E6%88%90CM.mp4");
  });
});

describe("buildCloudVideoDownloadFileName", () => {
  it("uses the video title and keeps the asset extension", () => {
    expect(buildCloudVideoDownloadFileName("イベントCM", { fileName: "asset-id-optimized.mp4", status: "ready" })).toBe("イベントCM.mp4");
  });

  it("does not append an extension when the title already has one", () => {
    expect(buildCloudVideoDownloadFileName("イベントCM.webm", { fileName: "source.mp4", status: "ready" })).toBe("イベントCM.webm");
  });

  it("replaces characters that cannot be used in downloaded file names", () => {
    expect(buildCloudVideoDownloadFileName("day1/opening:movie", { contentType: "video/mp4", status: "ready" })).toBe("day1_opening_movie.mp4");
  });
});
