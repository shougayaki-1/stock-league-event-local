import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import type { ReactNode } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";

interface DialogOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "info" | "warning" | "danger" | "success";
  inputType?: string;
  placeholder?: string;
  defaultValue?: string;
}

interface DialogContextType {
  alert: (options: string | DialogOptions) => Promise<void>;
  confirm: (options: string | DialogOptions) => Promise<boolean>;
  prompt: (options: string | DialogOptions) => Promise<string | null>;
}

const DialogContext = createContext<DialogContextType | undefined>(undefined);

export function DialogProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [type, setType] = useState<"alert" | "confirm" | "prompt">("alert");
  const [options, setOptions] = useState<DialogOptions>({ title: "", message: "" });
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [resolver, setResolver] = useState<{ resolve: (value: any) => void } | null>(null);

  useEffect(() => {
    if (isOpen && type === "prompt" && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen, type]);
  useBodyScrollLock(isOpen);

  const showAlert = useCallback((opts: string | DialogOptions) => {
    return new Promise<void>((resolve) => {
      const parsedOpts = typeof opts === "string" ? { title: "お知らせ", message: opts } : opts;
      setOptions({ variant: "info", confirmText: "OK", ...parsedOpts });
      setType("alert");
      setResolver({ resolve });
      setIsOpen(true);
    });
  }, []);

  const showConfirm = useCallback((opts: string | DialogOptions) => {
    return new Promise<boolean>((resolve) => {
      const parsedOpts = typeof opts === "string" ? { title: "確認", message: opts } : opts;
      setOptions({ variant: "warning", confirmText: "はい", cancelText: "キャンセル", ...parsedOpts });
      setType("confirm");
      setResolver({ resolve });
      setIsOpen(true);
    });
  }, []);

  const showPrompt = useCallback((opts: string | DialogOptions) => {
    return new Promise<string | null>((resolve) => {
      const parsedOpts = typeof opts === "string" ? { title: "入力", message: opts } : opts;
      setOptions({ variant: "info", confirmText: "決定", cancelText: "キャンセル", ...parsedOpts });
      setInputValue(parsedOpts.defaultValue || "");
      setType("prompt");
      setResolver({ resolve });
      setIsOpen(true);
    });
  }, []);

  const handleClose = (isConfirmed: boolean) => {
    setIsOpen(false);
    if (resolver) {
      if (type === "confirm") {
        resolver.resolve(isConfirmed);
      } else if (type === "prompt") {
        resolver.resolve(isConfirmed ? inputValue : null);
      } else {
        resolver.resolve(undefined);
      }
      setResolver(null);
    }
  };

  const getVariantIcon = (variant?: string) => {
    switch (variant) {
      case "danger": return { Icon: AlertCircle, color: "text-error", bg: "bg-error-container" };
      case "warning": return { Icon: AlertTriangle, color: "text-warning", bg: "bg-warning/15" };
      case "success": return { Icon: CheckCircle2, color: "text-success", bg: "bg-success/15" };
      default: return { Icon: Info, color: "text-primary", bg: "bg-primary-container" };
    }
  };

  const { Icon, color, bg } = getVariantIcon(options.variant);

  return (
    <DialogContext.Provider value={{ alert: showAlert, confirm: showConfirm, prompt: showPrompt }}>
      {children}
      {isOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/40 animate-in fade-in duration-200">
          <div className="bg-surface text-on-surface w-full max-w-sm rounded-[28px] elevation-3 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full ${bg}`}>
                <Icon className={color} size={24} />
              </div>
              <h3 className="text-2xl font-medium mb-2 text-on-surface">{options.title}</h3>
              <p className="text-on-surface-variant text-sm whitespace-pre-wrap leading-relaxed mb-4">{options.message}</p>

              {type === "prompt" && (
                <Input
                  ref={inputRef}
                  type={options.inputType || "text"}
                  placeholder={options.placeholder}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleClose(true);
                  }}
                />
              )}
            </div>
            <div className="px-6 pb-6 flex justify-end gap-2">
              {(type === "confirm" || type === "prompt") && (
                <Button variant="text" onClick={() => handleClose(false)}>
                  {options.cancelText}
                </Button>
              )}
              <Button
                variant={options.variant === "danger" ? "danger" : "filled"}
                onClick={() => handleClose(true)}
              >
                {options.confirmText}
              </Button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useDialog = () => {
  const context = useContext(DialogContext);
  if (!context) throw new Error("useDialog must be used within a DialogProvider");
  return context;
};
