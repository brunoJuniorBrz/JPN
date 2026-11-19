# Integração isolada — editor de tesoura e Studio (#145 + #146)

Data: 18/11/2026. Branch: `integration/tesoura-studio-145-146`. Pais do merge inicial: `085c1385` (#146) e `b90842c7` (#145).

## Escopo e conflitos

A árvore parte do #146 para preservar as correções comerciais, a navegação sem sidebar duplicada, os testes de layout e a configuração de deploy bloqueado. Acrescenta o Studio F0–F6 e as duas águas do #145. Arquivos concorrentes relevantes: `src/domain/truss-editor.ts`, `src/components/truss/truss-editor.tsx`, `src/domain/truss-editor.test.ts`, `src/components/app-shell.tsx`, `src/app/globals.css`, e componentes de apresentação. Os tokens do Studio e o botão de tema foram mesclados com a navegação do #146.

## Evidência original de CI e causa

- #145, workflow [44311953468](https://github.com/brunoJuniorBrz/JPN/actions/runs/44311953468): `application` vermelho porque `blankTruss()` herdava seis linhas de terças e passo 1500 mm da obra do Tom mesmo em vão genérico de 6 m.
- #146, workflow [44332284367](https://github.com/brunoJuniorBrz/JPN/actions/runs/44332284367): `application` vermelho porque o teste sintético injetava `.project-studio` no DOM sem navegar para o Studio real; a checagem da sidebar falhava após a atualização da página. O teste passa a usar a rota real.

## Contratos de aceitação

1. Obra do Tom 8 × 10: exemplo de uma água explicitamente acionado, sem alterar seus quantitativos de regressão.
2. Obra nova: valores independentes do Tom e todos os preços comerciais sem declaração (`null`). Nenhuma capacidade resistente é inferida dos perfis visuais.
3. Projeto 12 × 20 em duas águas: os 5 pórticos só são gerados quando o espaçamento de 5 m foi declarado no planejamento. As linhas de terça são derivadas do espaçamento comercial declarado; o trecho longitudinal de 5 m cabe na barra de 6 m.
4. Comprimento longitudinal maior que a barra sem outra disposição declarada: erro explícito, sem criar tesouras/apoios ou emenda resistente por adivinhação.
5. Browser: testar o Studio real, recolher/reabrir trilho, visualização 3D em dois tamanhos, abertura de arquivos e aviso de fabricação.
6. Manter bloqueios `computedStructuralApproval=false`, `fabricationRelease=false`, `NOT_READY_BLOCKED`. Sem habilitar deploy.

## Limites

Quantitativos e geometria são preliminares. Comprimento de barra não é critério de estabilidade nem de escolha de espaçamento resistente. Emenda de terça longa, apoio, ligações, cargas e propriedades E/G/I/J permanecem pendentes de declaração e verificação. A main não deve ser atualizada até todos os testes obrigatórios e revisão técnica estarem verdes.
