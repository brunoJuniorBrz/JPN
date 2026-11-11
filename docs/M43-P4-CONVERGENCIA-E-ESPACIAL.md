# M43-P4 — convergência plana e núcleo espacial experimental

**Entrega parcial funcional, com domínios separados.** Os quatro portais planos da P3 passaram no refinamento sem ampliar tolerâncias ou recursos. Foi implementado um núcleo espacial objetivo com quaternions, gradiente/Hessiana, Newton e auditorias. Seus quatro ensaios espaciais gerais **ainda reprovam componentes das referências**: o domínio espacial não está validado. Permanecem `production_enabled=false`, `spatial_domain_verified=false`, `normative_stability_verified=false`, `computed_structural_approval=false`, `fabrication_release=false`, `release_gate=NOT_READY_BLOCKED`.

## Base preservada

HEADs auditados: #75 `2b009d2`, #80 `696ae3f`, #81 `00ce874beac86a53fb50f9c654f7225c87fa2037`. As CIs push/PR da P3 estavam aprovadas em 11/11 jobs. A branch `feat/m43-p4-spatial-corotational-stability` deriva de #81. `main`, branches anteriores, motor linear e módulos Python P2/P3 não foram alterados. O commit `57dd6c2` registrou o estudo P3 e critérios **antes** das correções. O PR P4 é draft incremental sobre #81, sem merge ou deploy.

## 1. Causa e correção plana

A campanha original usou 6/12/24/48 subdivisões por peça, dentro de 150 nós/320 elementos. Em todos os quatro casos, o pior erro veio de **Fx nas extremidades físicas da viga**, de aproximadamente 0,34–0,46 N. As ordens observadas foram 1,994/1,999/1,999/1,997. Não era troca de eixos ou unidades, nem divergência entre nós originais. A P3 recupera corretamente seu próprio gradiente, mas usa alongamento de chorda e flexão básica sem o alongamento interno associado à curvatura; essa aproximação converge com ordem 2. Mesmo sem compressão gravitacional, H produz efeitos geométricos e força axial pequena.

No referencial da chorda, adotam-se funções Hermite de viga Euler–Bernoulli, com v(0)=v(L)=0 e inclinações locais pequenas βi, βj. Para t=x/L:

```text
v = L[(t−2t²+t³)βi + (−t²+t³)βj]
a = 1/2 ∫(dv/dx)² dx = L/30 (2βi² − βiβj + 2βj²)
e = l−L+a
U = EA/(2L) e² + 2EI/L (βi²+βiβj+βj²)
f = ∂U/∂q; Kt = ∂²U/∂q²
```

O novo termo pertence à **energia**. Ele altera simultaneamente deformação axial, forças conjugadas e tangente; não corrige esforços depois de resolvidos. Se b0=[l−L,βi,βj], A=∂[e,βi,βj]/∂b0 e C é a constitutiva básica, a derivada em b0 é `AᵀCb`, e a tangente inclui `AᵀCA + N Hess(a)` antes da transformação geométrica. As duas extremidades e reações vêm desse mesmo estado. O sinal N positivo corresponde a extensão/tração. Momentos de extremidade incluem a contribuição `N∂a/∂β`, não apenas a parcela constitutiva de flexão.

A hipótese retém o termo quadrático de inclinação **local**, com rotações finitas da chorda; não é uma solução exata de P‑δ com qualquer curvatura. Não há modos internos ocultos, nós adicionais ou cargas concentradas fictícias. A P3 continua disponível integralmente em /2; a correção é explícita em /3, formulação `xz-hermite-arc/1`.

| Compressão de referência | P3, erro de extremidades 24/48, 145 nós finos | P4, erro 6/12, 37 nós finos |
|---|---:|---:|
| 0% | 2,2943e-4 | 1,2406e-9 |
| 10% | 2,4977e-4 | 5,6261e-7 |
| 20% | 2,7386e-4 | 1,2637e-6 |
| 40% | 3,3722e-4 | 3,2094e-6 |

**Critério mantido: 1e-4** em translações, rotações e 12 ações nas extremidades físicas. Todas as quatro P4 atendem com 19/37 nós. O estudo P4 até 24/48 também é publicado; as últimas diferenças atingem o piso de arredondamento. A ordem elevada observada na região resolvida não foi generalizada aos níveis dominados por cancelamento, especialmente P=0.

O condicionamento escalado é registrado em cada malha e incremento. Modelos fisicamente semelhantes, com comprimentos multiplicados por 0,1/1/10, A por s², I/J por s⁴ e forças por s², preservaram deslocamentos/s e rotações. As unidades continuaram **SI**: não houve reinterpretação de unidades para passar testes. O denominador por componente `max(1,|f|)` permanece o da P3; componentes próximas de zero não foram removidas.

### Referência independente da correção

OpenSees Corotational básico não contém a mesma correção interna de arco em uma única peça. Comparar apenas a mesma malha grosseira misturaria operadores distintos. A referência de continuidade é uma **estimativa Richardson p=2**, derivada de **três execuções reais** OpenSees, 24/48/96 subdivisões. `R=(4r96−r48)/3`; a incerteza estimada é `|(4r96−r48)/3 − (4r48−r24)/3|/15`. Essa estimativa é identificada como tal; não é apresentada como saída bruta de um solver único nem como limite rigoroso universal.

São comparados todos os graus dos nós físicos, reações e 12 ações de cada peça física, incluindo energia. Exige-se `|P4−R|+incerteza ≤ atol+rtol·max(|P4|,|R|)`. Mantiveram-se rtol **1e-7**, atóis **1e-10 m/rad**, **1e-5 N/N·m**, e energia 1e-7 relativa/1e-8 J. Os quatro ensaios passaram. A malha mais fina da **referência privada** tem 289 nós; não é um pedido aceito pelo JPN nem aumento do orçamento da aplicação. O gerador independente está fora do engine/deploy. Refinamentos excessivos da referência mostraram maior cancelamento em reações livres; a extrapolação e sua incerteza evitam apresentar esses números como forças exatas.

Os hashes de cada invocação, iterações reais, resíduos do OpenSees e incertezas estão na [evidência](../validation/m43-p4/evidence.json). `nodeReaction` em grau livre é guardado como **desequilíbrio algébrico**, não como apoio físico; as resultantes independentes somam somente apoios declarados. Nenhum resíduo bruto foi apagado para melhorar a comparação.

## 2. Formulação espacial adotada

`spatial-quaternion-arc/1` possui **seis graus acoplados por nó**: três translações e um vetor de rotação exponencial r. A orientação é `Ri=Exp([ri]×)`. Quaternions unitários escalar-primeiro compõem as rotações; não são somados vetores de rotação. A média dos quaternions dos dois nós define diretores médios, e uma rotação mínima alinha seu primeiro diretor à chorda deformada n. R0 é a base física inicial já auditada no JPN. Com Q o referencial atual:

```text
βi = Log(Qᵀ Ri R0); βj = Log(Qᵀ Rj R0)
a = L/30 Σk=y,z (2βik² − βikβjk + 2βjk²)
e = l−L+a; τ = βjx−βix
U = EA/(2L)e² + GJ/(2L)τ²
  + Σk=y,z 2EIk/L (βik²+βikβjk+βjk²)
```

Esta é a **energia discreta adotada**, com flexão biaxial, extensão, torção de Saint‑Venant e seus acoplamentos cinemáticos. Sua correspondência geral com a teoria espacial e os operadores OpenSees permanece em investigação. Ela não é duas soluções 2D: os diretores, logaritmos, torção e gradientes dependem da orientação 3D conjunta. O limite XZ foi conferido contra a mesma energia plana, e a tangente linear inicial contra o frame existente em orientações vertical, inclinada e −Y, com Iy/Iz distintos.

`second_jet.py` diferencia a energia por propagação **exata de derivadas de primeira/segunda ordem em ponto flutuante**, por elemento de 12 graus; não usa diferenças finitas para resolver a estrutura. Os testes conferem gradiente, Hessiana e trabalho virtual por diferenças centrais independentes, além de simetria. Não foi instalada biblioteca de AD ou alterado o PyNite. Movimento rígido 3D, composição não comutativa e invariância de energia/esforços foram conferidos com outra implementação de rotações, SciPy Rotation.

### Trabalho conjugado e singularidades

A derivada `g_r=∂U/∂r` é conjugada à **coordenada exponencial**, não diretamente ao vetor de momento espacial. Com `δφ=Jl(r)δr`, calcula-se **`Mespacial=Jl(r)⁻ᵀg_r`**. A auditoria de equilíbrio usa esses momentos físicos e posições deformadas. O teste de trabalho aplica incremento espacial pela esquerda `Exp(εδφ)Ri`, sem adicionar coordenadas r. Quaternions e bases atualizadas fazem parte do resultado; o verificador TypeScript reconstrói energia/gradiente por diferenciação de **primeira** ordem e usa a fórmula analítica independente do inverso de Jl.

Séries regulares tratam o limite de ângulo zero. Vetores próximos de π, média de diretores ambígua e alinhamento antiparalelo são recusados; nenhum eixo artificial é escolhido para continuar. Os limites operacionais são mais estreitos: rotação nodal em norma ≤0,05 rad, rotações básicas ≤0,05 rad, deformação axial ≤1% e translação/vão ≤1%. Não se declara validade para grandes deformações materiais ou qualquer rotação global.

Momentos espaciais mortos gerais são recusados: `−M·r` não é em geral o potencial de um momento espacial constante em SO(3). O carregamento espacial inicial usa forças nodais globais mortas. O caso de torção possui **braço físico excêntrico** e força declarada, sem momento nodal inventado. O ensaio constitutivo de torção pura é um subgrupo comutativo e **não habilita** momentos espaciais gerais na API. Apoios rotacionais parcialmente fixos também requerem definição cinemática própria e permanecem recusados.

## 3. Newton, equilíbrio e estabilidade

São dez incrementos, até 30 avaliações Newton por incremento, escalas dimensionais e refinamento iterativo dos sistemas lineares. A busca exige redução do **residual**, como na P3. A comparação de potenciais quase estacionários mostrou cancelamento em diretores; ela não foi usada para declarar convergência. Critérios simultâneos permanecem residual ≤1e-8, incremento escalado ≤1e-10 e mudança de força interna ≤1e-8. Contagens de avaliações, buscas e soluções lineares são reais. Nenhum timeout foi aumentado.

O equilíbrio soma FX/FY/FZ e MX/MY/MZ em `(x+u)×F+M`, com apoios/cargas originais e sem suprimir termos. Reações nos graus livres não são fabricadas; resíduos livres são conferidos separadamente. A força interna é sempre o gradiente, não `Kt·q` ou ajuste posterior.

**Equilíbrio**, **estabilidade do modelo adotado** e **verificação normativa** são campos distintos. A Hessiana reduzida é auditada quanto a positividade, espectro generalizado Kt/Ke e condicionamento ≤1e10; são registrados modo e margem. A restrição piloto 0,6 foi preservada. Em rotações finitas essa razão também é sensível à reorientação material: não é P/Pcr, K efetivo nem margem normativa. Pode recusar um estado ainda positivo; isso não autoriza afrouxá-la para publicar outro caso.

O estudo direto 3D de coluna uniforme engastada-livre, Iy=3Iz, usou 4/8/16 elementos e cargas de 50%/95%/101% do **Pcr de Euler do eixo fraco declarado**. O modo dominante é Y, fora do plano XZ; a 16 elementos, os menores autovalores generalizados são aproximadamente **0,500108 / 0,050152 / −0,009845**. Os resíduos de autovetor ficaram abaixo de 1e-8. A API recusa os casos críticos antes dessa região pela margem. O OpenSees também foi efetivamente executado a 95% e 101%; um vetor finito não foi tratado como prova de estabilidade.

**Não representado/validado:** empenamento, efeitos Wagner e flambagem torsional/flexo-torsional completa de perfis delgados. O resultado inclui `P4_WARPING_WAGNER_STABILITY_PENDING`. J/GJ não fornece automaticamente Cw ou rigidez de fundação/contraventamento. Não se inferiram esses dados.

## 4. Comparações e limites reais

- **Quatro portais planos:** convergência e referências estimadas independentes atendidas; nenhuma alteração de tolerância, apoios, cargas ou orçamento.
- **Três verificações espaciais delimitadas:** esforço axial, limite linear biaxial e estado constitutivo axial+torção pura passaram contra OpenSees, nos critérios 1e-7/atóis originais. A última verifica um elemento prescrito e não é uma API de momentos gerais.
- **Quatro ensaios espaciais não lineares:** cantilever comprimido biaxial; portal com ações fora do plano; quadro de quatro pilares; braço físico com torção. Todos executados e comparados com OpenSees Corotational privado, refinamento 16. **Nenhum atende a todos os critérios.** Os deslocamentos atendem à comparação diagnóstica predefinida de 0,2%, mas há reprovações em rotações pequenas, esforços e/ou energia. Não se ampliaram atóis para componentes pequenas. Dois portais também falham no refinamento de esforços. Mesmo nos casos com equilíbrio/refinamento atendidos, `spatial_domain_verified=false` continua obrigatório.

As tríades/diretores e a correção de arco são operadores diferentes dos elementos básicos OpenSees. A comparação diagnóstica espacial de 0,2% foi definida antes do algoritmo; não substitui equilíbrio 1e-8, refinamento 1e-4 ou energia 1e-7/1e-8 J. `nodeDisp` rotacional do OpenSees não foi presumido igual à orientação exponencial total em trajetórias não comutativas. Medida de rotação, formulação de torção/flexão e discretização são hipóteses a investigar; **não são causas declaradas corrigidas**.

As falhas ficam na evidência com componentes, valores, erros, limites, energia e invocações. Uma baseline numérica separada exige que essas discrepâncias não piorem acima de 2%, com pisos dimensionais; ela não converte reprovação em homologação. A CI exige os quatro portais, os três limites espaciais verificados, estudos de estabilidade e escalas, além das regressões **P2 e P3** intactas. Uma falha de comparação anteriormente aprovada ou perda de refinamento aceito falha a CI, independentemente dos bloqueios de segurança.

## 5. Integração e verificação

`Project → preparação física existente → prepareP4FrameAnalysis → cliente → mesma rota experimental → mesmo worker limitado → auditoria TypeScript → relatório /3`. Contratos mixed3d/1, /2 e second-order-frame/1, /2 continuam funcionando. /3 exige dimensionalidade e formulação explícitas. Hashes, revisões e invalidação após alterações físicas são preservados. A auditoria TypeScript confere energia, forças conjugadas, quaternions, bases, montagem nodal, seis resultantes, apoios, refinamento e coerência do modo. O relatório resistente antigo recusa o novo diagnóstico.

Reutilizam-se origem/Host/cabeçalho, opção local, slot compartilhado, cancelamento, **20 s / 768 MiB / 500 kB / 2 MB** e rejeição de JSON duplicado. O servidor de produção não habilita o solver. A HTTP continua **422 PDELTA_NOT_VERIFIED** e o relatório **NOT_READY_BLOCKED**, mesmo quando um ensaio numérico converge. O deploy Git da branch está desabilitado nos dois projetos.

[Prova real HTTP/navegador](../validation/m43-p4/http-browser-proof.json): página `/projetos` 200, pedidos /3 plano e espacial → Next → Python → auditoria → 422, seis resultantes atendidas, produção/fabricação bloqueadas, origem externa 403, sem erros de página. São chamadas sintéticas explícitas; a cadeia do Project foi testada com o worker real. Não foi criado fluxo visual de dimensionamento.

Validação local: **1826 pytest + 1000/1000 referências**, **55 Vitest críticos**, typecheck, lint sem erros (três avisos preexistentes) e campanha independente executada. Resultados do build, CI Linux/Windows, Vitest completo e Playwright e o SHA realmente aprovado estão no PR draft, sem declaração antecipada de aprovação.

```text
python engine/validate.py
python validation/m43-p2/reproduce.py --opensees-python <python-privado> --output .tools/p2.json
python validation/m43-p3/reproduce.py --opensees-python <python-privado> --p2-evidence .tools/p2.json --output .tools/p3.json
python validation/m43-p4/reproduce.py --opensees-python <python-privado> --p3-evidence .tools/p3.json
npx.cmd pnpm@12.15.0 typecheck
npx.cmd pnpm@12.15.0 lint
npx.cmd pnpm@12.15.0 test
npx.cmd pnpm@12.15.0 build
```

Usar Python 3.12, dependências fixadas e uma thread BLAS como na CI. OpenSeesPy 3.8.0.0/núcleo 3.8.0 fica exclusivamente no ambiente privado de validação, com o hash-lock existente. Nenhum binário ou fonte do OpenSees foi portado/redistribuído. Referências primárias: [Corotational](https://openseespydoc.readthedocs.io/en/latest/src/corotational.html), [elemento elástico](https://openseespydoc.readthedocs.io/en/latest/src/elasticBeamColumn.html). A versão executada vem de `ops.version()`, não do título da documentação.

## Situação comparativa e M43-P5

| Categoria | M43-P3 | M43-P4 |
|---|---|---|
| Implementado e validado nos ensaios | 9 referências planas; quatro portais sem refinamento | Quatro portais convergidos; três limites espaciais delimitados conferidos |
| Implementado, experimental | Corrotacional XZ | Núcleo 3D SO(3), Newton, energia, Hessiana, modos e transporte /3 |
| Não implementado/validado | Corrotacional espacial | Momentos espaciais gerais, empenamento/Wagner, liberações, UDL/peso próprio consistentes |
| Reprovado por divergência | Refinamento de quatro portais | Quatro ensaios espaciais gerais em componentes/energia; dois também em refinamento |
| Bloqueado por dados físicos insuficientes | Rigidezes/vínculos/imperfeições não declarados | Mesmos bloqueios, mais propriedades necessárias à estabilidade com empenamento |
| Pendente de revisão normativa | Aprovação/fabricação bloqueadas | Continuam bloqueadas, sem qualquer promoção automática |

**M43-P5:** fechar medidas de rotação e comparação de diretores, energia, torção e esforços espaciais com referência equivalente; estudar refinamento 3D dentro do prazo/orçamento; validar ou substituir a potencial espacial adotada antes de ampliar o domínio; tratar momentos aplicados e trabalho conjugado apropriado; somente depois abordar empenamento, liberações e cargas distribuídas com dados físicos/normativos suficientes. Spring3D sem Kg, fundações/ligações presumidas, dimensionamento definitivo e fabricação permanecem proibidos.
