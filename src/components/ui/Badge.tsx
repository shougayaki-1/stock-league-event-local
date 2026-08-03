import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "success" | "danger" | "warning" | "info";
}

export default function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const variants = {
    default: "bg-surface-variant text-on-surface-variant",
    success: "bg-success-container text-on-success-container",
    danger: "bg-error-container text-error",
    warning: "bg-warning-container text-on-warning-container",
    info: "bg-info-container text-on-info-container",
  };

  return (
    <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wide", variants[variant], className)} {...props} />
  );
}
