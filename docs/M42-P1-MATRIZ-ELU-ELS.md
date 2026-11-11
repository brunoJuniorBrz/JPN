# M42-P1 — Cobertura das ações declaradas na matriz ELU/ELS

**Estado:** PR draft, depende da cadeia #76–#77 e de CI. **Não calcula nem homologa fatores normativos**.

## Problema que este marco resolve

Um cadastro de ações pode estar formalmente correto e, ainda assim, conter casos que não aparecem em nenhuma combinação. Também pode haver duas combinações com nomes diferentes e vetores numericamente idênticos. Essas omissões podem criar **falsa sensação de análise completa**, especialmente com hipóteses alternativas de vento.

O M42-P1 usa `engineeringCombinationsSchema` e a verificação existente `verifyEngineeringCombinations`, preservando a vinculação aos fatores reais do projeto. Não substitui o lançamento de ações nem altera as resultantes enviadas ao solver.

## Auditoria independente

`auditEngineeringCombinationCoverage(declaration, cases, actualCombinations)` devolve:

- Matriz por combinação: `purpose`, `gamma*psi` declarado por caso, ações consideradas e ações com zero **explícito**; hipótese e fonte/revisão completas
- Participação de cada caso em ao menos uma combinação `ULS` e uma combinação do grupo `SLS`, sinalizando `M42_CASE_MISSING_ULS` ou `M42_CASE_MISSING_SLS` quando faltar
- Alternativas de grupos mutuamente exclusivos, em especial `wind`, com presença individual nas famílias ELU/ELS
- Vetores idênticos no mesmo estado-limite, sinalizados como `M42_DUPLICATE_COMBINATION_VECTOR`, sem fingir que representar dois IDs diferentes aumenta a cobertura
- `case-matrix-reviewed` quando todas as ações do cadastro aparecem em ambas as famílias e não há duplicações; `review-required` caso contrário

**Distinção essencial:** a checagem de participação é uma política conservadora de **completude do cenário de análise**, não uma regra que determina a forma normativa de cada combinação. Um zero deliberadamente aplicável à edição da norma exige justificativa do responsável e não pode ser preenchido automaticamente pelo JPN.

## Equações e ensaios

Para cada termo declarado `caseId`, o fator efetivo é `f = gamma × psi`. O JPN não escolhe `gamma` ou `psi` nem infere exclusões por nome. Um fator resultante igual a zero conta como **omitido naquele cenário**; todos os fatores devem existir explicitamente, inclusive os zeros.

Referência sintética: `G` (permanente), `Q` (variável), `WPOS` e `WNEG` (vento alternativo). Quatro combinações ELU/ELS distintas consideram separadamente as duas direções de vento. O teste detecta quando `WNEG` aparece apenas em ELS, quando ELS inteiro está ausente, quando os fatores foram alterados depois da revisão e quando duas direções mutuamente exclusivas aparecem juntas.

Os exemplos usam fatores arbitrários apenas para validar a **aritmética** e são expressamente não normativos.

## Integração e limites

`adaptLoadedMixedProject` disponibiliza `engineering_combination_coverage` junto à requisição `mixed3d/2`, sem transformar a auditoria em aprovação normativa.

O retorno sempre contém:

- `normativeFactorsVerified=false`
- `normativeCompliance=false`
- `computedStructuralApproval=false`
- `fabricationRelease=false`
- `releaseGate=NOT_READY_BLOCKED`

Ainda faltam: cadastro abrangente das ações possíveis, base de dados confiável e licenciada das edições normativas, coeficientes rastreáveis às cláusulas e hipóteses da obra, classificação de estado-limite por objetivo, simultaneidade, peso próprio e vento global, interação dos esforços e homologação por engenheiro responsável.

**Aceite técnico:** TypeScript, ESLint, Vitest com casos omissos e mutuamente exclusivos, Python Linux/Windows, DXF, E2E e build; relatório de alteração de contratos e revisão posterior do engenheiro antes de integrar à main.
