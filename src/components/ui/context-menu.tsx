"use client";
import type { ComponentProps, KeyboardEvent, ReactNode } from "react";
import { ContextMenu as ContextMenuPrimitive } from "radix-ui";
import { cx } from "./cx";

/**
 * Menu de contexto (clique direito, toque longo, Shift+F10 / tecla Menu).
 * Toda ação aqui precisa existir também em outro lugar visível (menu ou inspetor):
 * menu de contexto não é descoberto por todo mundo.
 */
export const ContextMenu = ContextMenuPrimitive.Root;

/** Abre também por teclado (Shift+F10 ou tecla Menu), no centro do elemento focado. */
export function ContextMenuTrigger({ onKeyDown, ...props }: ComponentProps<typeof ContextMenuPrimitive.Trigger>) {
  return (
    <ContextMenuPrimitive.Trigger
      {...props}
      onKeyDown={(event: KeyboardEvent<HTMLSpanElement>) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
          event.preventDefault();
          // Centro da parte VISÍVEL do elemento: num gatilho maior que a tela, o menu nasce dentro dela.
          const rect = event.currentTarget.getBoundingClientRect();
          const left = Math.max(rect.left, 0), right = Math.min(rect.right, window.innerWidth);
          const top = Math.max(rect.top, 0), bottom = Math.min(rect.bottom, window.innerHeight);
          event.currentTarget.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: (left + right) / 2, clientY: (top + bottom) / 2 }));
        }
      }}
    />
  );
}

export function ContextMenuContent({ className, ...props }: ComponentProps<typeof ContextMenuPrimitive.Content>) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content collisionPadding={8} className={cx("ui-menu", className)} {...props} />
    </ContextMenuPrimitive.Portal>
  );
}

export function ContextMenuItem({ className, icon, shortcut, danger, children, ...props }: ComponentProps<typeof ContextMenuPrimitive.Item> & { icon?: ReactNode; shortcut?: string; danger?: boolean }) {
  return (
    <ContextMenuPrimitive.Item className={cx("ui-menu-item", danger && "ui-menu-item-danger", className)} {...props}>
      {icon && <span aria-hidden="true" className="ui-menu-icon">{icon}</span>}
      <span className="ui-menu-text">{children}</span>
      {shortcut && <span className="ui-menu-shortcut">{shortcut}</span>}
    </ContextMenuPrimitive.Item>
  );
}

export function ContextMenuLabel({ className, ...props }: ComponentProps<typeof ContextMenuPrimitive.Label>) {
  return <ContextMenuPrimitive.Label className={cx("ui-menu-label", className)} {...props} />;
}

export function ContextMenuSeparator({ className, ...props }: ComponentProps<typeof ContextMenuPrimitive.Separator>) {
  return <ContextMenuPrimitive.Separator className={cx("ui-menu-separator", className)} {...props} />;
}
