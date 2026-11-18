import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx";

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger";

/** Selo curto de estado. A cor nunca é a única pista: o texto diz o estado. */
export function Badge({ tone = "neutral", icon, className, children, ...props }: ComponentProps<"span"> & { tone?: BadgeTone; icon?: ReactNode }) {
  return (
    <span className={cx("ui-badge", `ui-badge-${tone}`, className)} {...props}>
      {icon && <span aria-hidden="true" className="ui-badge-icon">{icon}</span>}
      {children}
    </span>
  );
}
