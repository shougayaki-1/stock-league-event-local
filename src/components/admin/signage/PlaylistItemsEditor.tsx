import { useState } from "react";
import { ListVideo, Cloud, Image as ImageIcon, Trash2 } from "lucide-react";
import Button from "../../ui/Button";
import Badge from "../../ui/Badge";
import ScreenMockup from "../../ui/ScreenMockup";
import { PUBLIC_SIGNAGE_PRESETS as PRESETS, type PlaylistItem } from "../../../lib/signagePresets";
import { formatVideoBytes, getOptimizedStatusLabel, getPreferredVideoAsset, type CloudVideoAsset } from "../../../lib/cloudVideos";
import type { VideoLibraryItem } from "../../../types/videoLibrary";
import { formatImageBytes, type CloudImageAsset } from "../../../lib/cloudImages";
import type { ImageLibraryItem } from "../../../types/imageLibrary";
import { VideoAssetActions } from "../video/VideoPreviewModal";
import { ImageAssetActions } from "../image/ImagePreviewModal";
import type { VideoGroup } from "../../../types/videoGroup";
import VideoPickerModal from "../video/VideoPickerModal";

interface PlaylistItemsEditorProps {
  items: PlaylistItem[];
  onChange: (items: PlaylistItem[]) => void;
  videoLibrary: VideoLibraryItem[];
  videoGroups?: VideoGroup[];
  imageLibrary?: ImageLibraryItem[];
  onPreview: (asset: CloudVideoAsset, title: string) => void;
  onImagePreview?: (asset: CloudImageAsset, title: string) => void;
  minDurationSeconds: number;
  title?: string;
}

export default function PlaylistItemsEditor({ items, onChange, videoLibrary, videoGroups = [], imageLibrary = [], onPreview, onImagePreview, minDurationSeconds, title = "プレイリスト（自動ループ）" }: PlaylistItemsEditorProps) {
  const [videoPickerIndex, setVideoPickerIndex] = useState<number | null>(null);

  const selectVideo = (videoId: string) => {
    if (videoPickerIndex === null) return;
    const newItems = JSON.parse(JSON.stringify(items)) as PlaylistItem[];
    newItems[videoPickerIndex] = { ...newItems[videoPickerIndex], videoAssetId: videoId, videoType: "LOCAL", videoUrl: "" };
    onChange(newItems);
  };

  return (
    <div>
      <p className="text-xs font-black text-slate-400 uppercase mb-4 flex items-center gap-2"><ListVideo size={14}/> {title}</p>
      <div className="space-y-2 mb-4">
        {items.map((item, i) => (
          <div key={i} className="flex flex-wrap items-center bg-slate-50 dark:bg-slate-950 p-2 rounded-xl border border-slate-100 dark:border-slate-800 gap-3">
            <span className="text-slate-400 font-mono text-[10px] font-black w-4 text-center">{i + 1}</span>
            <div className="w-10 shrink-0"><ScreenMockup mode={item.mode} /></div>
            <select
              value={item.mode}
              onChange={e => {
                const newItems = JSON.parse(JSON.stringify(items));
                newItems[i].mode = e.target.value;
                if (e.target.value !== "FULL_MOVIE") {
                  delete newItems[i].videoAssetId;
                  delete newItems[i].videoUrl;
                  delete newItems[i].videoType;
                }
                if (e.target.value !== "FULL_IMAGE") {
                  delete newItems[i].imageAssetId;
                }
                onChange(newItems);
              }}
              className="flex-1 min-w-[120px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs font-bold outline-none"
            >
              {PRESETS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div className="flex items-center gap-2 shrink-0">
              {item.mode !== "FULL_MOVIE" ? (
                <>
                  <input
                    type="number"
                    value={item.duration ?? ""}
                    onChange={e => {
                      const newItems = JSON.parse(JSON.stringify(items));
                      newItems[i].duration = e.target.value === "" ? 0 : Number(e.target.value);
                      onChange(newItems);
                    }}
                    className="w-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-center text-xs font-mono font-bold outline-none"
                    min={minDurationSeconds}
                  />
                  <span className="text-[10px] font-bold text-slate-400">秒</span>
                </>
              ) : <Badge variant="danger">終了まで再生</Badge>}
            </div>
            {item.mode === "FULL_MOVIE" && (
              <div className="flex min-w-[180px] flex-1 items-center justify-end gap-2">
                <div className="min-w-0 text-right">
                  <p className="truncate text-[10px] font-bold text-slate-400">
                    {item.videoAssetId ? <><Cloud size={12} className="mr-1 inline text-blue-500" />{videoLibrary.find(video => video.id === item.videoAssetId)?.name || "選択中の動画"}</> : "動画未設定"}
                  </p>
                  {item.videoAssetId && videoLibrary.find(video => video.id === item.videoAssetId)?.videoAsset && (
                    <p className="truncate text-[10px] font-black text-blue-500">
                      {getOptimizedStatusLabel(videoLibrary.find(video => video.id === item.videoAssetId)?.videoAsset)} / {formatVideoBytes(getPreferredVideoAsset(videoLibrary.find(video => video.id === item.videoAssetId)?.videoAsset)?.size)}
                    </p>
                  )}
                </div>
                {item.videoAssetId && videoLibrary.find(video => video.id === item.videoAssetId)?.videoAsset && (
                  <VideoAssetActions
                    asset={videoLibrary.find(video => video.id === item.videoAssetId)?.videoAsset}
                    title={videoLibrary.find(video => video.id === item.videoAssetId)?.name || "選択中の動画"}
                    onPreview={onPreview}
                    className="flex shrink-0 items-center gap-1"
                  />
                )}
                <Button variant="outline" size="sm" className="min-w-[180px]" onClick={() => setVideoPickerIndex(i)}>
                  {item.videoAssetId ? "動画を変更" : "動画を選択"}
                </Button>
              </div>
            )}
            {item.mode === "FULL_IMAGE" && (
              <div className="flex min-w-[180px] flex-1 items-center justify-end gap-2">
                <div className="min-w-0 text-right">
                  <p className="truncate text-[10px] font-bold text-slate-400">
                    {item.imageAssetId ? <><ImageIcon size={12} className="mr-1 inline text-emerald-500" />{imageLibrary.find(image => image.id === item.imageAssetId)?.name || "選択中の画像"}</> : "画像未設定"}
                  </p>
                  {item.imageAssetId && imageLibrary.find(image => image.id === item.imageAssetId)?.imageAsset && (
                    <p className="truncate text-[10px] font-black text-emerald-500">
                      {formatImageBytes(imageLibrary.find(image => image.id === item.imageAssetId)?.imageAsset.size)}
                    </p>
                  )}
                </div>
                {item.imageAssetId && imageLibrary.find(image => image.id === item.imageAssetId)?.imageAsset && onImagePreview && (
                  <ImageAssetActions
                    asset={imageLibrary.find(image => image.id === item.imageAssetId)?.imageAsset}
                    title={imageLibrary.find(image => image.id === item.imageAssetId)?.name || "選択中の画像"}
                    onPreview={onImagePreview}
                    className="flex shrink-0 items-center gap-1"
                  />
                )}
                <select
                  value={item.imageAssetId || ""}
                  onChange={e => {
                    const newItems = JSON.parse(JSON.stringify(items)) as PlaylistItem[];
                    newItems[i] = { ...newItems[i], imageAssetId: e.target.value || undefined };
                    onChange(newItems);
                  }}
                  className="min-w-[180px] rounded-lg border border-slate-200 bg-white p-2 text-xs font-bold outline-none dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="">画像を選択</option>
                  {imageLibrary.map(image => <option key={image.id} value={image.id}>{image.name}</option>)}
                </select>
              </div>
            )}
            <Button variant="ghost" size="sm" className="text-slate-300 hover:text-red-500" onClick={() => onChange(items.filter((_, idx) => idx !== i))}><Trash2 size={14} /></Button>
          </div>
        ))}
      </div>
      <Button variant="outline" className="w-full border-dashed border-2 text-xs py-3" onClick={() => onChange([...items, { mode: "STOCK_GRID", duration: 30 }])}>+ 画面を追加</Button>
      <VideoPickerModal
        isOpen={videoPickerIndex !== null}
        onClose={() => setVideoPickerIndex(null)}
        videoLibrary={videoLibrary}
        groups={videoGroups}
        selectedVideoId={videoPickerIndex === null ? undefined : items[videoPickerIndex]?.videoAssetId}
        onSelect={selectVideo}
        title="プレイリストの動画を選択"
      />
    </div>
  );
}
