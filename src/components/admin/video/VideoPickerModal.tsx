import { Play, X } from "lucide-react";
import { useBodyScrollLock } from "../../../hooks/useBodyScrollLock";
import { getPreferredVideoAsset } from "../../../lib/cloudVideos";
import { groupVideoLibraryItems } from "../../../lib/videoGroups";
import type { VideoGroup } from "../../../types/videoGroup";
import type { VideoLibraryItem } from "../../../types/videoLibrary";
import IconButton from "../../ui/IconButton";

export interface VideoPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoLibrary: VideoLibraryItem[];
  groups: VideoGroup[];
  selectedVideoId?: string;
  onSelect: (videoId: string) => void;
  title?: string;
}

export default function VideoPickerModal({ isOpen, onClose, videoLibrary, groups, selectedVideoId, onSelect, title = "動画を選択" }: VideoPickerModalProps) {
  useBodyScrollLock(isOpen);
  if (!isOpen) return null;

  const sections = groupVideoLibraryItems(videoLibrary, groups);

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/70 p-2 sm:p-4">
      <div className="flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 p-4">
          <h3 className="text-base font-black text-white">{title}</h3>
          <IconButton aria-label="動画選択を閉じる" size="sm" variant="ghost" className="text-slate-300 hover:text-white" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        <div className="overflow-y-auto p-4">
          {videoLibrary.length === 0 ? (
            <p className="p-4 text-sm font-bold text-slate-400">動画ライブラリに動画がありません。</p>
          ) : (
            sections.map(section => (
              <div key={section.groupId ?? "ungrouped"} className="mb-5 last:mb-0">
                <p className="mb-2 text-xs font-black uppercase tracking-widest text-slate-400">
                  {section.name}（{section.videos.length}件）
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {section.videos.map(video => {
                    const preferred = getPreferredVideoAsset(video.videoAsset);
                    const isSelected = video.id === selectedVideoId;
                    return (
                      <button
                        key={video.id}
                        type="button"
                        onClick={() => {
                          onSelect(video.id);
                          onClose();
                        }}
                        className={`overflow-hidden rounded-xl border-2 text-left transition-colors ${isSelected ? "border-primary" : "border-slate-800 hover:border-slate-600"}`}
                      >
                        <div className="relative aspect-video w-full bg-slate-900">
                          {preferred?.downloadUrl ? (
                            <video src={preferred.downloadUrl} muted preload="metadata" className="h-full w-full object-cover opacity-80" />
                          ) : (
                            <span className="flex h-full items-center justify-center text-[10px] font-black text-slate-500">No preview</span>
                          )}
                          <span className="absolute inset-0 flex items-center justify-center bg-black/20 text-white">
                            <Play size={20} fill="currentColor" />
                          </span>
                        </div>
                        <p className="truncate p-2 text-xs font-bold text-white">{video.name}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
