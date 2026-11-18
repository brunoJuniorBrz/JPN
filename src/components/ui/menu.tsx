"use client";
import type { ComponentProps, ReactNode } from "react";
import { Check } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { cx } from "./cx";

/** Menu suspenso acessível (setas, Home/End, digitação, Esc). */
export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;
export const MenuGroup = DropdownMenu.Group;

export function MenuContent({ className, sideOffset = 6, align = "start", ...props }: ComponentProps<typeof DropdownMenu.Content>) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content sideOffset={sideOffset} align={align} collisionPadding={8} className={cx("ui-menu", className)} {...props} />
    </DropdownMenu.Portal>
  );
}

export function MenuItem({ className, icon, shortcut, danger, children, ...props }: ComponentProps<typeof DropdownMenu.Item> & { icon?: ReactNode; shortcut?: string; danger?: boolean }) {
  return (
    <DropdownMenu.Item className={cx("ui-menu-item", danger && "ui-menu-item-danger", className)} {...props}>
      {icon && <span aria-hidden="true" className="ui-menu-icon">{icon}</span>}
      <span className="ui-menu-text">{children}</span>
      {shortcut && <span className="ui-menu-shortcut">{shortcut}</span>}
    </DropdownMenu.Item>
  );
}

export function MenuCheckboxItem({ className, children, ...props }: ComponentProps<typeof DropdownMenu.CheckboxItem>) {
  return (
    <DropdownMenu.CheckboxItem className={cx("ui-menu-item", className)} {...props}>
      <span aria-hidden="true" className="ui-menu-icon"><DropdownMenu.ItemIndicator><Check size={14} /></DropdownMenu.ItemIndicator></span>
      <span className="ui-menu-text">{children}</span>
    </DropdownMenu.CheckboxItem>
  );
}

export function MenuLabel({ className, ...props }: ComponentProps<typeof DropdownMenu.Label>) {
  return <DropdownMenu.Label className={cx("ui-menu-label", className)} {...props} />;
}

export function MenuSeparator({ className, ...props }: ComponentProps<typeof DropdownMenu.Separator>) {
  return <DropdownMenu.Separator className={cx("ui-menu-separator", className)} {...props} />;
}
