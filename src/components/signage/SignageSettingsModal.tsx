import { Settings, X, AlertTriangle } from "lucide-react";
import Button from "../ui/Button";
import IconButton from "../ui/IconButton";
import ThemeToggle from "../ui/ThemeToggle";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  showThemeToggle?: boolean;
}

export default function SignageSettingsModal({ isOpen, onClose, title, children, showThemeToggle = true }: Props) {
  useBodyScrollLock(isOpen);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-6 animate-in fade-in duration-200">
      <div className="bg-surface text-on-surface p-8 rounded-[28px] elevation-3 max-w-2xl w-full max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-200">

        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-2xl font-medium text-on-surface flex items-center gap-3">
              <Settings className="text-primary" /> {title}
            </h2>
            <p className="text-xs text-warning mt-2 flex items-center gap-1 font-medium">
              <AlertTriangle size={14} /> ファイルや設定は端末のブラウザ内部に保存されます。
            </p>
          </div>
          <IconButton aria-label="設定を閉じる" onClick={onClose} size="sm">
            <X size={20} />
          </IconButton>
        </div>

        <div className="flex-1 overflow-y-auto pr-4 space-y-6">
          {children}
        </div>

        <div className="flex items-center justify-between mt-6 pt-6 border-t border-outline-variant">
          {showThemeToggle ? (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold text-on-surface-variant tracking-widest px-2 hidden sm:inline">Theme</span>
              <ThemeToggle buttonClassName="p-2" />
            </div>
          ) : <div />}
          <Button onClick={onClose} variant="filled" className="px-8 py-3">
            完了して閉じる
          </Button>
        </div>

      </div>
    </div>
  );
}
