"use client";
import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Popover } from "radix-ui";

/**
 * Dica local recolhida num ícone (F4). Abre por clique, toque ou teclado (Popover, não só hover),
 * então funciona no celular. Use só para orientação; avisos de segurança e bloqueios ficam em texto visível.
 */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  return <Popover.Root>
    <Popover.Trigger className="ui-icon-button ui-icon-button-ghost ui-icon-button-sm ui-info-tip" aria-label={`Mais informações: ${label}`}>
      <Info size={16} aria-hidden="true" />
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content className="ui-tooltip ui-info-tip-content" side="top" sideOffset={6} collisionPadding={8}>
        {children}
        <Popover.Arrow className="ui-tooltip-arrow" />
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>;
}
