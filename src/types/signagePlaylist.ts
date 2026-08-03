import type { PlaylistItem } from "../lib/signagePresets";

export interface SignagePlaylist {
  id: string;
  name: string;
  items: PlaylistItem[];
  createdAt?: number;
  updatedAt?: number;
}
