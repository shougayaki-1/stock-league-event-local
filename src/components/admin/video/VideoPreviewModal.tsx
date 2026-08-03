import { useRef, useState } from "react";
import { Download, Eye, X } from "lucide-react";
import {
  formatCloudVideoDownloadError,
  buildCloudVideoDownloadFileName,
  downloadCloudVideoBlobWithProgress,
  formatVideoBytes,
  getCloudVideoBrowserDownloadUrl,
  getOptimizedStatusLabel,
  getPreferredVideoAsset,
  type CloudVideoAsset,
  type CloudVideoDownloadProgress,
} from "../../../lib/cloudVideos";
import { useBodyScrollLock } from "../../../hooks/useBodyScrollLock";
import { useMediaElementGain } from "../../../hooks/useMediaElementGain";
import IconButton from "../../ui/IconButton";

interface VideoPreviewModalProps {
  asset?: CloudVideoAsset | null;
  title: string;
  volumeGain?: number;
  isOpen: boolean;
  onClose: () => void;
}

interface VideoAssetActionProps {
  asset?: CloudVideoAsset | null;
  title: string;
  volumeGain?: number;
  onPreview: (asset: CloudVideoAsset, title: string, volumeGain?: number) => void;
  className?: string;
}

const progressText = (progress: CloudVideoDownloadProgress | null) => {
  if (!progress) return "";
  const bytes = progress.totalBytes
    ? `${formatVideoBytes(progress.bytesTransferred)} / ${formatVideoBytes(progress.totalBytes)}`
    : progress.bytesTransferred
      ? `${formatVideoBytes(progress.bytesTransferred)} 取得済み`
      : "";
  return bytes ? `${progress.progress}% ${bytes}` : `${progress.progress}%`;
};

const startBrowserDownload = (url: string, fileName: string) => {
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
};

export function VideoAssetActions({ asset, title, volumeGain, onPreview, className }: VideoAssetActionProps) {
  const [downloadProgress, setDownloadProgress] = useState<CloudVideoDownloadProgress | null>(null);
  const [downloadState, setDownloadState] = useState<"idle" | "downloading" | "done" | "error">("idle");

  const handleDownload = async () => {
    const preferred = getPreferredVideoAsset(asset);
    if (!asset || !preferred?.storagePath) return;
    setDownloadState("downloading");
    setDownloadProgress({ stage: "downloading", progress: 0, message: "取得準備中", totalBytes: preferred.size });
    const fileName = buildCloudVideoDownloadFileName(title, preferred, asset);
    try {
      const blob = await downloadCloudVideoBlobWithProgress(preferred.storagePath, setDownloadProgress);
      const url = URL.createObjectURL(blob);
      startBrowserDownload(url, fileName);
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDownloadState("done");
      setDownloadProgress({ stage: "complete", progress: 100, message: "ダウンロード完了", bytesTransferred: blob.size, totalBytes: blob.size });
      window.setTimeout(() => setDownloadState("idle"), 2500);
    } catch (error) {
      console.error(error);
      const browserDownloadUrl = await getCloudVideoBrowserDownloadUrl(preferred, fileName);
      if (browserDownloadUrl) {
        startBrowserDownload(browserDownloadUrl, fileName);
        setDownloadState("done");
        setDownloadProgress({ stage: "complete", progress: 100, message: "ブラウザで直接ダウンロードを開始しました" });
        window.setTimeout(() => setDownloadState("idle"), 2500);
        return;
      }
      setDownloadState("error");
      setDownloadProgress({ stage: "failed", progress: 0, message: formatCloudVideoDownloadError(error) });
    }
  };

  if (!asset) return null;
  return (
    <div className={className ?? "flex items-center gap-1"}>
      <IconButton aria-label={`${title}をプレビュー`} size="sm" variant="outline" onClick={() => onPreview(asset, title, volumeGain)}>
        <Eye size={15} />
      </IconButton>
      <IconButton aria-label={`${title}をダウンロード`} size="sm" variant="outline" onClick={handleDownload} disabled={downloadState === "downloading"}>
        <Download size={15} />
      </IconButton>
      {downloadProgress && downloadState !== "idle" && (
        <span className={`max-w-36 truncate text-[10px] font-black ${downloadState === "error" ? "text-error" : "text-on-surface-variant"}`}>
          {downloadState === "done" ? downloadProgress.message : downloadState === "error" ? downloadProgress.message : progressText(downloadProgress)}
        </span>
      )}
    </div>
  );
}

export default function VideoPreviewModal({ asset, title, volumeGain, isOpen, onClose }: VideoPreviewModalProps) {
  const preferred = getPreferredVideoAsset(asset);
  const previewUrl = isOpen ? preferred?.downloadUrl || "" : "";
  const videoRef = useRef<HTMLVideoElement | null>(null);
  useBodyScrollLock(isOpen);
  useMediaElementGain(videoRef, volumeGain);

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/70 p-2 sm:p-4">
      <div className="flex max-h-[96dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 p-4">
          <div className="min-w-0">
            <h3 className="truncate text-base font-black text-white">{title}</h3>
            <p className="mt-1 truncate text-[11px] font-bold text-slate-400">
              {getOptimizedStatusLabel(asset)} / {formatVideoBytes(preferred?.size)}
            </p>
          </div>
          <IconButton aria-label="動画プレビューを閉じる" size="sm" variant="ghost" className="text-slate-300 hover:text-white" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        <div className="bg-black">
          {previewUrl ? (
            <video ref={videoRef} src={previewUrl} controls autoPlay className="h-[76dvh] max-h-[76dvh] w-full bg-black object-contain" />
          ) : (
            <div className="flex h-80 items-center justify-center text-sm font-bold text-slate-400">動画URLが見つかりません。</div>
          )}
        </div>
      </div>
    </div>
  );
}
