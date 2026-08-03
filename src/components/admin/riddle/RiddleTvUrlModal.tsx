import { Check, Copy, ExternalLink, Monitor, X } from "lucide-react";

import { buildRiddleSignageUrl } from "../../../lib/riddlePresentation";
import type { RiddleRoom } from "../../../hooks/useRiddleActions";
import { useBodyScrollLock } from "../../../hooks/useBodyScrollLock";
import Badge from "../../ui/Badge";
import Button from "../../ui/Button";

type RiddleTvUrlModalProps = {
  room: RiddleRoom;
  copiedUrl: string | null;
  onClose: () => void;
  onCopyUrl: (url: string) => void;
};

export default function RiddleTvUrlModal({ room, copiedUrl, onClose, onCopyUrl }: RiddleTvUrlModalProps) {
  const origin = `${window.location.protocol}//${window.location.host}`;
  useBodyScrollLock(true);

  return (
    <div className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 border border-slate-200 dark:border-slate-800">
        <div className="flex justify-between items-center mb-6 border-b pb-3">
          <h3 className="text-lg font-black text-slate-800 dark:text-white flex items-center gap-2">
            <Monitor className="text-purple-500" /> TV接続URL一覧 ({room.name})
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X />
          </button>
        </div>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          <p className="text-xs text-slate-500 font-bold mb-4">TV側のブラウザで開くURLです。ボタンをタップすると別タブで接続します。</p>
          {room.tvRoles?.map(role => {
            const url = buildRiddleSignageUrl(origin, room.id, role);
            return (
              <div key={role} className="p-4 bg-slate-50 dark:bg-slate-950 border rounded-xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 shadow-sm">
                <div className="min-w-0 flex-1">
                  <Badge variant="info" className="mb-2 uppercase text-[8px] font-black">{role} 役割</Badge>
                  <input readOnly value={url} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-855 rounded p-1.5 text-[9px] font-mono outline-none text-slate-500" />
                </div>
                <div className="flex gap-2 shrink-0 self-end sm:self-auto">
                  <Button variant="ghost" size="sm" className="p-2 border" onClick={() => onCopyUrl(url)}>
                    {copiedUrl === url ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                  </Button>
                  <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center font-bold rounded-xl px-4 py-2 text-xs bg-purple-600 hover:bg-purple-500 text-white shadow-md transition-all active:scale-95 no-underline">
                    <ExternalLink size={14} className="mr-1" /> 別タブで開く
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
