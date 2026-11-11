# M41-P4 — Auditoria da transferência de pressão de fachada às barras do solver

**Estado:** PR draft dependente do PR #76. CI e revisão numérica pendentes. **Não calcula vento normativo e não libera fabricação.**

## Cadeia rastreada

1. A fachada é medida em XYZ e classificada quanto à situação do fechamento, com revisão e origem rastreáveis (M41-P1/P2).
2. A pressão líquida **fornecida por responsável externo** é identificada por caso e revisão; não há coeficiente Cpe, Cpi ou fator de velocidade inferido (M41-P3).
3. O carregamento é dividido apenas entre pilares físicos verticais completos de uma fachada retangular revestida, sem aberturas. Área, forças e momentos da distribuição são preservados (M41-P3).
4. Na requisição real `jpn.mixed3d/2`, a auditoria reconstitui a distribuição a partir da declaração atual da obra e verifica os elementos do solver, não apenas os dados de tela.
5. Cada elemento do solver é projetado sobre o eixo do pilar físico de origem; todos os intervalos devem recobrir o pilar **exatamente uma vez**, sem lacunas ou sobreposições. Se o solver discretizou a barra em vários elementos, nenhum trecho pode receber carga duplicada.
6. Cada `member_load` de fachada deve pertencer a um cenário, a uma zona e a uma barra física comprovados. Vetor global N/m, caso, fonte e revisão são comparados. Cargas extras são rejeitadas.
7. Para cada fachada e caso: `sum(F_transmitidas)=F_declarada` e `sum(r × F_transmitidas)=M_declarado`, em N e N·m e nos três eixos.

## Oráculo analítico

Fachada de 6 × 4 m, pressão líquida de ensaio 500 Pa para dentro da normal externa +X, três pilares em Y=0, 3 e 6 m:

- Resultante externa: `(-12000,0,0) N`
- Momento externo em origem global: `(0,-24000,+36000) N·m`
- Cargas distribuídas nos pilares: `(-750,-1500,-750) N/m`, cada um de 4 m
- Teste de integração obrigatório: `adaptLoadedMixedProject → facade_solver_audit → jpn.mixed3d/2 → PyNite`, com equilíbrio efetivo de forças nas reações

Cenários adversariais: alterar um componente N/m, retirar um pilar do mapeamento, criar carga fictícia com prefixo `FACADE:`, mudar a geometria ou revisão de fachada, permitir barra fora do eixo e segmentação sobreposta. Qualquer desvio deve bloquear a preparação numérica.

## Restrições

A distribuição corresponde apenas à idealização declarada de chapa simplesmente apoiada entre pilares. Ainda faltam verificação real do sistema de fixação, terças/travessas horizontais, transmissão pelas ligações e contraventamentos, pressão interna, zonas aerodinâmicas, combinação normativa das ações, estabilidade e dimensionamento resistente.

**Sinalização invariável:** `normativeWindValidated=false`, `computedStructuralApproval=false`, `fabricationRelease=false`, `NOT_READY_BLOCKED`.

Este módulo comprova consistência de entrada de carga na malha de barras. Não comprova capacidade do fechamento, resistência dos pilares, fundações, paredes existentes nem conformidade com NBR 6123.
