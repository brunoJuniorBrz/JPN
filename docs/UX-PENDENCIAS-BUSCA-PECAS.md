# JPN — pendências navegáveis e busca de peças (UX incremental)

## Base e isolamento

Branch `feat/ux-actionable-pending-piece-search`, criada a partir do HEAD do PR #39 (`feat/result-workspace-tabs`, commit `6c704023`). PR #39 é empilhado no PR #23; este incremento deve ter base no PR #39, **não na main**.

Escopo restrito a apresentação, navegação e testes. Não modifica dados persistidos, schemas, cálculo geométrico, catálogo, quantitativos, orçamento, motor Python, CAD, exportadores, fatores ou critérios normativos.

## Pendências que levam ao campo

A função pura `locatePending` associa somente mensagens cadastrais reconhecidas a etapas:
- geometria -> Medidas;
- distribuição, tesouras, espaçamentos -> Estrutura;
- mensagens prefixadas por categoria física -> Estrutura com o grupo do perfil correspondente expandido.

Grupos com múltiplas categorias não selecionam arbitrariamente uma peça: abrem a etapa Estrutura. Avisos técnicos desconhecidos não recebem ação de correção. O usuário continua vendo todas as mensagens e o aviso de que não existe dimensionamento aprovado.

Os botões não executam análise, não alteram propriedades físicas e não removem pendências por si só.

## Busca por peça

No painel de desenho/3D, o usuário procura pelo ID ou categoria, sem distinguir maiúsculas. O seletor exibe até 50 resultados; o total é informado. Enter seleciona a primeira correspondência. A seleção existente continua preservada quando uma nova consulta não contém sua peça. A busca não altera a geometria ou a lista original; a ação de aproximação continua pertencendo ao visualizador 3D.

## Salvamento

O JPN já conta com autosave para projetos válidos no navegador via `DataProvider`, com debounce e flush em troca de visibilidade. **Esta entrega não implementa sincronização entre computadores nem salvamento de rascunhos inválidos.** Evitar texto que prometa recuperação em outros dispositivos. Exportar backup continua recomendado.

## Validação planejada

- `pnpm test -- src/components/planning/piece-search.test.ts src/components/planning/result-presentation.test.ts`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test:e2e tests/e2e/ux-actions.spec.ts`
- `pnpm test:e2e tests/e2e/result-workspace.spec.ts`
- `pnpm build`

Testes adicionados cobrem buscas exatas, categorias, limite de resultados, imutabilidade, navegação de pendências conhecidas, desconhecidas e agrupadas, além de cenários Playwright com 375px/1440px.

**Os testes estão incluídos no PR, mas ainda não foram executados por este ambiente.** O checkout de produção precisa rodar os comandos e o teste manual Safari iPhone antes do merge. CI histórica dos PRs em 03/11/2026 falhava antes da execução dos jobs. Sem merge ou deploy.
