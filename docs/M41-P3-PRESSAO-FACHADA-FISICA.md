# M41-P3 — Transferência mecânica de pressão líquida em fachadas reais

**Estado:** PR #76 draft; exige CI e revisão independente. **Não constitui cálculo normativo de vento conforme ABNT NBR 6123.**

## Escopo físico

Este marco faz parte do motor espacial do JPN: usa as fachadas medidas em XYZ de M41-P1/P2, os membros estruturais reais do contrato `jpn.declared-structure/1` e produz `member_loads` para `jpn.mixed3d/2` do PyNite. Não cria pilares e não atribui resistência ou fixações fictícias.

Um engenheiro/levantamento externo informa a pressão líquida por fachada em Pa, com fonte, revisão e base de cálculo, além de incidência e caso. O contrato `jpn.declared-facade-traction/1` declara `normativeValidation=pending-engineer-review`.

**Convênio de sinal:** `netPressurePa > 0` pressiona a superfície **para dentro**, no sentido oposto à normal externa. `netPressurePa < 0` representa sucção **para fora** da fachada. A normal é sempre um vetor XYZ unitário obtido da orientação física cadastrada em M41-P1.

## Domínio deliberadamente pequeno

- Fachada vertical retangular (quatro vértices + fechamento), revestida integralmente, sem portões, janelas abertas ou outros recortes
- Dois ou mais **pilares reais** paralelos e verticais no plano da fachada, nas duas bordas, cobrindo a altura total de revestimento
- Distribuição da pressão horizontal por faixas simplesmente apoiadas, por pilar; pressão por caso uniforme na **fachada inteira**
- Todos os panos declarados possuem valor explícito, inclusive pressão zero. Não omitir fachada de um caso por silêncio
- Direções ±X e ±Y aceitas, com cenário e revisão independentes
- Casos classificados como categoria `wind` no cadastro `engineeringCombinations`, em grupo mutuamente exclusivo; dados e coeficientes normativos ficam pendentes
- Caso de fachada não pode coexistir com carga nodal/manual ou outra área no mesmo ID; revisão sobre sobreposição de ações permanece obrigatória nos casos combinados

## Equações verificadas

Para faixa vertical de altura `H`, largura total `W` e pressão externa líquida fornecida `p`:

`A = H * W` (área vertical em m²).

`traction_global = -p * n_outward` (N/m²).

Para cada pilar em posição transversal `u_i`, largura tributária entre os pontos médios das colunas vizinhas e as bordas físicas `b_i`:

`q_i = traction_global * b_i` (N/m) e `F_i = q_i * H` (N).

`M_i = r_mid,i × F_i` (N·m), onde `r_mid,i` é o ponto médio **físico** do pilar, no sistema global XYZ.

Oráculos obrigatórios: `sum(b_i*H)=A`, `sum(F_i)=p*A*(-n)`, `sum(M_i)=r_centroid × F`. Os três eixos de força e momento são verificados e discrepâncias bloqueiam a execução.

**Referência sintética não normativa:** fachada de 6×4 m, p = 500 Pa para dentro da normal +X, três pilares nos eixos transversais 0, 3 e 6 m: área 24 m², resultante `(-12.000, 0, 0)` N; linhas dos pilares em X `-750, -1500, -750` N/m; momento global `(0, -24.000, +36.000)` N·m. O teste completo envia as três linhas ao Python real e compara as reações.

## Bloqueios

Não suportados: frontões, fachada irregular, zonas externas diferentes por altura/posição, fachadas sem revestimento integral, aberturas, pilares curtos/segmentados, vigas horizontais de fechamento, diafragmas, coeficientes Cpe/Cpi, efeitos dinâmicos, instalações existentes sem avaliação. Não se calcula velocidade/carregamento normativo ou coeficiente do vento; as pressões são recebidas já declaradas.

Saída invariável: `windNormativeReady=false`, `fabricationRelease=false`, `releaseGate=NOT_READY_BLOCKED`. O retorno do PyNite não prova resistência de ligações, telhas, pilares, ancoragens, concreto, alvenaria ou fundação.
