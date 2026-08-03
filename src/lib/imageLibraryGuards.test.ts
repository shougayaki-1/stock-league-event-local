import { describe, expect, it } from "vitest";
import { findImageReferences, type ImageLibraryUsageSnapshot } from "./imageLibraryGuards";

describe("findImageReferences", () => {
  it("finds image references in saved playlists and public signages", () => {
    const snapshot: ImageLibraryUsageSnapshot = {
      signagePlaylists: [
        {
          id: "playlist1",
          name: "朝のCM",
          items: [{ imageAssetId: "img1" }, { imageAssetId: "img2" }],
        },
      ],
      publicSignages: [
        {
          id: "signage1",
          name: "廊下",
          playlist: [{ imageAssetId: "img1" }],
          manualOverride: { imageAssetId: "img3" },
        },
      ],
    };

    expect(findImageReferences("img1", snapshot)).toEqual([
      { kind: "signage_playlist", label: "プレイリスト「朝のCM」" },
      { kind: "signage_playlist", label: "サイネージ「廊下」のプレイリスト" },
    ]);
    expect(findImageReferences("img3", snapshot)).toEqual([
      { kind: "signage_manual", label: "サイネージ「廊下」の手動送出" },
    ]);
  });

  it("returns an empty array when the image is unused", () => {
    const snapshot: ImageLibraryUsageSnapshot = {
      signagePlaylists: [{ id: "playlist1", name: "未使用確認", items: [{ imageAssetId: "img1" }] }],
      publicSignages: [{ id: "signage1", name: "廊下", playlist: [], manualOverride: null }],
    };

    expect(findImageReferences("unused", snapshot)).toEqual([]);
  });
});
