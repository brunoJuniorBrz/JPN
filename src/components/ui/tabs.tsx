"use client";
import type { ComponentProps } from "react";
import { Tabs as TabsPrimitive } from "radix-ui";
import { cx } from "./cx";

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cx("ui-tabs-list", className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return <TabsPrimitive.Trigger className={cx("ui-tabs-trigger", className)} {...props} />;
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cx("ui-tabs-content", className)} {...props} />;
}
