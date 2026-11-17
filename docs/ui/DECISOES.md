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

## F1 parte A — Shell do estúdio (desktop)

1. **Estrutura.** `ProjectStudio` (em `planning/project-studio.tsx`) é uma grade de 3 colunas a partir de 1200px: etapas (168px), visualização e inspetor (40%), com a barra de status embaixo.
   - A visualização e as etapas ficam fixas (`sticky`); a página rola o inspetor. Não há rolagens aninhadas no inspetor, o que facilita o e2e e o teclado.
   - O layout é um só para todas as larguras. Abaixo de 1200px as áreas empilham com o inspetor antes da visualização, como era o fluxo antigo. O layout móvel próprio fica para a parte B.
2. **Mapa das etapas.**

   | Etapa | Conteúdo |
   |---|---|
   | Obra | dados gerais; importar modelo; referência do Tom; estrutura declarada |
   | Geometria | antigo passo Medidas |
   | Estrutura | antigo passo Estrutura |
   | Cargas | antigo "Preparar análise" |
   | Análise | roteiro estrutural, análise disponível, 3D experimental e Análise Estrutural Experimental |
   | Verificação | pendências da revisão técnica, com atalho para os resultados da análise |
   | Materiais | quantitativos, aproveitamento e dossiê |
   | Arquivos | listas, DXF/SVG e revisões |

   No modelo declarado, Cargas aponta para a preparação física (etapa Estrutura), que já reúne apoios, cargas e combinações.
3. **Fim do select e das abas aninhadas.** As 4 ferramentas de análise viram uma navegação própria, "Ferramentas de análise", sempre visível abaixo das etapas: qualquer ferramenta fica a 1 clique.
   - Essa navegação é separada de "Etapas do levantamento" porque "Análise Estrutural…" contém "Estrutura" no nome e confundiria os seletores.
   - As abas Modelo 3D, Materiais, Engenharia e Arquivos deixaram de existir: o modelo está sempre no centro.
4. **Workbench sempre montado.** O `ProjectWorkbench` fica montado em todas as etapas (oculto quando não se aplica), para não perder o job e o polling da análise mista. A ferramenta vem da etapa, não de estado interno.
5. **URLs.**
   - `?etapa=0..3` continua valendo: 0 Obra, 1 Geometria, 2 Estrutura e 3 Materiais. O antigo Resultado mostrava modelo e quantitativos, e agora o modelo está sempre visível.
   - `?etapa=<nome>` também é aceito (por exemplo `?etapa=analise`).
   - `?fluxo` e `?vista=3d` continuam iguais.
6. **Visualização.** Em desktop, a tela 2D/3D aparece primeiro e os controles extras do visualizador ficam abaixo dela.
   - Isso é feito só com CSS (`order` e `display: contents`), sem reescrever o `structure-3d.tsx`.
   - A ordem de foco segue o DOM antigo. A F2/F3 deve reorganizar os controles no código.
7. **Barra de status.** Mostra o selo "Bloqueado para fabricação", o aviso permanente de segurança (`result-safety-warning`) e os totais (`takeoff-totals`), sempre visíveis. O estado de salvamento fica no rodapé do inspetor, como antes.
8. **Testes e2e.** Os testes antigos são protegidos pelo `audit.py`.
   - As mudanças necessárias (helper `result-tabs.ts` e 7 specs) são fixadas por blob em `REVIEWED_AMENDMENTS`, para revisão do dono do projeto no PR.
   - O helper mantém `openResultTab` e `openEngineeringTool`, agora traduzidos para etapas e ferramentas.
