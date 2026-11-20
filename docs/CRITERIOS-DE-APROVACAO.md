# Critérios de aprovação de PRs da JPN

A JPN é, antes de tudo, um sistema para gerar **listas de materiais precisas** para estruturas
metálicas. CAD, 3D e cálculo são ferramentas para chegar nesse resultado e não podem virar obstáculo.

## Ordem de prioridades

1. **Precisão dos materiais:** quantidades corretas de perfis, barras, pilares, terças, chapas,
   chumbadores, pesos e comprimentos para compra.
2. **Facilidade de uso:** o Tom informa as medidas da obra, escolhe as opções necessárias e o
   sistema faz o restante.
3. **Orçamento confiável:** materiais organizados, sem duplicações, omissões ou estimativas escondidas.
4. **3D e CAD:** representam fielmente a estrutura e ajudam a conferir o projeto.
5. **Cálculo estrutural:** valida as hipóteses possíveis sem confundir uma lista de compras com uma
   estrutura aprovada para fabricação.

## Regra central

Nenhuma melhoria é aprovada se aumentar a complexidade do uso cotidiano sem um benefício
proporcional à precisão dos materiais. Se deixar o sistema mais bonito ou sofisticado mas atrapalhar
o trabalho diário do Tom, simplificamos ou rejeitamos.

Informação técnica (vínculos, capacidades de apoio, inspeção de muro, hipóteses de cálculo) fica em
seção **avançada**. A falta dela pode bloquear a **aprovação estrutural**, mas nunca a geração de uma
**lista preliminar de materiais**, claramente identificada como não validada.

## Três testes obrigatórios para cada funcionalidade nova

1. **Obra antiga, mesma lista.** Uma obra existente, com os dados inalterados, produz exatamente a
   mesma lista de materiais. Referência: `src/domain/truss-materials-golden.test.ts`, com gabarito
   gerado pelo código ANTERIOR à mudança (`src/domain/test-support/truss-materials-golden.json`).
   Nunca regenerar o gabarito com o código novo para "fazer passar".
2. **Configuração nova, quantitativo certo.** Uma obra com as opções novas gera os quantitativos
   corretos, sem material sobrando ou faltando (ex.: `src/domain/truss-mixed-supports.test.ts`).
3. **Fluxo normal simples.** O preenchimento do dia a dia continua simples e não exige informação de
   engenharia para o orçamento preliminar (ex.: `tests/e2e/tesoura-apoios-mistos.spec.ts`).

Objetivo: o Tom cadastra uma cobertura em poucos minutos e obtém uma lista confiável para comprar.

Bloqueios permanentes: `computedStructuralApproval=false`, `fabricationRelease=false`,
`NOT_READY_BLOCKED`; revisão profissional obrigatória.
