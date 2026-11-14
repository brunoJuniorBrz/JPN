# INT-3a — P-Delta com diagonais axiais liberadas

Os critérios de aceite foram registrados em `benchmark.py` no commit
`19cbbf4`, antes da primeira execução. Comparamos dois pórticos elásticos com
diagonais comprimidas e 4/8 subdivisões por barra de pórtico. As diagonais
são elementos únicos. O OpenSeesPy 3.8.0 da CI usa transformação `PDelta`
nos elementos de pórtico e `corotTruss` nas diagonais. O controle linear
usa `Linear` e `Truss`. A amplificação é a razão entre os máximos da norma
do deslocamento horizontal nos nós carregados, na mesma combinação.
As duas referências passaram no controle de malha 4→8.

| Pórtico, malha 8 | Compressão das diagonais no OpenSees | Amplificação OpenSees | PyNite com seis liberações | PyNite com uma liberação de torção a menos |
|---|---:|---:|---|---|
| Plano | −28,509 kN | 1,000924602 | Completou na malha 8, falhou na 4 | Completou, amplificação 1,000973597 |
| Espacial | −31,097 / −23,676 kN | 1,006053979 | Matriz singular nas duas malhas | Completou, amplificação 1,006095401 |

O PyNiteFEA 3.2.1 condensa os graus liberados por inversão de subbloco.
Ao liberar as seis rotações, o subbloco elástico tem posto 5 de 6
(torção uniforme é um modo nulo). Mesmo quando a análise plana na malha 8
publica deslocamentos próximos da referência, a matriz continua deficiente
em posto. A avaliação direta de `Kg` com −10 kN falha em todas as diagonais
com essas liberações. Um resultado produzido nesse estado depende do
arredondamento e da força usada na avaliação.

Liberar torção em um extremo só remove a singularidade do subbloco, mas
a rigidez geométrica condensada ainda difere de N/L·(I − x xᵀ) para um
elemento axial de dois nós. O erro de operador relativo é 1,0 nos dois
pórticos. A projeção axial espúria é −2.000 N/m na diagonal de 5 m e
−2.357 N/m na segunda diagonal espacial, contra zero para a parcela
geométrica da treliça. Os deslocamentos ainda ficam a 1,20e−8 m e
4,98e−8 m do OpenSees na malha 8. Essa proximidade global decorre de a
contribuição geométrica axial indevida ser pequena frente a EA/L nestes
casos e não valida a representação de uma barra axial no contrato JPN.

**Decisão.** O benchmark reprova nos dois modelos. O contrato e o motor
misto permanecem como estavam. O caminho recomendado é prototipar
`corotTruss` + elementos de pórtico no OpenSees, com validação independente
da tangente, estabilidade, reações e amplificação de cada combinação.
Um futuro núcleo próprio M43 também precisa de uma formulação axial
consistente e benchmarks do modelo misto. Antes de expor o modo,
qualificar cargas distribuídas e liberações, confirmar recusa em
instabilidade ou não convergência, e publicar resultados somente após
a resolução de todas as combinações.

Reprodução com Python 3.12, `engine/requirements-validation.lock` no
ambiente JPN e `validation/m43-p2/requirements-opensees.lock` no ambiente
separado da referência.

    python validation/int-3a/benchmark.py --opensees-python <python do OpenSees>

Os valores por nó, as reações, os critérios e as recusas constam em
`benchmark.json`. Preservados `computedStructuralApproval=false`,
`fabricationRelease=false` e `NOT_READY_BLOCKED`.
