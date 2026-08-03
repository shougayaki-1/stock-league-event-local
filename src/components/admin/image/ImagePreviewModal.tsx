import { Download, Eye, X } from "lucide-react";
import type { CloudImageAsset } from "../../../lib/cloudImages";
import { formatImageBytes } from "../../../lib/cloudImages";
import { useBodyScrollLock } from "../../../hooks/useBodyScrollLock";
import IconButton from "../../ui/IconButton";

interface ImagePreviewModalProps {
  asset?: CloudImageAsset | null;
  title: string;
  isOpen: boolean;
  onClose: () => void;
}

interface ImageAssetActionsProps {
  asset?: CloudImageAsset | null;
  title: string;
  onPreview: (asset: CloudImageAsset, title: string) => void;
  className?: string;
}

const startBrowserDownload = (url: string, fileName: string) => {
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
};

export function ImageAssetActions({ asset, title, onPreview, className }: ImageAssetActionsProps) {
  if (!asset) return null;
  return (
    <div className={className ?? "flex items-center gap-1"}>
      <IconButton aria-label={`${title}をプレビュー`} size="sm" variant="outline" onClick={() => onPreview(asset, title)}>
        <Eye size={15} />
      </IconButton>
      <IconButton aria-label={`${title}をダウンロード`} size="sm" variant="outline" onClick={() => startBrowserDownload(asset.downloadUrl, asset.fileName || `${title}.png`)}>
        <Download size={15} />
      </IconButton>
    </div>
  );
}

export default function ImagePreviewModal({ asset, title, isOpen, onClose }: ImagePreviewModalProps) {
  useBodyScrollLock(isOpen);

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/70 p-2 sm:p-4">
      <div className="flex max-h-[96dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 p-4">
          <div className="min-w-0">
            <h3 className="truncate text-base font-black text-white">{title}</h3>
            <p className="mt-1 truncate text-[11px] font-bold text-slate-400">
              {asset?.width ?? "-"} x {asset?.height ?? "-"} / {formatImageBytes(asset?.size)}
            </p>
          </div>
          <IconButton aria-label="画像プレビューを閉じる" size="sm" variant="ghost" className="text-slate-300 hover:text-white" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        <div className="flex h-[76dvh] items-center justify-center bg-black">
          {asset?.downloadUrl ? (
            <img src={asset.downloadUrl} alt={title} className="h-full w-full object-contain" />
          ) : (
            <div className="text-sm font-bold text-slate-400">画像URLが見つかりません。</div>
          )}
        </div>
      </div>
    </div>
  );
}
