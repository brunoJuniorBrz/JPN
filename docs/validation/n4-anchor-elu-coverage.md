# N4 — Cobertura de ELU e bloqueios de arrancamento (auditoria técnica)

## Defeito A1 — combinação mínima por hipótese
A existência de `1,0·G` não basta se a única hipótese de sucção disponível é `1,25·G + 1,4·W`. A reação de `3,10−1,4·6,40=−5,86 kN` governa frente à disponível `1,25·3,10−1,4·6,40=−5,085 kN`. O check compara **cada vetor de ações variáveis ativas** entre ELUs, exigindo uma combinação com permanentes favoráveis **na mesma hipótese**. Caso falte, o apoio fica PENDENTE, não OK. Quando existem somente permanentes, a combinação mínima também é requerida.

## Bloqueios de proveniência e concomitância
- Ausência, finalidade desconhecida ou falta de resultados de ELU não pode usar ELS como envoltória de ELU. Sem resultado identificado, demandas e razões são `null`, com marcador PENDENTE.
- Tração + cisalhamento concomitantes são reportados pela mesma ELU que governa tração. Como a interação não é verificada, geram pendência visível, inclusive no Studio.
- Momento de reação não verificado mantém pendência.
- O valor declarado **não é** capacidade estrutural verificada: não calcula chumbador, substrato, efeito alavanca, borda, distribuição entre chumbadores ou interação.

## Escopo dos ensaios
Regressões no `src/domain/anchor-pullout.test.ts` abrangem HC-C, fraude da combinação `1,0G` desacoplada da sucção, ELS sem finalidade e ELU parcialmente ausente. Reações sintéticas não substituem ensaios reais no PyNite nem revisão profissional da NBR 8681/6123/8800.

Pendentes com engenheiro: Cpi mais nocivo (A2), resistência do chumbador (A4), capacidade por chumbador ou por apoio (A5) e cinco interpretações da revisão NBR 8681.

Sem liberação: `computedStructuralApproval=false`, `fabricationRelease=false`, `NOT_READY_BLOCKED`.


## A5 — Capacidade de tipo versus capacidade de apoio

O contrato de tipo de ancoragem ainda não discrimina numericamente a capacidade **por chumbador** da capacidade verificada **por conjunto do apoio**. Comparar diretamente a reação do apoio com um tipo de catálogo pode induzir falsa aprovação. Por isso, enquanto não houver declaração estruturada, inspeção e distribuição de esforços revisadas, valores provenientes de `anchorTypeId` permanecem `ANCHOR_CAPACITY_SCOPE_PENDING` e o Studio exibe **PENDENTE**, ainda que a razão isolada seja inferior a 1. Capacidade explicitamente declarada por apoio é tratada em separado, mantendo as demais limitações da revisão técnica.
