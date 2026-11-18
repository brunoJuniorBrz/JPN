"use client";
import type { ComponentProps, ReactNode } from "react";
import { X } from "lucide-react";
import { Dialog as DialogPrimitive, VisuallyHidden } from "radix-ui";
import { cx } from "./cx";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export type DialogContentProps = Omit<ComponentProps<typeof DialogPrimitive.Content>, "title"> & {
  /** Título obrigatório (nome acessível do diálogo). */
  title: ReactNode;
  description?: ReactNode;
  /** Esconde o título visualmente, mantendo-o para leitores de tela. */
  hideTitle?: boolean;
  footer?: ReactNode;
};

/** Diálogo modal: prende o foco, fecha com Esc e devolve o foco ao gatilho. */
export function DialogContent({ title, description, hideTitle, footer, className, children, ...props }: DialogContentProps) {
  const heading = <DialogPrimitive.Title className="ui-dialog-title">{title}</DialogPrimitive.Title>;
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="ui-overlay" />
      <DialogPrimitive.Content className={cx("ui-dialog", className)} {...(description ? {} : { "aria-describedby": undefined })} {...props}>
        <header className="ui-dialog-header">
          <div>
            {hideTitle ? <VisuallyHidden.Root>{heading}</VisuallyHidden.Root> : heading}
            {description && <DialogPrimitive.Description className="ui-dialog-description">{description}</DialogPrimitive.Description>}
          </div>
          <DialogPrimitive.Close className="ui-icon-button ui-icon-button-ghost ui-icon-button-sm" aria-label="Fechar"><X size={16} aria-hidden="true" /></DialogPrimitive.Close>
        </header>
        <div className="ui-dialog-body">{children}</div>
        {footer && <footer className="ui-dialog-footer">{footer}</footer>}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
