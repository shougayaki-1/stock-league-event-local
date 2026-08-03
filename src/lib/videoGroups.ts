import type { VideoGroup } from "../types/videoGroup";
import type { VideoLibraryItem } from "../types/videoLibrary";

export const UNGROUPED_LABEL = "未分類";

export interface VideoGroupSection {
  groupId: string | null;
  name: string;
  videos: VideoLibraryItem[];
}

export function sortGroupsByOrder(groups: VideoGroup[]): VideoGroup[] {
  return [...groups].sort((a, b) => a.order - b.order);
}

export function nextGroupOrder(groups: VideoGroup[]): number {
  if (groups.length === 0) return 0;
  return Math.max(...groups.map(group => group.order)) + 1;
}

export function groupVideoLibraryItems(videos: VideoLibraryItem[], groups: VideoGroup[]): VideoGroupSection[] {
  const sortedGroups = sortGroupsByOrder(groups);
  const validGroupIds = new Set(sortedGroups.map(group => group.id));

  const sections: VideoGroupSection[] = sortedGroups
    .map(group => ({
      groupId: group.id,
      name: group.name,
      videos: videos.filter(video => video.groupId === group.id),
    }));

  const ungrouped = videos.filter(video => !video.groupId || !validGroupIds.has(video.groupId));
  if (ungrouped.length > 0) {
    sections.push({ groupId: null, name: UNGROUPED_LABEL, videos: ungrouped });
  }

  return sections;
}
