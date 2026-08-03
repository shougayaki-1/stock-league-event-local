import type { CloudVideoAsset } from "../lib/cloudVideos";

export const VIDEO_LIBRARY_COLLECTION = "video_library";

export interface VideoLibraryItem {
  id: string;
  name: string;
  videoAsset: CloudVideoAsset;
  volumeGain?: number;
  groupId?: string;
  createdAt: number;
  updatedAt: number;
}
