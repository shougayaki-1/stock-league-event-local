import { describe, expect, it } from "vitest";
import { groupVideoLibraryItems, nextGroupOrder, sortGroupsByOrder, UNGROUPED_LABEL } from "./videoGroups";
import type { VideoGroup } from "../types/videoGroup";
import type { VideoLibraryItem } from "../types/videoLibrary";

const makeGroup = (id: string, order: number, name = id): VideoGroup => ({
  id,
  name,
  order,
  createdAt: 0,
  updatedAt: 0,
});

const makeVideo = (id: string, groupId?: string): VideoLibraryItem => ({
  id,
  name: id,
  videoAsset: {
    storagePath: `signage/video-library/${id}.mp4`,
    downloadUrl: `https://example.test/${id}.mp4`,
    version: "1",
    updatedAt: 0,
    contentType: "video/mp4",
    size: 10,
    fileName: `${id}.mp4`,
  },
  groupId,
  createdAt: 0,
  updatedAt: 0,
});

describe("sortGroupsByOrder", () => {
  it("sorts groups ascending by order", () => {
    const groups = [makeGroup("c", 5), makeGroup("a", 0), makeGroup("b", 2)];
    expect(sortGroupsByOrder(groups).map(g => g.id)).toEqual(["a", "b", "c"]);
  });
});

describe("nextGroupOrder", () => {
  it("returns 0 when there are no groups", () => {
    expect(nextGroupOrder([])).toBe(0);
  });

  it("returns max order + 1 when groups exist", () => {
    expect(nextGroupOrder([makeGroup("a", 0), makeGroup("b", 3)])).toBe(4);
  });
});

describe("groupVideoLibraryItems", () => {
  it("buckets videos into their group in order, ungrouped last", () => {
    const groups = [makeGroup("g2", 1, "グループ2"), makeGroup("g1", 0, "グループ1")];
    const videos = [makeVideo("v1", "g1"), makeVideo("v2"), makeVideo("v3", "g2")];
    const sections = groupVideoLibraryItems(videos, groups);
    expect(sections.map(s => s.groupId)).toEqual(["g1", "g2", null]);
    expect(sections[0].videos.map(v => v.id)).toEqual(["v1"]);
    expect(sections[1].videos.map(v => v.id)).toEqual(["v3"]);
    expect(sections[2].videos.map(v => v.id)).toEqual(["v2"]);
    expect(sections[2].name).toBe(UNGROUPED_LABEL);
  });

  it("omits the ungrouped section when every video has a valid group", () => {
    const groups = [makeGroup("g1", 0)];
    const videos = [makeVideo("v1", "g1")];
    const sections = groupVideoLibraryItems(videos, groups);
    expect(sections).toHaveLength(1);
  });

  it("treats a video whose groupId no longer matches any group as ungrouped", () => {
    const groups = [makeGroup("g1", 0)];
    const videos = [makeVideo("v1", "deleted-group")];
    const sections = groupVideoLibraryItems(videos, groups);
    expect(sections).toHaveLength(2);
    expect(sections[0].groupId).toBe("g1");
    expect(sections[0].videos).toEqual([]);
    expect(sections[1].groupId).toBeNull();
    expect(sections[1].videos.map(v => v.id)).toEqual(["v1"]);
  });

  it("includes empty groups with zero assigned videos", () => {
    const groups = [makeGroup("g1", 0, "グループ1"), makeGroup("g2", 1, "グループ2")];
    const videos = [makeVideo("v1", "g1")];
    const sections = groupVideoLibraryItems(videos, groups);
    expect(sections).toHaveLength(2);
    expect(sections[0].groupId).toBe("g1");
    expect(sections[0].videos).toEqual([videos[0]]);
    expect(sections[1].groupId).toBe("g2");
    expect(sections[1].videos).toEqual([]);
    expect(sections[1].name).toBe("グループ2");
  });
});
