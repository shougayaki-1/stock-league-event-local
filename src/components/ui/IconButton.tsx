import { forwardRef } from "react";
import type { ButtonProps } from "./Button";
import Button from "./Button";
import { cn } from "../../lib/utils";

export interface IconButtonProps extends Omit<ButtonProps, "size"> {
  "aria-label": string;
  size?: "sm" | "md" | "lg";
}

const sizeMap = {
  sm: "icon-sm",
  md: "icon-md",
  lg: "icon-lg",
} as const;

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(({
  className,
  variant = "subtle",
  size = "md",
  title,
  ...props
}, ref) => (
  <Button
    ref={ref}
    variant={variant}
    size={sizeMap[size]}
    title={title ?? props["aria-label"]}
    className={cn("shrink-0 rounded-full", className)}
    {...props}
  />
));

IconButton.displayName = "IconButton";
export default IconButton;
