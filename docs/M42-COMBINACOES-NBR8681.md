# M42-P1 — Combinações ELU/ELS (ABNT NBR 8681:2025)

Fonte (atualizada no N3, 16/11/2026): PDF da ABNT NBR 8681:2025, SHA-256 `f4020c71…2d9c`, com carimbo de exemplar
licenciado à UFRGS. O uso foi autorizado pelo dono do projeto até a entrada do exemplar carimbado em seu nome, antes da liberação.
Conferido célula a célula (Tabelas 1 a 6, 5.1.4.3), sem diferenças. **Conferência documental, não homologação**;
erratas não verificadas; revisão profissional pendente. Fonte única: `data/normas/nbr8681-2025-combinations.json`
(o extrato privado da cobertura deriva dele; ver `src/domain/nbr8681-source.ts`).

## O que foi verificado (imagens a 130 dpi; Tabelas 1, 2, 4 e 6 ampliadas a 200 dpi — sem ambiguidades)
| Item | Cláusula / tabela |
|---|---|
| ELU normal, especial/construção, excepcional | 5.1.3.1, 5.1.3.2, 5.1.3.3 |
| ELS quase permanente, frequente, rara | 5.1.5.2, 5.1.5.3, 5.1.5.4 (a edição 2025 usa "rara"; o motor rotula `SLS-characteristic`) |
| γg separadas / agrupadas / protensão e recalques | Tabelas 1, 2, 3 (p.14–15) |
| γq separadas / conjuntas, γq,exc | Tabelas 4 e 5, 5.1.4.3 (p.15–16) |
| ψ0, ψ1, ψ2 | Tabela 6 (p.16–17); nota c (fogo, ψ2×0,7) registrada, não aplicada |
| Critérios (permanentes sempre; só parcelas desfavoráveis das variáveis; dois conjuntos de permanentes) | 4.3.3.1–4.3.3.3, 5.1.3.1 |

Não aplicados (a norma não fixa valores gerais ou exige norma específica): γn (5.3.3), I (5.3.4), γf1·γf3 (5.3.2.1), fadiga (Tabela 7),
perda de equilíbrio como corpo rígido (5.1.7). Pontes e pontes rolantes (Tabela 6, conclusão) estão registradas, **não habilitadas**.

## Integração (sem biblioteca isolada)
`generateNbr8681Combinations` → declaração `jpn.engineering-combinations/1` existente → `applyEngineeringCombinations` (valida) →
`loaded-mixed-adapter` → PyNite. Cada combinação sai com fatores γ·ψ, tabela, papel (permanente/principal/acompanhante/ausente) e hipótese.
- **Ações favoráveis/desfavoráveis:** `permanentSets` (declarado, nunca presumido) gera conjuntos γg desfavorável e favorável; ações variáveis só entram como principal, acompanhante (ψ0) ou ausente (subconjuntos).
- **Exclusividade:** vento (todas as direções e alternativas de Cpi) deve estar em **um único grupo exclusivo**; nunca dois ventos juntos.
- **Sem duplicidade:** cada caso é classificado uma única vez; o guarda `POSSIBLE_DOUBLE_COUNT` existente continua exigindo revisão explícita após trocar as combinações (a aplicação remove a revisão anterior).
- **Bloqueios:** caso sem classificação, tipo de permanente ausente (modo separado), vento sem `psiRow=wind`/grupo, ações conjuntas sem permanentes agrupadas, especial/excepcional sem declaração, ψ/linhas não habilitadas, mais de **10 combinações por execução**.

## Limitação conhecida
O contrato de engenharia e o solver `mixed3d` aceitam no máximo **10 combinações** por execução. Conjuntos maiores (por exemplo 4 direções de vento com
dois conjuntos de permanentes) devem ser divididos por **famílias** (`families`), uma execução por grupo; elevar o limite do solver exige PR próprio.

`computedStructuralApproval=false`, `fabricationRelease=false`, `NOT_READY_BLOCKED`. Dimensionamento, capacidade resistente e fundações não foram tocados.
