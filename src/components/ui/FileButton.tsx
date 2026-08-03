import type { InputHTMLAttributes, ReactNode } from "react";
import type { ButtonSize, ButtonVariant } from "./buttonStyles";
import { buttonClassNames } from "./buttonStyles";
import { cn } from "../../lib/utils";

interface FileButtonProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size" | "className" | "children"> {
  children: ReactNode;
  className?: string;
  inputClassName?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export default function FileButton({
  children,
  className,
  inputClassName,
  variant = "primary",
  size = "md",
  disabled,
  ...props
}: FileButtonProps) {
  return (
    <label className={buttonClassNames({ variant, size, className: cn("cursor-pointer", disabled && "opacity-50 pointer-events-none", className) })}>
      {children}
      <input type="file" disabled={disabled} className={cn("hidden", inputClassName)} {...props} />
    </label>
  );
}
