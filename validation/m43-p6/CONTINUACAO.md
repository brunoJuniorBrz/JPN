# Continuação do PR #89 — curvatura material e diagnóstico por componente

Mesma branch/PR, base física e critérios P5. Nenhum fonte de produção,
C1/C2/M51 ou visualizador foi editado. Não há nova missão nem endpoint.

## Correção e fundamentação

O piloto anterior corrigia o comprimento de arco, mas mantinha flexão em termos
quadráticos de rotações locais e twist como diferença de componentes dos
vetores de rotação. Esses termos não são a integral da curvatura material do
campo de diretores da curva Hermite adotada. A troca isolada dessa lei é o
experimento de ablação: mesma geometria, material, cargas, apoios e oráculos.

A variante opcional constrói `R(u)=Swing(e1→t(u)) Rx(phi(u))`, com a tangente
normalizada da curva Hermite e roll interpolado dos extremos. A energia de
flexão/torção integra `kappa=vee(Rᵀ R,u)/L0`. Com inclinações `a,b` e
`s=sqrt(1+a²+b²)`, o twist contém a conexão geométrica:

`kappa_x L0 = phi,u + (b a,u - a b,u)/(s(s+1))`.

As outras componentes vêm de `t,u` projetada nos diretores materiais, incluindo
o roll e a anisotropia. Oito pontos de Gauss são mantidos. Energia, forças e
tangente são diferenciadas do mesmo funcional, sem equilibrar esforços a
posteriori. O escalar `torsion_nm` é a média constitutiva do twist integrado;
o esforço físico concomitante continua sendo o wrench obtido de `dU/dq` e da
Jacobiana esquerda SO(3). O alongamento axial médio permanece uma aproximação
a investigar; a variante não é uma formulação de Kirchhoff integralmente validada.

Referência de requisitos de interpolação objetiva:
[Meier, Wall e Popp, 2016](https://arxiv.org/abs/1609.00119).
A expressão acima é derivada neste piloto e conferida por diferenciação
independente de matrizes `R(u)` construídas com SciPy; não é um transplante de
implementação OpenSees ou do artigo.

## Piloto estático e desempenho

`element.py` e `newton.py` substituem as antigas transformações textuais com
`inspect/exec/compile`. O adaptador importa a preparação histórica em namespace
privado e fornece callbacks explícitos. Os hashes históricos continuam sendo
conferidos; não foram atualizados. As fontes e evidências anteriores continuam
no Git para comparação. Nenhum seletor de produção aponta para a variante.

Mantém-se AD de primeira ordem na busca linear e Hessiana completa em Newton.
Quaternions locais já calculados são reutilizados em vez de repetir `Exp(Log(Q))`.
A tentativa de reutilizar a fatoração SPD foi investigada e não foi mantida,
após sensibilidade entre plataformas em componentes próximas de zero. Mantém-se
o algoritmo histórico de solução SPD e sua correção de residual.

## Validação e resultados intermediários

33 testes do piloto e 12 regressões mecânicas históricas passaram localmente.
Incluem diferenças finitas em `h=1e-4/1e-5/1e-6`, ordem de truncamento,
objetividade rígida finita, equilíbrio, torção/extensão analíticas, compressão e
perda de positividade. A diferença central grosseira em `h=1e-4` não satisfazia
o limite derivativo: o estudo identifica truncamento de ordem dois. Richardson
é usado somente no teste independente de derivadas, com o mesmo limite; nunca
para corrigir esforços ou resultados dos benchmarks.

Os artefatos do SHA 9b420d8, campanha
[43446376536](https://github.com/brunoJuniorBrz/JPN/actions/runs/43446376536),
foram baixados e conferidos em ambos os sistemas:

| Caso | Arco P6 anterior | Curvatura material opcional | Impedimento restante |
|---|---|---|---|
| SWAY | Refinamento dos esforços ~0,00936942 | ~0,0000159443; esforços/reações/energia/orientações passam | Deslocamento T1/X viola o orçamento independente |
| SPATIAL | Refinamento dos esforços ~0,00216243 | Windows: ~0,0000314528 | Comparações independentes falham; Linux excedeu 20 s |
| TORSION | Divergência angular ~4,659e-10 rad e recusas por equilíbrio | Ambos os SO: equilíbrio/refinamento e todas as comparações OpenSees/Kirchhoff passam | Gate global histórico retém a falha de equilíbrio da referência OpenSees arquivada |

Em SWAY, erro de T1/X ≈ 2,09777e-10 m, incerteza de referência ≈ 4,54961e-11 m
e limite ≈ 2,10778e-10 m: soma/limite ≈ 1,2111. Não remover a incerteza nem
arredondar para declarar aprovação. O estudo adicional 4/8 subdivisões conserva
a mesma estrutura e referências, respeita limites geométricos e de execução e
fica separado da campanha histórica 2/4. Não modifica resultados esperados.

Em TORSION, a melhoria obtida mudando somente a lei de curvatura demonstra a
contribuição omitida de flexão/twist material neste benchmark. Não prova domínio
espacial completo. A falha da referência nativa arquivada não é apagada, e o
campo `strictly_verified_diagnostic` permanece falso quando seu gate exige essa
referência. A comparação contínua Kirchhoff é preservada separadamente.

### Consistência entre parada de Newton e aceite físico

No SHA 0e46a6d, a campanha final Windows registrou `Fx=3,85234e-8 N`, acima do
critério físico de 1e-8, apesar de Newton satisfazer o residual algébrico
escalado. Esse é um impedimento efetivo diferente da comparação de orientações.
O piloto passa a reaplicar a função histórica de equilíbrio à iteração da carga
final ANTES de encerrar Newton. Se falhar, continua resolvendo as mesmas equações
até os mesmos limites de iterações/tempo; nunca modifica reações ou a decisão
posterior para aprovar o resultado. Etapas intermediárias mantêm seus critérios
históricos e não são declaradas estados físicos independentemente validados.

`newton_physical_attempts` registra a sequência dos resíduos e recusas, inclusive
se as iterações terminarem sem convergência. Um teste com residual algébrico
relativo pequeno e força residual em componente sem carga demonstra a diferença
entre os dois critérios. A execução local de TORSION com essa parada consistente
e o solver SPD histórico passou novamente nas comparações e equilíbrio.
Esses resultados não apagam recusas anteriores; a reprodutibilidade final nos
dois sistemas deve ser conferida nos artefatos do SHA em revisão.

Para recuperar margem de execução sem alterar a equação, a montagem completa
é reutilizada somente para estados `q` byte a byte idênticos dentro da mesma
análise (por exemplo, entre duas etapas, quando muda só a carga externa).
Também se evita remontar a Hessiana já calculada e auditada no estado final.
Não se reutiliza o gradiente aproximado da busca linear nem uma configuração
próxima/arredondada. Dois testes, com ambas as leis, comparam Newton com cache
ligado/desligado e exigem solução/forças byte a byte iguais, mesma energia e
mesmas iterações, além do equilíbrio final. Contadores acompanham as montagens
efetivas e reutilizações. Nenhuma auditoria de tangente foi removida.

### Refinamento SWAY comprovado nos dois sistemas

O estudo 4/8 passou em Linux e Windows no SHA 8add9a9, campanha
[43446809307](https://github.com/brunoJuniorBrz/JPN/actions/runs/43446809307):
`strictly_verified_diagnostic=true`, refinamento de esforços ≈ 9,89555e-7,
erro máximo de translação ≈ 2,88598e-11 m e orçamento independente completo
cumprido, incluindo a incerteza. Execução em 12,75/15,14 s, dentro de 20 s.
Isso demonstra a contribuição da lei material e o erro restante de
discretização da malha 2/4, sem mudar estrutura, coeficientes ou critérios.

### Certificado de inviabilidade da referência SPATIAL arquivada

O impedimento restante não é apenas custo do solver. Para `d=|c-r|`, incerteza
`u`, piso `a` e tolerância relativa `t<1`, o critério histórico exige
`d+u <= a+t max(|c|,|r|)`. Pela desigualdade triangular,
`max(|c|,|r|) <= |r|+d`; portanto é necessário
`(1-t)d+u <= a+t|r|`.

Se `u > a+t|r|`, nenhum candidato pode passar, nem mesmo `c=r`.
Em T2/X da referência SPATIAL arquivada: `u≈1,60622e-9 m`, enquanto
`a+t|r|≈2,15212e-10 m` (razão >7). A energia também tem incerteza acima do
próprio orçamento. `reference_feasibility.py` gera o certificado por componente,
com hashes LF das evidências e critérios originais; testes conferem o argumento
inclusive contra candidatos de magnitude artificialmente grande.

Esse certificado não altera ou desacredita o OpenSees: demonstra insuficiência
da precisão disponível na referência arquivada para o critério adotado. A causa
dos erros remanescentes do candidato e o custo continuam pendentes. Seria
necessária evidência independente adicional com incerteza suficientemente menor,
sem sobrescrever o oráculo, os hashes ou seus resultados históricos. Sob a
referência fixa atual, declarar SPATIAL resolvido seria matematicamente falso.

`governing_refinement_components` identifica barra/extremo/componente que governa.
`equilibrium_audits` preserva os resíduos absolutos e relativos da função
histórica, inclusive na recusa. O observador retorna a mesma decisão; não zera
componentes nem altera a normalização de equilíbrio.

## Reprodução

```sh
python -m pytest experiments/m43_p6 engine/tests/test_p4_mechanics.py -q
python validation/m43-p6/reproduce.py
python validation/m43-p6/reproduce.py --material-curvature
python validation/m43-p6/reproduce.py --material-curvature --case sway --refined-sway
python validation/m43-p6/reference_feasibility.py
```

O modo padrão e a variante geram artefatos separados, com controles e hashes de
entrada distintos. OpenSees/SO(3) e Kirchhoff são os oráculos arquivados da P5,
não novas execuções OpenSees. Limites continuam 20 s/768 MiB, 500 kB/2 MB,
150 nós/320 barras e os critérios históricos. TIMEOUT não comprova divergência
de Newton; uma execução não comprova aceitação física.

**A M43-P6 não está concluída enquanto os critérios de todos os casos não forem
demonstrados em ambos os SO.** Preservam-se `computed_structural_approval=false`,
`fabrication_release=false`, `NOT_READY_BLOCKED`. Sem merge ou deploy.
