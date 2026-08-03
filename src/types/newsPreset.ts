import type { Timestamp } from "firebase/firestore";

export interface NewsPresetSignageDisplay {
  mode: string;
  duration: number;
  videoAssetId?: string | null;
  kind: "NORMAL" | "AD";
}

export interface NewsPreset {
  id: string;
  name: string;
  title: string;
  body: string;
  breakingVideoId?: string | null;
  signageDisplay?: NewsPresetSignageDisplay | null;
  createdAt: Timestamp | number;
  updatedAt: Timestamp | number;
}

export type NewsPresetInput = Pick<NewsPreset, "name" | "title" | "body" | "breakingVideoId" | "signageDisplay">;
