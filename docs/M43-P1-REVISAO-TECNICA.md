# M43-P1 — revisão executada em 10/11/2026

Pedido: [revisão técnica do PR #79](https://github.com/brunoJuniorBrz/JPN/pull/79#issuecomment-6775806384). HEAD inicialmente auditado: `c1d8622aed312f0c7500ef7bccb355d0570742c4`. Esta revisão não autoriza merge, projeto estrutural ou fabricação.

## Achados e correções

1. **P1 — benchmark não atende ao próprio gate de reação.** Na [asserção original, linha 78](https://github.com/brunoJuniorBrz/JPN/blob/c1d8622aed312f0c7500ef7bccb355d0570742c4/engine/tests/test_m43_pdelta_reference.py#L78), quatro elementos retornam −1999,995708989 N em 20% de Pcr e −1999,977713903 N em 40%, contra −2000 ± 0,002 N. Reprodução local: **2 falhas, 4 aprovações**. A [CI original](https://github.com/brunoJuniorBrz/JPN/actions/runs/42870131114) confirma os mesmos casos em **Linux e Windows**, com 1724 testes aprovados e duas falhas em cada job estrutural; 7/9 jobs aprovados no total. Correção: malha explícita de referência refinada para 64 elementos, escolhida por estudo 1/2/4/8/16/32/64. **Preservadas as tolerâncias originais de força, domínio de compressão e limite de flecha/vão.** A tolerância de flecha foi apertada de 1,5% para `1e-6` relativo. Acrescentadas as três forças e os três momentos da idealização de viga-coluna, além de H invertido. Não se modifica a malha física de nenhuma obra.
2. **P2 — cancelamento numérico no oráculo próximo de P=0.** A [subtração original, linha 37](https://github.com/brunoJuniorBrz/JPN/blob/c1d8622aed312f0c7500ef7bccb355d0570742c4/engine/tests/test_m43_pdelta_reference.py#L37) devolve **zero** em `P/Pcr=1e-20` e `1e-16`, quando o limite é 0,0106666666667 m. Correção: série analítica para argumento pequeno; regressões exigem o limite positivo. H não finito ou booleano também é recusado. Isso afeta apenas a referência de teste, não o solver de produção.

Não identifiquei P0 nem aprovação indevida de estabilidade nos caminhos exercitados. Esse parecer tem o escopo abaixo; não é aprovação da biblioteca PyNite em qualquer modelo.

## Fórmula, sinais e hipóteses

Eixo `z∈[0,L]`, deslocamento `v(z)` em +X, base engastada e topo livre. H atua em +X e P positivo em −Z, ambos com **direção global fixa**. Não são forças seguidoras da tangente deformada.

O equilíbrio da idealização de pequenas deformações específicas dá:

`EI v''(z) = H(L−z) + P[v(L)−v(z)]`.

Logo, `EI v''''+P v''=0`, com `v(0)=v'(0)=0`, `v''(L)=0` e `EI v'''(L)+P v'(L)=−H`. Sua solução é:

`v(L) = (H/P)[tan(kL)/k−L]`, `k²=P/(EI)`.

O limite P→0 é `HL³/(3EI)`; o primeiro polo é `kL=π/2`, dando `Pcr=π²EI/(4L²)`. Portanto **K=2 está correto somente para este engastado-livre idealizado**. Para `q=kL` pequeno, `(tan(q)−q)/q³=1/3+2q²/15+17q⁴/315+62q⁶/2835+O(q⁸)` evita o cancelamento. O termo omitido é inferior a `9e-19` quando `q²<1e-4`.

A reação de referência é `R=(−H,0,P)` e `M=(0,−HL−Pv(L),0)`. Trata-se de equilíbrio da viga-coluna linearizada: não inclui `H·uz`, deformações específicas finitas, cargas seguidoras ou todos os termos de uma geometria finitamente deformada. Confundir essas hipóteses daria outra comparação. A guarda analítica `P<0,8Pcr` **não significa** validação numérica até 80%: o conjunto executado vai somente até 40%.

## Resultados medidos

E=200 GPa, I=2×10⁻⁵ m⁴, A=0,02 m², L=4 m e H=2000 N, todos sintéticos. Limite original do erro absoluto de Rx: **0,002 N**.

| P/Pcr | Flecha exata (mm) | Flecha com 64 elementos (mm) | Erro Rx, 4 elementos (N) | Erro Rx, 64 elementos (N) |
|---|---:|---:|---:|---:|
| 0 | 10,6666666667 | 10,6666666651 | 0,000000000022 | 0,000000569 |
| 0,05 | 11,2207137894 | 11,2207137890 | 0,000230146 | 0,000015513 |
| 0,20 | 13,2978672812 | 13,2978672820 | **0,004291011** | 0,000285076 |
| 0,40 | 17,6812684363 | 17,6812684237 | **0,022286097** | 0,001466666 |

Em 40% de Pcr, o erro de Rx cai de 0,070346 N (1 elemento) para 0,041746 (2), 0,022286 (4), 0,011464 (8), 0,005808 (16), 0,002922 (32) e 0,001467 (64). A flecha/vão máxima é aproximadamente **0,00442032**, abaixo da guarda **0,01**, mantida como limite do ensaio, sem origem normativa presumida.

Há uma particularidade do PyNite 3.2.1 a investigar antes da M43-P2: `_PDelta` monta Kg com a força da deformação axial da etapa linear; `Member3D.f` recupera os esforços usando a deformação axial posterior. No modelo original de quatro elementos e 40%, medi **−246740,110027 N** na montagem e **−246755,331137 N** na recuperação. A matriz `kg` contém termos axiais. O código faz duas etapas; `max_iter` controla convergência de elementos unilaterais, não uma tolerância geral de equilíbrio P-Delta. O refinamento verifica este ensaio, mas **não corrige nem homologa universalmente essa recuperação**. Os arquivos instalados Analysis.py, FEModel3D.py e Member3D.py conferem com os hashes RECORD da distribuição 3.2.1.

O controle de sensibilidade substitui `analyze_PDelta` por `analyze_linear` **somente em processo diagnóstico isolado**, restaura a função e exige que os três casos comprimidos falhem: **3 rejeições observadas**. Não há skip/xfail, tolerância relaxada ou substituição no motor real. O código de produção continua chamando exclusivamente `analyze_linear`; o teste real verifica isso também na malha explícita de 64 elementos.

## Contratos e regressões reais

- `extractMemberDemands` confere esquema, hash da requisição, projeto/revisão, IDs, mapeamento e trace de cargas **antes** da nova auditoria em `buildResistanceReport`. `auditSecondOrderReadiness` é uma observação de um par já conferido; não é um autenticador independente do resultado.
- Classificações frame-only, axial-only e mista continuam sem segunda ordem aprovada. `Spring3D` axial tem EA/L; `FEModel3D.Kg` não monta contribuição dessas molas. A pendência `M43_AXIAL_SPRING_KG_UNSUPPORTED` permanece explícita.
- Exercitados relatórios com cobertura real declarada → terças → UDL → Python e com fachada declarada → pilares → UDL → Python, incluindo equilíbrio e vinculação dos casos corretos.
- Exercitado relatório misto com pressão de cobertura: aprovações forjadas em `secondOrderAudit` são recusadas **mesmo após recalcular o hash do relatório**; hash de entrada errado também é recusado.
- Permanecem `pDeltaExecuted=false`, `pSmallDeltaExecuted=false`, `normativeStabilityVerified=false`, `computedStructuralApproval=false`, `fabricationRelease=false`, `NOT_READY_BLOCKED`. Nenhum gamma, psi, parâmetro ABNT, kernel produtivo, limite de execução ou algoritmo não linear foi alterado.

## Reprodução e estado da entrega

Python 3.12 / PyNiteFEA 3.2.1, dependências fixadas do projeto; configurar `JPN_PYTHON_EXECUTABLE` para o Python existente nos testes Node. Usar uma thread BLAS, como na CI.

```text
python -m pytest engine/tests/test_m43_pdelta_reference.py -q
python validation/m43-p1-review/collect.py
npx pnpm@12.15.0 exec vitest run src/domain/second-order-readiness.test.ts src/domain/member-demands.test.ts src/domain/declared-roof-load-path-real.test.ts src/domain/declared-facade-mixed-real.test.ts
npx pnpm@12.15.0 typecheck
npx pnpm@12.15.0 lint
```

No Windows PowerShell, usar `npx.cmd`. Resultado local: **14 testes Python, 19 testes TypeScript com solver real, typecheck aprovado, lint sem erros** (três avisos preexistentes em testes de geometria não alterados). [Dados numéricos, ambiente, hash da fonte e controle negativo](../validation/m43-p1-review/numerical-evidence.json), reproduzidos por `collect.py`. Resultado final da CI do novo SHA registrado no PR #79; não se presume aprovação a partir da CI anterior, que falhou.

Referência conceitual primária adicional: [procedimento P-Delta do PyNite](https://pynite.readthedocs.io/en/latest/PDelta.html), cuja página identifica documentação 3.2.0. As medições e a inspeção de implementação desta revisão usam **o código instalado 3.2.1**, não outra versão inferida dessa página.

**Decisão:** correções restritas ao benchmark e às regressões; manter o PR draft, sem merge/deploy. Segunda ordem produtiva, Kg axial, imperfeições, reduções de rigidez, flambagem, outras vinculações e modelos físicos da obra continuam pendentes de validação própria e revisão humana especializada.
