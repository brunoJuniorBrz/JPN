# Referência adicional P6, versão 2

Pesquisa isolada. Não substitui a P5 nem altera seus hashes, critérios ou resultados.
As saídas completas e entradas de cada execução ficam nos artefatos da CI,
em `reference-v2/`; o manifesto registra hashes dos arquivos brutos e fontes.

## Modelos independentes

`network.py` resolve a rede física inteira por colocação adaptativa SciPy
(problema de contorno, sem elementos Hermite, energia discreta ou AD do JPN).
Em comprimento material S, com D = diag(GJ, EIy, EIz):

```
t = R e1; n = F.t
r' = (1 + n/EA)t; F' = 0; M' = -r' x F
kappa = inverse(D) R^T M; R' = R hat(kappa)
U' = (n^2/EA + kappa.D.kappa)/2
```

Compatibilidade de posição/orientação e equilíbrio dos nós conectam os membros.
A orientação total usa Exp(theta), com theta' = J_left(theta)^-1 R kappa.
Escalas dimensionais são explicitadas no código; reações existem somente em
componentes restritas. Resíduos dos nós livres são registrados separadamente.
O domínio é prismático, sem empenamento, cisalhamento, releases ou carga distribuída:
uma combinação de forças/momentos nodais mortos, nós livres ou totalmente fixos.
Não representa capacidade, resistência, ligações ou segurança normativa.

`native.py` reconstrói separadamente o modelo OpenSees 3.8.0, dependências com
hashes já fixadas na P2. Audita os três eixos nativos de cada elemento e compõe
matrizes de orientação a partir de **todos** os incrementos de Newton. Não usa
diretamente rotações aditivas como orientação. A disponibilidade de
Corotational02 é testada no binário; indisponibilidade não é interpretada como uso.
A documentação oficial descreve sua substituição do Corotational original:
https://opensees.github.io/OpenSeesDocumentation/user/manual/model/geomTransf/Corotational02.html

As bases históricas dos benchmarks são declaradas explicitamente. Não se presume
equivalência com C1. Integração futura precisa receber a base física Z-up da C1,
preservar giro real e Iy/Iz e conferir momentos físicos = J_left^-T momentos
conjugados. Nenhum arquivo de produção ou do visualizador é modificado aqui.

## Qualificação e limites

Executar, com o Python científico do projeto e um venv OpenSees separado:

```
python validation/m43-p6/reference_v2/campaign.py --opensees-python CAMINHO_DO_PYTHON_OPENSEES
```

Cada processo tem 20 s, 768 MiB, entrada de 500 kB e saída de 2 MB. Os modelos
candidatos mantêm 150 nós/320 barras e todos os limites físicos/Newton anteriores.
O OpenSees adicional pode usar até 600 nós **de referência**, sem enviá-los ao JPN.

Contínuo: tolerâncias 1e-8/9/10/11 e repetição fina com malha inicial 17 em vez de 9.
OpenSees: 4/8/16/32/64 subdivisões, repetição 64 com outra tolerância algébrica.
Conservam-se falhas de equilíbrio em todos os níveis. A qualificação exige
equilíbrio dos níveis finos efetivamente usados; uma aproximação grossa rejeitada
não é uma referência aprovada.

A incerteza por componente soma as duas últimas mudanças do contínuo, deriva
de reinício, piso de arredondamento, divergência entre formulações, sensibilidade
algébrica nativa e resto Richardson condicional. Extrapola-se apenas a referência
com tendência de ordem dois observada. Componentes sem essa tendência usam o
valor nativo bruto mais fino e **a soma das duas últimas mudanças**, sem redução
de incerteza por extrapolação. Todas as parcelas são publicadas. São estimativas
numéricas condicionais, não intervalos certificados; tolerância residual não é
tratada como erro físico. Qualificação exige incerteza menor que o orçamento P5
de cada componente. Os critérios P5 permanecem inalterados.

Somente depois dessa qualificação são comparadas as malhas candidatas brutas
2/3/4/6/8, sem extrapolação. Timeouts e recusas permanecem na sequência.
O relatório automático não atribui homologação por concluir a campanha.

## Limitação axial investigada

O candidato calcula corretamente o comprimento geométrico Hermite com o
comprimento da corda **atual**; não há fator L0 indevido nessa integral.
Entretanto, usa deformação axial média constante e parametriza curvatura por
L0. A referência contínua conserva n(S)=F.t(S), geralmente variável quando há
flexão e força transversal. Para um campo prescrito, a energia omitida pela
redução à média é EA L0 Var(epsilon)/2. O diagnóstico contínuo publica essa
variância por membro, sem adicioná-la à energia candidata: os campos dos dois
modelos diferem, logo isso não seria uma correção consistente. Também falta
demonstrar compatibilidade ponto a ponto entre velocidade da linha Hermite e
parametrização material. Refinamento observado é evidência local, não elimina
essa limitação geral nem prova ausência de locking em estruturas arbitrárias.

`computed_structural_approval=false`, `fabrication_release=false`,
`release_gate=NOT_READY_BLOCKED`. Sem integração à aplicação, merge ou deploy.
