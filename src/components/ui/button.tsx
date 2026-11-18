import type { ComponentProps } from "react";
import { Slot } from "radix-ui";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

export type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Renderiza o filho (ex.: Link) com o estilo do botão. */
  asChild?: boolean;
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cx("ui-button", `ui-button-${variant}`, size === "sm" && "ui-button-sm", className);
}

export function Button({ variant = "primary", size = "md", asChild = false, className, type, ...props }: ButtonProps) {
  if (asChild) return <Slot.Root className={buttonClass(variant, size, className)} {...props} />;
  return <button type={type ?? "button"} className={buttonClass(variant, size, className)} {...props} />;
}
