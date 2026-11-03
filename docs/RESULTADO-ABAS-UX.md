# Resultado em quatro áreas — reorganização visual do JPN

## Escopo

Branch `feat/result-workspace-tabs`, baseada no Studio 3D do PR #23.
**Exclusivamente interface, navegação e apresentação:** não altera algoritmos de
geometria, motor de resistência, solver PyNite, seção física, plano de corte,
orçamento, composição de cargas, exportadores ou esquemas persistidos.

Referência: captura de quatro páginas fornecida pelo usuário em 03/11/2026.
O problema foi a sequência extensa de 3D, quantitativos, pendências, downloads
e configuração de corte, mesmo quando o usuário só queria explorar o galpão.

## Comportamento

- `Modelo 3D` — primeira área do resultado. Mantém a visualização existente
  em 2D ou 3D, conforme o fluxo que abriu o projeto. O fluxo de entrada rápida
  abre diretamente a visualização sólida. Ocultar essa área via aba usa o atributo
  `hidden`, **sem desmontar a árvore React do `StructurePreview`**. O componente
  WebGL já criado deve sobreviver à troca de abas; o dimensionamento do canvas
  precisa ser atualizado pelo `ResizeObserver` existente ao voltar.
- `Materiais` — agrupamento **somente de apresentação** por perfil físico/comercial
  idêntico (inclui classificação de peça), total de peças/metragem e detalhes
  expansíveis de cada comprimento e seus IDs. Nenhuma linha original é perdida
  nos dados usados pelos PDFs, Excel, cálculo ou corte. A simulação de aproveitamento
  fica numa seção expansível e só é computada quando a aba Materiais está ativa.
- `Engenharia` — apresenta a quantidade de ocorrências na própria aba, agrupa
  avisos repetitivos por famílias, oferece expandir todas as mensagens originais,
  mantém hipóteses e limites dentro de detalhes e um seletor dos módulos de
  roteiro/preparação/análises experimentais. Os estados resistentes não são
  promovidos por uma mudança visual.
- `Arquivos` — reúne PDF/XLSX e as ferramentas de DXF/SVG/revisões. Os
  exportadores já imprimiam avisos de caráter preliminar; o download de
  quantitativos também passa a trazer `PRELIMINAR` no nome.

## Regras de segurança e apresentação

- A faixa `SEM DIMENSIONAMENTO CONCLUÍDO` está presente em **todas** as áreas e
  permanece visível ao navegar (sticky quando o layout permitir).
- Não mostrar `0 kg` como se fosse uma massa calculada: materiais sem massa
  física conhecida apresentam `Não determinada`.
- KPI do resultado: **quantidade de peças, comprimento total e área do telhado**.
  Linhas de tesouras, terças e espaçamentos são informações de contexto na
  área do modelo.
- Valores exibidos em metros e metros quadrados usam até duas casas decimais;
  nenhuma quantidade é arredondada no objeto da obra, algoritmo ou arquivo.
- Na visão 3D, opções 2D redundantes desaparecem, preservando o botão de retorno,
  os controles de câmera/seleção do Studio e os avisos de caráter preliminar.

## Testes acrescentados e ajustados

- `src/components/planning/result-presentation.test.ts`: conserva quantidade,
  IDs, precisão dos dados, separação de especificações diferentes e cada aviso
  individual por trás do agrupamento.
- `tests/e2e/result-workspace.spec.ts`: 375/1440 px, quatro abas, massa e
  pendências, navegação por teclado, acesso aos documentos, sobrevivência do
  mesmo DOM `canvas` entre trocas, ausência de rolagem horizontal ou mutação
  do projeto em `localStorage`.
- Testes de planejamento, entrada rápida, preparação, análise 3D, coordenação,
  integração mista e adaptador migrados para abrir a área correta.

### Estado de validação

A branch anterior do Studio 3D tinha CI verde. Novos pushes no momento
não têm **validação CI confiável**: os jobs do GitHub terminam como failure em
poucos segundos e sem etapas/logs recuperáveis. **Nenhuma suíte integral,
Playwright Safari real, build ou screenshot desta branch foi confirmada**.
Executar `pnpm typecheck`, `pnpm lint`, `pnpm test`,
`pnpm test:e2e`, `pnpm build` e um teste manual em Safari iPhone antes de
qualquer merge. Não fazer deploy de produção deste estado.

Esta branch deve ser reconciliada com o Studio #23 e, futuramente, com o
motor estrutural #37 sem sobrescrever alterações locais do Codex.
