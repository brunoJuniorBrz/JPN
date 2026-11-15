# INT-3c — segunda ordem para extração de demandas

O contrato experimental `jpn.mixed3d/3` verifica a malha a cada duplicação.
Pórticos usam uma malha comum às combinações, com o número final de
subdivisões registrado por barra. Treliças preservam a barra axial de dois
nós. São exigidos dois refinamentos, com limite de 32 subdivisões ou 384
nós. O critério verifica 1% na amplificação e 2% nos picos por componente
da barra, com piso absoluto de 0,01 N ou N·m. Os picos incluem extremos
internos do polinômio de esforços. Na falta de convergência, a solicitação
é recusada integralmente.

O pórtico espacial do INT-3b iniciou em 4 e aceitou 16 subdivisões.
A 75% de Pcr, a amplificação incremental foi 3,26311 contra 3,24768
no OpenSees. A resposta reproduziu a malha 16 isolada sem relaxar os limites.

As cinco estações mantêm as posições no comprimento inicial da barra.
N, Vy, Vz, T, My e Mz vêm do equilíbrio do corte na linha deformada.
A base local direita, do segmento da estação, acompanha o vetor de
esforços. O extrator de demandas lê essas amostras e preserva os bloqueios
de liberação. No balanço com 75% de Pcr, M2 foi 1.375,318 N·m contra
1.376,540 N·m da referência M1·tan(λ)/λ, com M1 = 400 N·m e λ = L√(P/EI).
O resíduo relativo da barra foi 2,88e−12. A amplificação de momento e a
amplificação da resposta nodal são grandezas distintas.

O HTTP retorna 422 com o código e o ID quando o solver recusa uma
combinação. Molas nodais e liberações de pórtico têm recusas explícitas.
Binários nodais gerais permanecem fora do domínio da formulação.

O galpão de 42 combinações excedeu o orçamento HTTP preservado de 20 s com
o refinamento ativo. O ensaio anterior continua executado e marca somente
esse timeout como uma falha esperada. Em diagnóstico isolado, a primeira
combinação ainda excedeu o limite de esforços em 16 subdivisões por um
fator 1,04 e a próxima malha excederia 384 nós. A UI e a emissão pelo
fluxo de projeto permanecem pendentes.
