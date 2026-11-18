import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Badge } from "./badge";
import { Button } from "./button";
import { IconButton } from "./icon-button";
import { Kbd } from "./kbd";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";
import { TooltipProvider } from "./tooltip";

describe("componentes base (F0)", () => {
  it("Button é type=button por padrão e aplica variante", () => {
    const html = renderToStaticMarkup(h(Button, { variant: "secondary" }, "Salvar"));
    expect(html).toContain('type="button"');
    expect(html).toContain("ui-button-secondary");
  });

  it("Button asChild repassa o estilo ao filho sem criar <button>", () => {
    const html = renderToStaticMarkup(h(Button, { asChild: true }, h("a", { href: "/projetos" }, "Projetos")));
    expect(html).toMatch(/^<a [^>]*class="ui-button ui-button-primary"/);
    expect(html).not.toContain("<button");
  });

  it("IconButton exige nome acessível e esconde o ícone", () => {
    const html = renderToStaticMarkup(h(TooltipProvider, null, h(IconButton, { label: "Fechar painel", icon: h("svg") })));
    expect(html).toContain('aria-label="Fechar painel"');
    expect(html).toContain('aria-hidden="true"');
  });

  it("Badge mostra o estado em texto, não só por cor", () => {
    const html = renderToStaticMarkup(h(Badge, { tone: "danger" }, "Bloqueado para fabricação"));
    expect(html).toContain("ui-badge-danger");
    expect(html).toContain("Bloqueado para fabricação");
  });

  it("Kbd monta combinações de teclas", () => {
    const html = renderToStaticMarkup(h(Kbd, { keys: ["Ctrl", "K"] }));
    expect(html.match(/<kbd class="ui-kbd">/g)).toHaveLength(2);
  });

  it("Tabs gera tablist/tab/tabpanel com estado", () => {
    const html = renderToStaticMarkup(h(Tabs, { defaultValue: "a" },
      h(TabsList, { "aria-label": "Seções" }, h(TabsTrigger, { value: "a" }, "Modelo"), h(TabsTrigger, { value: "b" }, "Materiais")),
      h(TabsContent, { value: "a" }, "conteúdo A")));
    expect(html).toContain('role="tablist"');
    expect(html.match(/role="tab"/g)).toHaveLength(2);
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('role="tabpanel"');
  });
});
