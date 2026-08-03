import { Settings, X, Timer } from "lucide-react";
import Button from "../ui/Button";
import IconButton from "../ui/IconButton";
import Input from "../ui/Input";
import ThemeToggle from "../ui/ThemeToggle";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";

interface TerminalSettingsModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  setIsSettingsOpen?: (isOpen: boolean) => void;
  clearTimer: number;
  setClearTimer: (timer: number) => void;
  saveSettings?: () => void;
  onSave?: () => void;
}

export default function TerminalSettingsModal({
  isOpen,
  onClose,
  setIsSettingsOpen,
  clearTimer,
  setClearTimer,
  saveSettings,
  onSave
}: TerminalSettingsModalProps) {
  useBodyScrollLock(isOpen !== false);

  // Handle both old and new prop formats
  const handleClose = () => {
    if (onClose) onClose();
    if (setIsSettingsOpen) setIsSettingsOpen(false);
  };

  const handleSave = () => {
    if (onSave) onSave();
    if (saveSettings) saveSettings();
  };

  if (isOpen === false) return null;

  return (
    <div className="absolute inset-0 bg-slate-900/85 z-[1000] flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-200">
      <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl w-full max-w-sm shadow-2xl text-slate-800 dark:text-white border border-slate-200 dark:border-slate-800">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-black flex items-center gap-2"><Settings className="text-blue-500" /> 端末ローカル設定</h2>
          <IconButton aria-label="端末設定を閉じる" onClick={handleClose} variant="soft" size="sm" className="text-slate-400 hover:text-slate-600 dark:hover:text-white">
            <X size={20} />
          </IconButton>
        </div>
        <div className="space-y-6">
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400 font-bold block mb-2">テーマ</label>
            <ThemeToggle showText />
          </div>
          <div>
            <label className="text-xs font-bold flex items-center gap-1.5 mb-2 text-slate-600 dark:text-slate-300"><Timer size={14} className="text-blue-500"/> 自動ログアウト時間（秒）</label>
            <Input type="number" value={clearTimer} onChange={(e) => setClearTimer(Number(e.target.value))} className="p-4 text-center font-bold text-2xl text-blue-600 dark:text-blue-400 shadow-inner" />
          </div>
          <Button onClick={handleSave} className="w-full py-4 text-lg shadow-lg shadow-blue-900/20">設定を保存</Button>
        </div>
      </div>
    </div>
  );
}
