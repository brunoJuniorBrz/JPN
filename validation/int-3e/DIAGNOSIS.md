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

Na CI Linux do SHA `8ec4387`, o caso leve voltou a estagnar. A cota
de arredondamento anterior, observada no Windows, não era suficiente
para estabilizar o passo entre plataformas. A busca agora retém a
parte perdida da soma dos incrementos e reavalia o comprimento da
corda por diferenças de translação compensadas. A convergência exige
o resíduo original de Newton, com limite relativo de 1e−11, e a
auditoria física de 1e−8 continua independente.

No teste denso × banda, a CI Linux registrou resultantes de
−6,98e−10 e −4,66e−10 após o cancelamento de forças de grande
magnitude. A comparação usa 1e−10 relativo à escala de forças
transmitidas pelos apoios e, para momentos, a essa escala vezes o
vão. O teste mantém a conferência direta das grandezas físicas e
confirma o limite de equilíbrio de cada execução.

Os JSONs `*-before.json` registram a versão anterior. O script
`diagnose.py` usa o mesmo modelo e só amplia o teto para medir a
referência uniforme, sem publicar resultado pelo worker.
