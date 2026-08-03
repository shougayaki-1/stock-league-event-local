import { describe, expect, it } from "vitest";
import { buildPublicSignageAutoSyncEntries, buildPublicSignagePredownloadEntries } from "./publicSignageVideoEntries";
import type { CloudVideoAsset } from "./cloudVideos";
import type { VideoLibraryItem } from "../types/videoLibrary";

const asset = (id: string): CloudVideoAsset => ({
  storagePath: `signage/${id}.mp4`,
  downloadUrl: `https://example.com/${id}.mp4`,
  version: id,
  size: 100,
  contentType: "video/mp4",
  updatedAt: 1,
  fileName: `${id}.mp4`,
});

const video = (id: string, name = id, volumeGain?: number): VideoLibraryItem => ({
  id,
  name,
  videoAsset: asset(id),
  volumeGain,
  createdAt: 1,
  updatedAt: 1,
});

describe("publicSignageVideoEntries", () => {
  it("builds unique cache entries from playlist, breaking, overrides, and scheduled events", () => {
    const entries = buildPublicSignageAutoSyncEntries({
      playlist: [{ mode: "FULL_MOVIE", duration: 30, videoAssetId: "v1" }],
      videoLibrary: [video("v1", "Main"), video("v2", "Breaking"), video("v3", "Manual")],
      breakingVideoId: "v2",
      scenarioOverride: { eventId: "e1", mode: "FULL_MOVIE", videoAssetId: "v1" },
      manualOverride: { mode: "FULL_MOVIE", videoAssetId: "v3" },
      scenarioEvents: [{ id: "e2", breakingVideoId: "v2", signageAction: { signageId: "sig1", mode: "FULL_MOVIE", duration: 30, videoAssetId: "v3", kind: "NORMAL" } } as never],
      signageId: "sig1",
    });

    expect(entries.map(entry => entry.key)).toEqual(["0", "breaking_v2", "scenario_e1", "manual_v3", "scenario_e2"]);
  });

  it("adds every library video as breaking and manual candidates for predownload without duplicating active entries", () => {
    const autoEntries = buildPublicSignageAutoSyncEntries({
      playlist: [],
      videoLibrary: [video("v1"), video("v2")],
      breakingVideoId: "v1",
      scenarioOverride: null,
      manualOverride: null,
      scenarioEvents: [],
      signageId: "sig1",
    });

    expect(buildPublicSignagePredownloadEntries(autoEntries, [video("v1"), video("v2")]).map(entry => entry.key))
      .toEqual(["breaking_v1", "manual_v1", "breaking_v2", "manual_v2"]);
  });

  it("carries the library volume gain into playback entries", () => {
    const entries = buildPublicSignageAutoSyncEntries({
      playlist: [{ mode: "FULL_MOVIE", duration: 30, videoAssetId: "v1" }],
      videoLibrary: [video("v1", "Main", 0.42)],
      breakingVideoId: null,
      scenarioOverride: null,
      manualOverride: null,
      scenarioEvents: [],
      signageId: "sig1",
    });

    expect(entries[0]?.volumeGain).toBe(0.42);
  });
});
