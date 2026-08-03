import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

export interface SegmentedControlItem<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  title?: string;
  activeClassName?: string;
  inactiveClassName?: string;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  items: SegmentedControlItem<T>[];
  onChange: (value: T) => void;
  className?: string;
  buttonClassName?: string;
}

export default function SegmentedControl<T extends string>({
  value,
  items,
  onChange,
  className,
  buttonClassName,
}: SegmentedControlProps<T>) {
  return (
    <div className={cn("flex bg-surface-variant p-1.5 rounded-full border border-outline-variant", className)}>
      {items.map((item) => {
        const isActive = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full transition-all font-medium text-sm",
              isActive
                ? item.activeClassName ?? "bg-surface elevation-1 text-primary"
                : item.inactiveClassName ?? "text-on-surface-variant hover:bg-on-surface/8",
              buttonClassName
            )}
            title={item.title}
          >
            {item.icon}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
