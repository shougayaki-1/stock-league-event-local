import { forwardRef } from "react";
import type { TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, label, error, ...props }, ref) => (
  <div className="w-full">
    {label && <label className="block text-xs font-medium text-on-surface-variant mb-1.5">{label}</label>}
    <textarea
      ref={ref}
      className={cn(
        "w-full px-4 py-3 bg-surface border border-outline rounded-xl outline-none transition-colors text-on-surface placeholder:text-on-surface-variant/60 disabled:opacity-50",
        "focus:border-primary focus:border-2 focus:px-[15px] focus:py-[11px]",
        error && "border-error focus:border-error",
        className
      )}
      {...props}
    />
    {error && <p className="text-[10px] font-medium text-error mt-1">{error}</p>}
  </div>
));

Textarea.displayName = "Textarea";
export default Textarea;
