import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";

type TabTone = "blue" | "emerald" | "purple" | "rose" | "slate";
type TabVariant = "underline" | "bottom";

const activeToneClasses: Record<TabTone, Record<TabVariant, string>> = {
  blue: {
    underline: "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400",
    bottom: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 scale-105",
  },
  emerald: {
    underline: "border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400",
    bottom: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 scale-105",
  },
  purple: {
    underline: "border-purple-600 text-purple-600 dark:border-purple-400 dark:text-purple-400",
    bottom: "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 scale-105",
  },
  rose: {
    underline: "border-rose-600 text-rose-600 dark:border-rose-400 dark:text-rose-400",
    bottom: "text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30 scale-105",
  },
  slate: {
    underline: "border-slate-800 text-slate-800 dark:border-white dark:text-white",
    bottom: "text-slate-800 dark:text-white bg-slate-100 dark:bg-slate-800 scale-105",
  },
};

const inactiveClasses: Record<TabVariant, string> = {
  underline: "border-transparent text-on-surface-variant hover:text-on-surface",
  bottom: "text-on-surface-variant hover:text-on-surface hover:bg-on-surface/8",
};

interface TabButtonProps<T extends string> extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onSelect" | "value"> {
  value: T;
  activeValue: T;
  onSelect: (value: T) => void;
  children: ReactNode;
  icon?: ReactNode;
  tone?: TabTone;
  variant?: TabVariant;
  className?: string;
  activeIconClassName?: string;
}

export function TabButton<T extends string>({
  value,
  activeValue,
  onSelect,
  children,
  icon,
  tone = "blue",
  variant = "underline",
  className,
  activeIconClassName,
  onClick,
  ...props
}: TabButtonProps<T>) {
  const isActive = value === activeValue;

  return (
    <button
      {...props}
      type="button"
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) onSelect(value);
      }}
      aria-selected={props.role === "tab" ? isActive : props["aria-selected"]}
      className={cn(
        variant === "underline"
          ? "flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition-all border-b-2 -mb-px shrink-0 cursor-pointer"
          : "flex flex-col items-center justify-center p-3 flex-1 min-h-14 rounded-xl transition-all duration-300 relative",
        isActive ? activeToneClasses[tone][variant] : inactiveClasses[variant],
        className
      )}
    >
      {icon ? <span className={cn("inline-flex", isActive && activeIconClassName)}>{icon}</span> : null}
      {children}
    </button>
  );
}

interface TabsProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  className?: string;
}

export function Tabs({ children, className, ...props }: TabsProps) {
  return (
    <div className={cn("flex border-b border-outline-variant gap-1 overflow-x-auto pb-px", className)} {...props}>
      {children}
    </div>
  );
}
