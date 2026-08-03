import type { CloudVideoAsset } from "../src/lib/cloudVideos";

export interface LegacyVideoSource {
  collectionPath: string;
  docId: string;
  fieldPath: string;
  name: string;
  videoAsset: CloudVideoAsset;
}

export interface VideoLibraryEntry {
  videoId: string;
  name: string;
  videoAsset: CloudVideoAsset;
  source: LegacyVideoSource;
}

const sanitizePart = (value: string) => value.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "item";

export const buildVideoLibraryEntries = (sources: LegacyVideoSource[]): VideoLibraryEntry[] => {
  return sources.map(source => ({
    videoId: `legacy_${sanitizePart(source.collectionPath)}_${sanitizePart(source.docId)}_${sanitizePart(source.fieldPath)}`,
    name: source.name,
    videoAsset: source.videoAsset,
    source,
  }));
};
