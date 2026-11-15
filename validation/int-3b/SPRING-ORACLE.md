# INT-3b — oráculo com mola lateral

O caso de Euler do primeiro ensaio foi preservado em `euler_history` no
JSON. Está fora do domínio axial e não é critério de aceite. O novo caso
usa a tangente k−P/L, com k = 100.000 N/m, L = 4 m e Pcr = 400 kN.
As tolerâncias foram commitadas antes das comparações (mola: `4e59559`).
OpenSees 3.8.0 passou a 40% e 75%, com amplificações de 1,6667556 e
4,0018011. Os erros relativos do Kg foram 8,00e−5 e 1,50e−4. O pequeno
encurtamento axial explica a diferença para a expressão com L inicial.

O segundo ensaio reutiliza nós, barras, propriedades e vínculos dos dois
pórticos INT-3a. A compressão é aplicada a 40% e 75% da primeira
perda de positividade do tangente do OpenSees ao longo do encurtamento
vertical uniforme do topo. Há uma perturbação horizontal de 50 N
com o padrão original de direções. A instabilidade é localizada na
tangente da trajetória reta, independentemente da amplificação sob a
perturbação. A calibração exigiu ampliar apenas o intervalo de busca
para incluir a raiz plana acima de 32 MN. Critérios de aceite inalterados.
Os Pcr por coluna foram 44,5604 MN (plano) e 13,2172 MN (espacial).
A amplificação incremental a 75% foi 1,45488 e 3,24931, respectivamente.

    <python OpenSees> -I validation/int-3b/spring_oracle.py
    <python JPN> validation/int-3b/portal_oracle.py --opensees-python <python OpenSees>

O primeiro ensaio pode sobrescrever o relatório consolidado. Rode os dois
comandos na ordem indicada para reconstruí-lo. O estudo usa o lock OpenSees
da CI e mantém `computedStructuralApproval=false`, `fabricationRelease=false`
e `NOT_READY_BLOCKED`.
