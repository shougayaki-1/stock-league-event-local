import type { CloudVideoAsset } from "./cloudVideos";
import type { PlaylistItem } from "./signagePresets";
import type { ScenarioEvent } from "../types/scenario";
import type { VideoLibraryItem } from "../types/videoLibrary";
import type { NewsPreset } from "../types/newsPreset";

export interface SignageVideoEntry {
  key: string;
  asset?: CloudVideoAsset | null;
  label: string;
  volumeGain?: number;
}

export interface ScenarioOverrideForVideo {
  eventId: string;
  mode: string;
  videoAssetId?: string | null;
}

export interface ManualOverrideForVideo {
  mode: string;
  videoAssetId?: string | null;
}

const findVideo = (videoLibrary: VideoLibraryItem[], videoId?: string | null) =>
  videoId ? videoLibrary.find(video => video.id === videoId) : undefined;

export function buildPublicSignageAutoSyncEntries(input: {
  playlist: PlaylistItem[];
  videoLibrary: VideoLibraryItem[];
  breakingVideoId: string | null;
  scenarioOverride: ScenarioOverrideForVideo | null;
  manualOverride: ManualOverrideForVideo | null;
  scenarioEvents: ScenarioEvent[];
  newsPresetsById?: Map<string, NewsPreset>;
  signageId: string | null;
}): SignageVideoEntry[] {
  const entries: SignageVideoEntry[] = [];
  const seen = new Set<string>();
  const pushEntry = (entry: SignageVideoEntry) => {
    if (!entry.asset || seen.has(entry.key)) return;
    seen.add(entry.key);
    entries.push(entry);
  };

  input.playlist.forEach((item, index) => {
    const video = findVideo(input.videoLibrary, item.videoAssetId);
    if (item.mode === "FULL_MOVIE" && video?.videoAsset) {
      pushEntry({ key: index.toString(), asset: video.videoAsset, label: `通常 No.${index + 1}`, volumeGain: video.volumeGain });
    }
  });

  if (input.breakingVideoId) {
    const video = findVideo(input.videoLibrary, input.breakingVideoId);
    if (video?.videoAsset) pushEntry({ key: `breaking_${video.id}`, asset: video.videoAsset, label: `速報 ${video.name}`, volumeGain: video.volumeGain });
  }

  if (input.scenarioOverride?.mode === "FULL_MOVIE" && input.scenarioOverride.videoAssetId) {
    const video = findVideo(input.videoLibrary, input.scenarioOverride.videoAssetId);
    if (video?.videoAsset) pushEntry({ key: `scenario_${input.scenarioOverride.eventId}`, asset: video.videoAsset, label: `シナリオ ${video.name}`, volumeGain: video.volumeGain });
  }

  if (input.manualOverride?.mode === "FULL_MOVIE" && input.manualOverride.videoAssetId) {
    const video = findVideo(input.videoLibrary, input.manualOverride.videoAssetId);
    if (video?.videoAsset) pushEntry({ key: `manual_${video.id}`, asset: video.videoAsset, label: `手動送出 ${video.name}`, volumeGain: video.volumeGain });
  }

  input.scenarioEvents.forEach(event => {
    const publicPreset = event.publicNewsPresetId ? input.newsPresetsById?.get(event.publicNewsPresetId) : undefined;
    const breakingVideoId = publicPreset?.breakingVideoId || event.breakingVideoId;
    if (breakingVideoId) {
      const video = findVideo(input.videoLibrary, breakingVideoId);
      if (video?.videoAsset) pushEntry({ key: `breaking_${video.id}`, asset: video.videoAsset, label: `予約速報 ${video.name}`, volumeGain: video.volumeGain });
    }
    const presetDisplay = publicPreset?.signageDisplay;
    const action = presetDisplay && (event.signageTargetId || event.signageAction?.signageId) ? {
      signageId: event.signageTargetId || event.signageAction?.signageId || "",
      mode: presetDisplay.mode,
      videoAssetId: presetDisplay.videoAssetId || null,
    } : event.signageAction;
    if (action?.signageId === input.signageId && action.mode === "FULL_MOVIE" && action.videoAssetId) {
      const video = findVideo(input.videoLibrary, action.videoAssetId);
      if (video?.videoAsset) pushEntry({ key: `scenario_${event.id}`, asset: video.videoAsset, label: `予約サイネージ ${video.name}`, volumeGain: video.volumeGain });
    }
  });

  return entries;
}

export function buildPublicSignagePredownloadEntries(
  autoSyncEntries: SignageVideoEntry[],
  videoLibrary: VideoLibraryItem[]
): SignageVideoEntry[] {
  const entries = [...autoSyncEntries];
  const seen = new Set(entries.map(entry => entry.key));
  const pushCandidate = (entry: SignageVideoEntry) => {
    if (seen.has(entry.key)) return;
    seen.add(entry.key);
    entries.push(entry);
  };

  videoLibrary.forEach(video => {
    pushCandidate({ key: `breaking_${video.id}`, asset: video.videoAsset, label: `速報候補 ${video.name}`, volumeGain: video.volumeGain });
    pushCandidate({ key: `manual_${video.id}`, asset: video.videoAsset, label: `手動送出候補 ${video.name}`, volumeGain: video.volumeGain });
  });
  return entries;
}
