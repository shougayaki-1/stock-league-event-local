import { forwardRef } from "react";
import type { SelectHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  containerClassName?: string;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(({ className, containerClassName, label, error, children, ...props }, ref) => (
  <div className={cn("w-full", containerClassName)}>
    {label && <label className="block text-xs font-medium text-on-surface-variant mb-1.5">{label}</label>}
    <select
      ref={ref}
      className={cn(
        "w-full px-4 py-3 bg-surface border border-outline rounded-xl outline-none transition-colors text-on-surface font-medium disabled:opacity-50",
        "focus:border-primary focus:border-2 focus:px-[15px] focus:py-[11px]",
        error && "border-error focus:border-error",
        className
      )}
      {...props}
    >
      {children}
    </select>
    {error && <p className="text-[10px] font-medium text-error mt-1">{error}</p>}
  </div>
));

Select.displayName = "Select";
export default Select;
