"use client";
import type { ReactNode } from "react";
import { Tooltip as TooltipPrimitive } from "radix-ui";

/** Provedor único (fica no layout raiz). */
export function TooltipProvider({ children, delayDuration = 350 }: { children: ReactNode; delayDuration?: number }) {
  return <TooltipPrimitive.Provider delayDuration={delayDuration}>{children}</TooltipPrimitive.Provider>;
}

/**
 * Dica curta ao passar o mouse ou focar. Não use para informação essencial:
 * no toque a dica não aparece, então avisos de segurança precisam estar também no texto ou num painel.
 */
export function Tooltip({ content, children, side = "top" }: { content: ReactNode; children: ReactNode; side?: "top" | "right" | "bottom" | "left" }) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side={side} sideOffset={6} collisionPadding={8} className="ui-tooltip">
          {content}
          <TooltipPrimitive.Arrow className="ui-tooltip-arrow" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
