"use client";
import type { ComponentProps, ReactNode } from "react";
import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { cx } from "./cx";

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

export type SheetSide = "right" | "left" | "bottom";

export type SheetContentProps = Omit<ComponentProps<typeof DialogPrimitive.Content>, "title"> & {
  title: ReactNode;
  description?: ReactNode;
  /** Lado de entrada. No celular use "bottom" (inspetor). */
  side?: SheetSide;
};

/** Painel lateral ou inferior modal (Dialog do Radix): foco preso, Esc fecha. */
export function SheetContent({ title, description, side = "right", className, children, ...props }: SheetContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="ui-overlay" />
      <DialogPrimitive.Content className={cx("ui-sheet", `ui-sheet-${side}`, className)} {...(description ? {} : { "aria-describedby": undefined })} {...props}>
        {side === "bottom" && <span aria-hidden="true" className="ui-sheet-grabber" />}
        <header className="ui-dialog-header">
          <div>
            <DialogPrimitive.Title className="ui-dialog-title">{title}</DialogPrimitive.Title>
            {description && <DialogPrimitive.Description className="ui-dialog-description">{description}</DialogPrimitive.Description>}
          </div>
          <DialogPrimitive.Close className="ui-icon-button ui-icon-button-ghost ui-icon-button-sm" aria-label="Fechar"><X size={16} aria-hidden="true" /></DialogPrimitive.Close>
        </header>
        <div className="ui-sheet-body">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
