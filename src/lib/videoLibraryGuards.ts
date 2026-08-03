export interface VideoReference {
  kind: "event" | "news_preset" | "riddle_step" | "signage_playlist" | "signage_manual";
  label: string;
}

export interface VideoLibraryUsageSnapshot {
  events: Array<{ id: string; breakingVideoId?: string | null; signageAction?: { videoAssetId?: string | null } | null }>;
  newsPresets: Array<{ id: string; name: string; breakingVideoId?: string | null; signageDisplay?: { videoAssetId?: string | null } | null }>;
  riddleRooms: Array<{
    id: string;
    name: string;
    steps: Array<{ name: string; tvActions: Record<string, { videoAssetId?: string | null }> }>;
  }>;
  publicSignages: Array<{
    id: string;
    name: string;
    playlist: Array<{ videoAssetId?: string | null }>;
    manualOverride?: { videoAssetId?: string | null } | null;
  }>;
}

export const findVideoReferences = (videoId: string, snapshot: VideoLibraryUsageSnapshot): VideoReference[] => {
  const refs: VideoReference[] = [];

  snapshot.events.forEach(event => {
    if (event.breakingVideoId === videoId) {
      refs.push({ kind: "event", label: `イベント ${event.id}` });
    }
    if (event.signageAction?.videoAssetId === videoId) {
      refs.push({ kind: "event", label: `イベント ${event.id} のサイネージ表示` });
    }
  });

  snapshot.newsPresets.forEach(preset => {
    if (preset.breakingVideoId === videoId) {
      refs.push({ kind: "news_preset", label: `ニュースプリセット「${preset.name}」の速報動画` });
    }
    if (preset.signageDisplay?.videoAssetId === videoId) {
      refs.push({ kind: "news_preset", label: `ニュースプリセット「${preset.name}」のサイネージ動画` });
    }
  });

  snapshot.riddleRooms.forEach(room => {
    room.steps.forEach(step => {
      const usesVideo = Object.values(step.tvActions || {}).some(action => action?.videoAssetId === videoId);
      if (usesVideo) {
        refs.push({ kind: "riddle_step", label: `謎解き部屋「${room.name}」 / ステップ「${step.name}」` });
      }
    });
  });

  snapshot.publicSignages.forEach(signage => {
    const usesInPlaylist = (signage.playlist || []).some(item => item.videoAssetId === videoId);
    if (usesInPlaylist) {
      refs.push({ kind: "signage_playlist", label: `サイネージ「${signage.name}」のプレイリスト` });
    }

    if (signage.manualOverride?.videoAssetId === videoId) {
      refs.push({ kind: "signage_manual", label: `サイネージ「${signage.name}」の手動送出` });
    }
  });

  return refs;
};
