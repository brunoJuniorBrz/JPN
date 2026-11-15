# INT-3e — diagnóstico das recusas

Em U-N01, a tangente no equilíbrio com a carga aplicada tem autovalor
generalizado mínimo de 0,891 contra a rigidez descarregada. Na malha 16,
o lápis linearizado `K₀ + λ dK/dλ|₀` tem primeiro fator positivo 7,33553
para o padrão de U-N01. Os passos centrais 0,01 e 0,005 concordam em
4e−8. Esse é um fator de flambagem linearizado, dentro da análise
elástica de diagnóstico. Nenhum caminho pós-crítico foi certificado.

O esforço que recusou a malha uniforme foi Vy de TOP4, 1,596712 N em
malha 8 e 1,641283 N em malha 16. A diferença consumiu 1,04074 do
limite. Em malha uniforme 32, o maior consumo caiu a 0,51302 do limite,
com 512 nós. O teto é 384. A correção, portanto, refina apenas as barras
ainda pendentes quando o próximo nível uniforme excederia o teto.
Cada combinação ainda precisa satisfazer os mesmos limites. U-N01
isolada aceitou 320 nós, com TOP0, TOP1, TOP4 e TOP5 em 32
subdivisões e as outras barras em 16. O resíduo foi 2,59e−12.

O pórtico rotulado, iniciado na malha 4, parava na malha 16 em carga
leve. O resíduo era 2,31e−9 N equivalentes para o alvo de 1,79e−9 N.
Havia 129 incrementos que arredondavam para o mesmo deslocamento.
O maior quociente componente a componente do resíduo pelo erro
propagado de arredondamento foi 0,994. A correção verifica a
representabilidade na estagnação usando `|K|·ulp(u)/2` no espaço livre.
O limite de equilíbrio físico de 1e−8 permanece. A regressão volta a
aprovar a sequência 4 → 8 → 16.

Os JSONs `*-before.json` registram a versão anterior. O script
`diagnose.py` usa o mesmo modelo e só amplia o teto para medir a
referência uniforme, sem publicar resultado pelo worker.
