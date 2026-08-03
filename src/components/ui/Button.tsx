import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { buttonClassNames } from "./buttonStyles";
import type { ButtonSize, ButtonVariant } from "./buttonStyles";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(({
  className,
  variant = "primary",
  size = "md",
  isLoading,
  children,
  disabled,
  type = "button",
  ...props
}, ref) => {

  return (
    <button ref={ref} type={type} disabled={isLoading || disabled} className={buttonClassNames({ variant, size, className })} {...props}>
      {isLoading ? <span className="animate-spin mr-2 border-2 border-current border-t-transparent rounded-full w-4 h-4" /> : null}
      {children}
    </button>
  );
});

Button.displayName = "Button";
export default Button;
