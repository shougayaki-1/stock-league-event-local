export interface ImageReference {
  kind: "signage_playlist" | "signage_manual";
  label: string;
}

export interface ImageLibraryUsageSnapshot {
  signagePlaylists: Array<{
    id: string;
    name: string;
    items: Array<{ imageAssetId?: string | null }>;
  }>;
  publicSignages: Array<{
    id: string;
    name: string;
    playlist: Array<{ imageAssetId?: string | null }>;
    manualOverride?: { imageAssetId?: string | null } | null;
  }>;
}

export const findImageReferences = (imageId: string, snapshot: ImageLibraryUsageSnapshot): ImageReference[] => {
  const refs: ImageReference[] = [];

  snapshot.signagePlaylists.forEach(playlist => {
    if ((playlist.items || []).some(item => item.imageAssetId === imageId)) {
      refs.push({ kind: "signage_playlist", label: `プレイリスト「${playlist.name}」` });
    }
  });

  snapshot.publicSignages.forEach(signage => {
    if ((signage.playlist || []).some(item => item.imageAssetId === imageId)) {
      refs.push({ kind: "signage_playlist", label: `サイネージ「${signage.name}」のプレイリスト` });
    }
    if (signage.manualOverride?.imageAssetId === imageId) {
      refs.push({ kind: "signage_manual", label: `サイネージ「${signage.name}」の手動送出` });
    }
  });

  return refs;
};
