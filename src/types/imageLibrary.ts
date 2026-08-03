import type { CloudImageAsset } from "../lib/cloudImages";

export const IMAGE_LIBRARY_COLLECTION = "image_library";

export type ImageLibrarySource = "upload" | "template";

export interface ImageLibraryItem {
  id: string;
  name: string;
  imageAsset: CloudImageAsset;
  source: ImageLibrarySource;
  templateId?: string;
  createdAt: number;
  updatedAt: number;
}
