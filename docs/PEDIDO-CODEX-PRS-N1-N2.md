# Pedido ao Codex: abrir os PRs draft do N1 e do N2

Escrito em 16/11/2026 pela sessão Claude que implementou N1 e N2. As branches estão no GitHub,
mas não foi possível abrir os PRs: sem `gh` e sem login no navegador dessa sessão.

## O que fazer

1. Abrir **PR draft** do N1:
   - head `fix/n1-nbr6123-single-edition` (SHA `605c33f`), base `main`;
   - título: `N1: edição única da NBR 6123 (versão corrigida, Errata 1:2025) em todo o vento`;
   - corpo: o conteúdo de `docs/N1-EDICAO-UNICA-NBR6123.md` dessa branch.
2. Abrir **PR draft** do N2:
   - head `fix/n2-nbr6123-roof-cpe-shed-slopes` (SHA `9ead6ae`), base `fix/n1-nbr6123-single-edition`.
     A branch foi empilhada sobre o N1 para não conflitar em `reviewed-roof-catalog.ts`; depois do
     merge do N1, mudar a base para `main`;
   - título: `N2: Cpe de cobertura de galpão a 10° e 15° (NBR 6123, Tabelas 7 e 8)`;
   - corpo: o conteúdo de `docs/N2-CPE-COBERTURA-GALPAO.md` dessa branch.
3. Trocar "PR draft a abrir" pelo número dos PRs nas linhas N1 e N2 de `docs/PENDENCIAS-NORMATIVAS.md`.
4. Rodar a suíte completa (`pnpm test`) nas duas branches, num ambiente com o `.venv` do projeto.
   Na sessão Claude, os testes de vento e de cobertura passaram todos (com PyNite real), além de
   `tsc` e lint. A suíte inteira travou em testes de processo Python daquele ambiente e não foi concluída.

## Não fazer

- Não fazer merge nem deploy; os PRs ficam em draft para a revisão do Tom.
- Não alterar `computedStructuralApproval=false`, `fabricationRelease=false`, `NOT_READY_BLOCKED`.
- Não mexer nos valores normativos sem reconferir na norma (ver as notas de cada branch).
