import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

interface AdminPageShellProps {
  children: ReactNode;
  className?: string;
  maxWidthClassName?: string;
}

export default function AdminPageShell({
  children,
  className,
  maxWidthClassName = "max-w-[1800px]",
}: AdminPageShellProps) {
  return (
    <div
      className={cn(
        "mx-auto flex min-h-full w-full flex-col px-3 py-4 pb-32 sm:px-4 md:px-8 md:py-8 md:pb-10",
        maxWidthClassName,
        className
      )}
    >
      {children}
    </div>
  );
}
