import { X } from "lucide-react";
import QRCodeLib from "react-qr-code";
import Button from "../ui/Button";
import Badge from "../ui/Badge";
import IconButton from "../ui/IconButton";
import { buildLoginQrUrl } from "../../lib/utils";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";

const QRCode = (QRCodeLib as unknown as { default: React.ElementType }).default || QRCodeLib;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  nickname: string;
  uid: string;
}

export default function QrModal({ isOpen, onClose, nickname, uid }: Props) {
  useBodyScrollLock(isOpen);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 w-full max-w-sm flex flex-col p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl relative animate-in zoom-in-95">
        <IconButton aria-label="QRコードを閉じる" onClick={onClose} variant="subtle" className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-white"><X size={24} /></IconButton>
        <div className="text-center space-y-6">
          <div>
            <Badge variant="info" className="mb-2">Your Agent ID</Badge>
            <h2 className="text-xl font-black text-slate-800 dark:text-white">{nickname}</h2>
          </div>
          <div className="bg-white p-4 rounded-2xl inline-block shadow-inner mx-auto">
            <QRCode value={buildLoginQrUrl(uid)} size={200} />
          </div>
          <p className="text-xs text-slate-500 font-bold leading-relaxed">情報照会端末（Terminal）に<br/>このQRコードをかざすとログインできます。</p>
          <Button variant="outline" className="w-full" onClick={onClose}>閉じる</Button>
        </div>
      </div>
    </div>
  );
}
