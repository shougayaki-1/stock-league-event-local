import { useEffect, useRef, useState, type ReactNode } from "react";
import { MoreVertical } from "lucide-react";
import { cn } from "../../lib/utils";

export interface AdminActionMenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  tone?: "default" | "info" | "warning" | "danger";
}

interface AdminActionMenuProps {
  items: AdminActionMenuItem[];
  label?: string;
  className?: string;
}

const toneClasses = {
  default: "text-on-surface hover:bg-on-surface/8",
  info: "text-info hover:bg-info-container/70",
  warning: "text-warning hover:bg-warning-container/70",
  danger: "text-error hover:bg-error-container/70",
};

export default function AdminActionMenu({ items, label = "その他の操作", className }: AdminActionMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  return (
    <div ref={ref} className={cn("relative inline-flex", className)}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(prev => !prev);
        }}
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-outline-variant bg-surface-container text-on-surface-variant transition hover:bg-on-surface/8"
      >
        <MoreVertical size={18} />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-outline-variant bg-surface p-1 text-sm shadow-xl"
          onClick={event => event.stopPropagation()}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              disabled={item.disabled}
              onClick={() => {
                if (item.disabled) return;
                setOpen(false);
                item.onSelect();
              }}
              className={cn(
                "flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold transition disabled:pointer-events-none disabled:opacity-40",
                toneClasses[item.tone || "default"]
              )}
            >
              {item.icon ? <span className="inline-flex shrink-0">{item.icon}</span> : null}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
