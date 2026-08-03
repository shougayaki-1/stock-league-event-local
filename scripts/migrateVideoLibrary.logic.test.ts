import { describe, expect, it } from "vitest";
import { buildVideoLibraryEntries, type LegacyVideoSource } from "./migrateVideoLibrary.logic";
import type { CloudVideoAsset } from "../src/lib/cloudVideos";

const asset: CloudVideoAsset = {
  storagePath: "signage/breaking-shared/abc-123-video.mp4",
  downloadUrl: "https://example.test/video.mp4",
  version: "123",
  updatedAt: 123,
  contentType: "video/mp4",
  size: 100,
  fileName: "video.mp4",
};

describe("buildVideoLibraryEntries", () => {
  it("creates deterministic video_library ids from legacy sources", () => {
    const sources: LegacyVideoSource[] = [
      { collectionPath: "breaking_videos", docId: "bv1", fieldPath: "videoAsset", name: "速報A", videoAsset: asset },
    ];
    const result = buildVideoLibraryEntries(sources);
    expect(result).toHaveLength(1);
    expect(result[0].videoId).toBe("legacy_breaking_videos_bv1_videoAsset");
    expect(result[0].name).toBe("速報A");
    expect(result[0].videoAsset).toBe(asset);
  });

  it("sanitizes nested field paths for stable ids", () => {
    const sources: LegacyVideoSource[] = [
      { collectionPath: "riddle_rooms", docId: "room 1", fieldPath: "videoAssets.entrance.video/1", name: "導入", videoAsset: asset },
    ];
    const result = buildVideoLibraryEntries(sources);
    expect(result[0].videoId).toBe("legacy_riddle_rooms_room_1_videoAssets_entrance_video_1");
  });
});
