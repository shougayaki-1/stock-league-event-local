import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import Button from "../ui/Button";

interface Props {
  hasChanges: boolean;
  onSave: () => void | Promise<void>;
  onReset: () => void;
  message?: string;
  saveLabel?: string;
  resetLabel?: string;
  isSaving?: boolean;
  variant?: "warning" | "danger" | "info";
}

export default function UnsavedBar({
  hasChanges,
  onSave,
  onReset,
  message = "保存していない変更があります。",
  saveLabel = "変更を保存する",
  resetLabel = "元に戻す",
  isSaving = false,
  variant = "warning"
}: Props) {
  // ブラウザのタブ閉じやリロードをブロック（これだけであればクラッシュしません）
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasChanges) {
        e.preventDefault();
        e.returnValue = message;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasChanges, message]);

  if (!hasChanges) return null;

  const toneClassName = variant === "danger"
    ? "text-error"
    : variant === "info"
      ? "text-primary"
      : "text-warning";
  const saveVariant = variant === "danger" ? "danger" : variant === "info" ? "filled" : "success";

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-4xl bg-surface text-on-surface px-6 py-4 rounded-[28px] elevation-3 flex flex-col sm:flex-row items-center justify-between z-[100] border border-outline-variant animate-in slide-in-from-bottom-10 fade-in duration-300 gap-4 print:hidden">
      <p className="font-medium text-base sm:text-lg flex items-center gap-3 text-center sm:text-left">
        <AlertTriangle className={`shrink-0 ${toneClassName}`} size={24} />
        <span>{message}</span>
      </p>
      <div className="flex items-center gap-2 w-full sm:w-auto">
        <Button
          onClick={onReset}
          disabled={isSaving}
          variant="text"
          className="flex-1 sm:flex-none text-center"
        >
          {resetLabel}
        </Button>
        <Button
          onClick={onSave}
          isLoading={isSaving}
          variant={saveVariant}
          className="flex-1 sm:flex-none"
        >
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}
