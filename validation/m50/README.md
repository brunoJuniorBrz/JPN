# M50 — contenções, resistência e demandas de ligação integradas

Base: PR #86 integrado com histórico à `main` por merge
`1a7002b1699c9f674550483f6e142bc7e27b9ec8`, árvore idêntica à M49 validada.
[CI da main após o merge: 11/11](https://github.com/brunoJuniorBrz/JPN/actions/runs/43259024526).
Sem deploy. M50 segue em PR draft, sem autorização de merge.

## Auditoria e domínio entregue

| Frente | Reutilização / lacuna | Entrega M50 e limite |
|---|---|---|
| M50-A | Apoios e axiais já entram no solver; contenções avançadas eram sobretudo posição/texto e comprimentos declarados | Contrato físico por peça/nó/posição/direção, vínculo a DOF fixo existente ou barra axial existente e capacidade direcional declarada. Não cria nós, apoios, molas ou contenções de telhas. |
| M50-B | `prepareColdformedDesign`, worker geométrico, MRD, esforços contínuos e assessment já existiam separadamente | Orquestra análise real, recupera esforços contínuos e executa os procedimentos existentes por peça/combinação. Geometria é recalculada e cada entrada é admitida separadamente. |
| M50-C | Reações e ações de extremidade já eram conferidas; sua soma nula não é demanda de ligação | Resultantes concomitantes por participante original, reação sobre aço, carga sobre construção existente e demanda de arrancamento separadas da capacidade. Sem repartir forças por parafuso ou inventar resistência. |
| M50-D | P5 tem uma coluna verificada e três casos pendentes com evidências independentes | Auditor reproduzível sobre a campanha obrigatória existente. Núcleo corrotacional, critérios e referências preservados; nenhum benchmark promovido. |

`physicalRestraints` é opcional, sem preencher defaults em projetos antigos.
Importação/backup preservam o contrato. A preparação recusa assinatura obsoleta,
posição sem nó físico, vetor inválido, eixo/DOF incompatível, vínculo duplicado,
barra inexistente/não axial e suposta contenção torsional desconectada por rótula.
Contenção oblíqua no solo exige formulação multiponto ainda não suportada.

A barra de contraventamento contribui com sua **rigidez finita EA/L** no solver
existente. Não vira apoio rígido nem reduz automaticamente o comprimento de
flambagem. Referências flexionais `π²EI/Lmax²` usam apenas posições de contenções
ideais explicitamente vinculadas, são controles mecânicos, não resistências ABNT
ou verificações de flambagem lateral com torção. O cFSM automático não aceita
o modelo sem contenções intermediárias quando há uma contenção física interna.

O hash do estudo resistente inclui as declarações físicas, inclusive capacidades
e revisões. Mudar a contenção invalida a análise e o estudo antigo. Métodos MRD
com críticos externos continuam **condicionais**, mesmo quando a aritmética passa.

## Execução e limites

`POST /api/experimental/structural-assessment` recebe
`{schema_version:"jpn.structural-assessment/1", project:...}` pela mesma guarda
local/origem do executor existente. Não há nova tela ou funcionalidade comercial.
Pipeline: modelo declarado → PyNite/ações reais → contenções e demandas contínuas
→ até quatro estudos explicitamente selecionados → worker resistente existente
→ relatório agregado com perfil/aço/propriedades, seis esforços concomitantes,
combinação/posição, modo, fórmula, cláusula, status e limitações.

O modo `verified-coldformed-batch/1` do worker de seções evita recalcular a mesma
geometria para cada combinação. Seu cache privado dura um processo e usa a entrada
geométrica completa e exata, incluindo fonte/revisão/Poisson/refinamento. Cada
admissão de propriedades, conexão e cálculo resistente continua sendo executada;
o cliente não pode fornecer uma seção previamente calculada ao cache.

Permanecem 20 s para o worker e para a orquestração inteira, 768 MiB, uma execução
por vez, 500 kB de entrada e 2 MB de saída. O PC local atingiu o limite no cálculo
de seção durante o desenvolvimento: a recusa foi preservada. A CI final deve
demonstrar a cadeia completa no SHA entregue, incluindo o worker batch em Linux
e Windows, antes de afirmar entrega validada. Resultado e links ficam no PR.

## Referências independentes e evidências

Ensaio sintético reaproveita a garagem M49. A viga V0 recebe a seção Ue
100×50×15×2 mm, ri=3 mm, da evidência geométrica já existente, recalculada pelo
worker. A barra axial explícita C0→R tem EA/L=2 MN/m; os dados são didáticos,
sem aprovação de obra. Há G=20 N/m², sucção W=30 N/m², N=100 N de compressão,
força lateral de 10 N e torque de 0,01 Nm explicitamente declarados.

A referência lateral inclui **todas** as barras participantes: rigidez da viga
V0 em paralelo com a barra axial e com a série terça central/viga V4.
`k_v=48 E Iz/L³`, `k_t=EA/L`, `k_serie=k_t k_V4/(k_t+k_V4)`,
`u=10/(k_V0+k_brace+k_serie)`. Força na barra ≈5,328662738 N;
não 10 N e não uma reação de apoio rígido. Torque de referência: 0,005 Nm por
extremo. As capacidades didáticas de 5 N e 0,003 Nm são excedidas e não são
tratadas como resistências verificadas.

Referências de flexão/cortante na V0: G → 180 Nm/60 N, W → 270 Nm/90 N,
G+W → 90 Nm/30 N. São conferidas as equações dos ramos existentes, com geometria
recalculada, compressão e interação concomitante. Críticos do ensaio são inputs
sintéticos externos; não validam estabilidade. Torção, cortante secundário e
interação flexão–cortante 9.8.4 continuam bloqueados quando aplicáveis.

Testes cobrem casos inválidos, capacidade ausente/excedida, conservação nas juntas,
invalidação, persistência, comparação analítica e HTTP real Next.js→Python.
Artefatos: `.tools/m50-runtime/` na CI da aplicação e `m50-p5-audit.json` nos
artefatos independentes por sistema. Reprodução direcionada:
`pnpm exec vitest run src/domain/m50-assessment-real.test.ts`;
`pnpm exec playwright test tests/e2e/m50-assessment.spec.ts`.

## P5 / pendências e próxima prioridade

- `sway`: refinamento de ações internas ≈0,00938 e erro máximo de ação física
  ≈0,003884; comparações estritas falham. Exige diagnóstico consistente de
  cinemática/recuperação espacial, não ajuste de um coeficiente.
- `spatial`: tentativa refinada atinge 20 s; o fallback grosso não é uma solução
  fina validada. Separar custo de montagem e convergência física.
- `torsion`: há divergência também contra Kirchhoff contínuo e falha de equilíbrio
  da referência OpenSees refinada. Não cabe substituir referência ou ampliar pisos.

`audit_p5.py` confere hashes dos cinco fontes P4, critérios congelados e estados
de bloqueio sobre a campanha existente, sem repeti-la ou regravar sua evidência.
Não foi identificada correção pequena sustentada pelas referências atuais.

Não conclui M43/M44/M45. Contenção elástica não prova flambagem lateral/torsional;
faltam os demais modos aplicáveis, ligações/ancoragens, excentricidade, semirrigidez,
perda de contato, capacidade da construção existente e homologação profissional.
Próxima prioridade: estabilidade espacial e lateral com torção com contenções
reais, usando diagnóstico de energia/ações e referências independentes por modo.

`computedStructuralApproval=false`, `fabricationRelease=false`, `NOT_READY_BLOCKED`.
