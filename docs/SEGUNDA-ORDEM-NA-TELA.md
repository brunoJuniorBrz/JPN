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

Relatório resistente, avaliação M50/M51 e ações de ligações da segunda ordem
não são substituídos por recálculos lineares. Permanecem pendentes, assim como
restauração de arquivo de segunda ordem (a restauração linear é preservada).

## Validação direcionada

14 testes Vitest (cliente assíncrono, recusas com combinação, observação geométrica
e camadas); dois E2E, 390/1440 px, com galpão sintético declarado de 16 barras,
Python real por HTTP, deformada/momento/reações, troca de ordem e três recusas
sem resultados parciais. No E2E local somente a persistência da fila é simulada;
a resposta numérica é do worker real. A fila remota publicada não foi exercitada.

ESLint completo, tsc e auditoria de integração são registrados no PR. Nenhum
arquivo normativo reservado ao Claude ou arquivo do motor Python foi alterado.
