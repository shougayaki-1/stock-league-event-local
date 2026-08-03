export const VIDEO_GROUPS_COLLECTION = "video_groups";

export interface VideoGroup {
  id: string;
  name: string;
  order: number;
  createdAt: number;
  updatedAt: number;
}
