# INT-3b — segunda ordem por combinação no contrato /3

O worker Python aceita `analysis_order: "second-order"` com
`solution_mode: "per-combination"` e `local_axes: "jpn-z-up/1"`.
Cada combinação parte do modelo descarregado. O resultado informa iterações,
equilíbrio no estado deformado, esforços de extremidade e reações. O fator
de amplificação é a razão entre os maiores módulos de translação de segunda
e primeira ordem. São usadas rotações quando a resposta linear tem
translação nula. Nos pórticos, o ensaio incremental usa três combinações
independentes para descontar a resposta de pré-carga.

`shed-int1c.json` é o modelo exportado pelo ensaio do PR #113
em `src/domain/analysis-limits.test.ts`. O teste acrescenta a opção de segunda
ordem e preserva as 64 cargas distribuídas e 42 combinações. O worker
convergiu em até 3 iterações por combinação, com resíduo relativo máximo de
2,25e−13 e fatores rotacionais entre 0,99037 e 0,99922. A execução de
referência levou 18,28 s no Windows, com limite de 20 s.

Uma combinação recusada encerra a solicitação sem publicar resultados
parciais. O código `SECOND_ORDER_BEYOND_CRITICAL` indica perda de positividade
da tangente reduzida. O domínio permanece elástico e de pequenos
deslocamentos relativos. Liberações de pórtico, binários nodais gerais,
esforços ao longo das barras e a emissão pela UI ficam pendentes.
