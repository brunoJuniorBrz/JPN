# INT-3b — validação isolada do núcleo misto

O núcleo experimental usa o elemento corrotacional de pórtico M43 e a
projeção axial existente. Para a treliça, diferenciamos a energia axial
no comprimento corrente. A tangente tem a parcela material EA/L₀ e a
projeção transversal N/L corrente. A compressão tem sinal negativo.
O elemento não introduz rotação, rigidez flexional ou apoio.

A avaliação do pórtico é feita na base de referência de cada barra antes
de retornar forças e tangente aos eixos globais. Isso evita o cancelamento
das pequenas rotações na base dos pilares. O ensaio de Euler separado
usa 12 elementos de pórtico. O caso da mola verifica o Kg e a amplificação
da treliça, incluindo rotação rígida da montagem e recusa pós-crítica.

O pórtico espacial a 75% excedeu o limite em malha 8 por 2,67 vezes.
Mantivemos os critérios e refinamos o candidato e a referência para 16
elementos por barra de pórtico. A calibração do OpenSees usa o menor
autovalor da tangente na trajetória de encurtamento reto. Perto da raiz,
usa o resíduo nativo e verifica a pose reta para evitar tomar a correção
de deslocamento de um sistema quase singular como critério da referência.
Os limites das comparações não mudaram.

Na malha 16, a amplificação a 75% de Pcr foi 1,44525 versus 1,44409
(plano) e 3,26311 versus 3,24768 (espacial). O erro máximo de Kg das
diagonais foi 6,88e−8 relativo. A maior divergência de deslocamento
foi 1,57e−8 m no espacial, 0,660 do limite. Veja `core-evidence.json`.

    <python JPN> validation/int-3b/portal_oracle.py --mesh 16 --opensees-python <python OpenSees>
    <python JPN> -m pytest -q engine/tests/test_second_order_mixed_int3b.py
