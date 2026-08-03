import { describe, expect, it } from "vitest";
import { findVideoReferences, type VideoLibraryUsageSnapshot } from "./videoLibraryGuards";

const emptySnapshot: VideoLibraryUsageSnapshot = { events: [], newsPresets: [], riddleRooms: [], publicSignages: [] };

describe("findVideoReferences", () => {
  it("returns empty array when the video is unused", () => {
    expect(findVideoReferences("vid1", emptySnapshot)).toEqual([]);
  });

  it("finds references from a news preset", () => {
    const snapshot: VideoLibraryUsageSnapshot = {
      ...emptySnapshot,
      newsPresets: [{ id: "np1", name: "速報セット", breakingVideoId: "vid1", signageDisplay: { videoAssetId: "vid1" } }],
    };
    expect(findVideoReferences("vid1", snapshot)).toEqual([
      { kind: "news_preset", label: "ニュースプリセット「速報セット」の速報動画" },
      { kind: "news_preset", label: "ニュースプリセット「速報セット」のサイネージ動画" },
    ]);
  });

  it("finds a reference from a scenario event", () => {
    const snapshot: VideoLibraryUsageSnapshot = {
      ...emptySnapshot,
      events: [{ id: "ev1", breakingVideoId: "vid1" }, { id: "ev2", breakingVideoId: "other" }],
    };
    expect(findVideoReferences("vid1", snapshot)).toEqual([
      { kind: "event", label: "イベント ev1" },
    ]);
  });

  it("finds a reference from a riddle room step tvAction", () => {
    const snapshot: VideoLibraryUsageSnapshot = {
      ...emptySnapshot,
      riddleRooms: [{
        id: "room1",
        name: "教室A",
        steps: [{ name: "導入", tvActions: { entrance: { videoAssetId: "vid1" } } }],
      }],
    };
    expect(findVideoReferences("vid1", snapshot)).toEqual([
      { kind: "riddle_step", label: "謎解き部屋「教室A」 / ステップ「導入」" },
    ]);
  });

  it("finds references from a public signage playlist and manual override", () => {
    const snapshot: VideoLibraryUsageSnapshot = {
      ...emptySnapshot,
      publicSignages: [{
        id: "sig1",
        name: "入口サイネージ",
        playlist: [{ videoAssetId: "vid1" }],
        manualOverride: { videoAssetId: "vid1" },
      }],
    };
    expect(findVideoReferences("vid1", snapshot)).toEqual([
      { kind: "signage_playlist", label: "サイネージ「入口サイネージ」のプレイリスト" },
      { kind: "signage_manual", label: "サイネージ「入口サイネージ」の手動送出" },
    ]);
  });
});
