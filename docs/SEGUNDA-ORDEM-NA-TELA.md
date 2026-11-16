# Segunda ordem na tela

Base: main `f9771d6`; item 4 da seção 7 do handoff pós-C1.

- A seleção de ordem entra na identidade da sessão; trocar de modo cancela a
  execução e invalida resultados/camadas anteriores.
- O adaptador /3 revisado continua preparando a obra. Segunda ordem acrescenta
  `analysis_order=second-order`, `solution_mode=per-combination` e recalcula o
  hash. O transporte continua sendo `postAnalysis`, com preferência assíncrona,
  recibo preso ao corpo e progresso visível.
- A resposta passa pelo contrato específico, hash/IDs/combinações e conferência
  de carga, malha e bases deformadas já existentes. Recusas síncronas ou da fila
  preservam código e combinação. Não há publicação de combinações parciais.
- Studio recebe os mesmos nós, esforços e reações verificados; a identificação
  do solver usa o método corrotacional quando não existe campo de versão.
- Indicadores: deslocamento nodal máximo / maior dimensão do modelo; na segunda
  ordem, amplificação calculada pelo solver contra sua referência linear.
  Esses diagnósticos NÃO são classificação normativa nem drift entre pavimentos.

## Pendências explícitas

Não foi localizado um procedimento revisado com limite NBR 8800 para classificar
deslocabilidade. A classificação fica pendente, sem inventar limiares; a tela
adverte que o linear não comprova suficiência. Exportações numéricas também
registram `linearSufficiency=false` e os bloqueios estruturais.

## Integração resistente e restauração (#127)

O relatório recompõe a entrada atual com as opções de segunda ordem e confere
hash, cargas e estações INT-3c. Os verificadores 14762/8800 recebem vetores
concomitantes por estação, sem ajustar um polinômio ao resultado não linear.
O adaptador resistente reutiliza as fórmulas existentes como avaliações de seção,
mantém o comprimento físico para esbeltez/capacidades e remapeia a estação governante.
Nenhuma interpolação ou extremo contínuo é alegado. A matriz aceita somente
execuções ligadas ao hash da análise e do resultado atuais; requisições obsoletas
são canceladas. Os registros 14762 da avaliação M50 alimentam também a matriz.

A avaliação de segunda ordem recebe a entrada/resultado conferidos e nunca
chama o worker linear. Reutiliza o batch resistente existente, com cache privado
de geometria. Ações contínuas de contenções/ligação M50, M51, extremos contínuos,
Cb e procedimentos 14762 que exigem N uniforme sem essa condição ficam BLOQUEADOS
com códigos visíveis. `second-order-station-coverage` impede aprovação da peça.
Os limites de 20 s/768 MiB e todas as fórmulas/tolerâncias históricas são preservados;
geometrias que excederem o orçamento continuam recusadas, sem fallback linear.

A última análise é guardada no cache local do navegador por ID da obra. Ao
reabrir, o resultado é recomposto/conferido pelo `input_sha256` da obra atual,
ou marcado `STALE_ANALYSIS` sem disponibilizar dados anteriores. Arquivos
exportados de segunda ordem também podem ser restaurados. Não se confia na
preparação do arquivo nem em suas alegações de origem; aprovação/fabricação
continuam bloqueadas. O cache não é sincronização de resultados entre dispositivos.

**N12 — Claude Code:** confirmar o procedimento e limite NBR 8800 para a
classificação normativa de deslocabilidade. Nenhum limite foi inventado.

Prova independente: balanço comprimido de 1 m, P=30% do crítico de Euler fraco,
com força transversal explícita, uma combinação sintética unitária (não normativa).
Momentos comparados também com `tan(k)/k`, k=pi*sqrt(0,3)/2, erro <1%.

| Família | Momento linear/2ª ordem (N m) | Utilização de flexão linear/2ª ordem |
|---|---|---|
| Ue 100x50x15x4, ri=3 mm — 14762 | 600 / 810,365 | 0,340366 / 0,459701 |
| I soldado 200x100x6x10 mm — 8800 | 4000 / 5401,160 | 0,351317 / 0,474380 |

Matriz 8800: utilização parcial governante 0,701728 → 0,811111. Na 14762,
a interação contínua com N não uniforme é bloqueada; máximos de conjuntos
diferentes de checks não podem ser comparados como melhora de segurança.
O teste comprova o aumento da utilização do mesmo modo de flexão em ambas.
As referências geométricas Ue são calculadas por sectionproperties 3.10.2;
cargas críticas do estudo resistente são explicitamente sintéticas/condicionais.

## Validação direcionada

Testes direcionados de resistência/contratos e regressões legadas dos dois
verificadores; E2E 390/1440 px, com galpão sintético declarado de 16 barras,
Python real por HTTP, deformada/momento/reações, troca de ordem e três recusas
sem resultados parciais. No E2E local somente a persistência da fila é simulada;
a resposta numérica é do worker real. A fila remota publicada não foi exercitada.
Um E2E adicional percorre a mesma coluna I na tela em linear/segunda ordem e
confere o aumento da utilização da matriz 8800, com bloqueios visíveis.

ESLint completo, tsc e auditoria de integração são registrados no PR. Nenhum
arquivo normativo reservado ao Claude ou arquivo do solver numérico foi alterado. Somente os adaptadores resistentes
receberam o protocolo adicional de estações.
