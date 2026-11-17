# Decisões de interface

Registro curto das decisões tomadas sem consulta (ver regra em [PLANO-UI.md](PLANO-UI.md)).

## F0 — Base de design

1. **Tokens com os valores atuais.** A F0 não muda a aparência além da fonte. Por isso os tokens `--color-*` recebem as mesmas cores já usadas, e as variáveis antigas (`--ink`, `--gold`…) viram apelidos. As 742 linhas antigas não foram reescritas; a migração para os tokens acontece aos poucos, nas fases que mexerem em cada tela.
2. **Inter via `next/font/google`.** A fonte é auto-hospedada no build, sem requisição ao Google no navegador. Usa `display: swap` e a variável `--font-inter`. A pilha de reserva é `system-ui, Arial`.
3. **`components/ui/` ao lado de `components/ui.tsx`.** O arquivo antigo não foi movido, para não tocar nos imports existentes. Os componentes novos são importados por arquivo (`@/components/ui/button`), sem barril `index.ts`, porque `@/components/ui` já resolve para `ui.tsx`.
4. **Radix pelo pacote único `radix-ui` (1.8.1).** `cmdk` (1.1.1) já foi instalado e só será usado na F5 (Ctrl+K). As versões ficam exatas, como as demais dependências principais.
5. **CSS próprio com prefixo `ui-`** em `src/app/ui-primitives.css`, no lugar de utilitários Tailwind. Segue o padrão do projeto e evita colisão com `.button`, `.panel` e outras classes antigas.
6. **`TooltipProvider` no layout raiz.** A dica só aparece em hover ou foco, não no toque, e por isso nunca carrega informação essencial.
7. **`ContextMenuTrigger` com teclado.** O Radix só abre o menu de contexto pelo evento do mouse. Shift+F10 e a tecla Menu disparam esse evento no centro do elemento.
8. **`IconButton` exige `label`.** O tipo não aceita `aria-label` solto, para que nenhum botão de ícone fique sem nome.
9. **Dialog e Sheet exigem `title`.** O nome acessível é obrigatório; `hideTitle` esconde o título só visualmente. Sem `description`, o `aria-describedby` é omitido, para não apontar para nada.
10. **Alvos de toque.** 44px no tamanho padrão e 36px no `sm`, este só para barras densas de desktop.
