# INT-3d — liberações rotacionais em segunda ordem

As coordenadas independentes de rótula são resolvidas no mesmo Newton
do pórtico. A orientação da seção compõe a rotação do nó com a rotação
relativa nas direções locais declaradas. Forças, cargas distribuídas e
tangente são diferenciadas pela mesma transformação. Nenhuma rigidez
de vínculo é adicionada. Só as extremidades físicas recebem as liberações
quando o elemento é subdividido. As rotações redundantes do nó são
retiradas do espaço de deslocamentos virtuais, sem reação fictícia.

O oráculo OpenSees 3.8.0 usa `elasticBeamColumn` corrotacional em malha 32
e [`equalDOF`](https://openseespydoc.readthedocs.io/en/latest/src/equalDOF.html)
para os graus retidos nos nós de extremidade duplicados. Os dois casos
aceitam malha 8 partindo do padrão 1. O pórtico com terça deu amplificação
3,53352 versus 3,53172 e momento 371,134 versus 371,006 N·m. A viga
biarticulada a 75% de Pcr deu 3,95168 versus 3,94931 e 274,983 versus
274,866 N·m. Os limites de 1% foram commitados antes do ensaio
(`a29df93`). O teste de diferenças finitas também inclui carga distribuída.

Com a malha inicial forçada a 4, o caso de carga leve do pórtico recusou
Newton na malha 16. O menor resíduo atingido, 2,28e−9 N equivalentes,
ficou acima do limite de 1,79e−9 N do caso. Essa recusa permanece.
Liberações translacionais, torção liberada nas duas extremidades da
mesma barra e molas nodais seguem explicitamente fora do contrato.
