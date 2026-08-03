import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(({ className, label, error, ...props }, ref) => {
  return (
    <div className="w-full">
      {label && <label className="block text-xs font-medium text-on-surface-variant mb-1.5">{label}</label>}
      <input
        ref={ref}
        className={cn(
          "w-full px-4 py-3 bg-surface border border-outline rounded-xl outline-none transition-colors text-on-surface placeholder:text-on-surface-variant/60",
          "focus:border-primary focus:border-2 focus:px-[15px] focus:py-[11px]",
          error && "border-error focus:border-error",
          className
        )}
        {...props}
      />
      {error && <p className="text-[10px] font-medium text-error mt-1">{error}</p>}
    </div>
  );
});

Input.displayName = "Input";
export default Input;