"use client";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx";
import { Tooltip } from "./tooltip";

export type IconButtonProps = Omit<ComponentProps<"button">, "children" | "aria-label"> & {
  /** Nome acessível obrigatório; também vira a dica, salvo `tooltip={false}`. */
  label: string;
  icon: ReactNode;
  variant?: "ghost" | "secondary" | "primary";
  size?: "sm" | "md";
  tooltip?: boolean;
};

export function IconButton({ label, icon, variant = "ghost", size = "md", tooltip = true, className, type, ...props }: IconButtonProps) {
  const button = (
    <button type={type ?? "button"} aria-label={label} className={cx("ui-icon-button", `ui-icon-button-${variant}`, size === "sm" && "ui-icon-button-sm", className)} {...props}>
      <span aria-hidden="true" className="ui-icon-slot">{icon}</span>
    </button>
  );
  return tooltip ? <Tooltip content={label}>{button}</Tooltip> : button;
}
