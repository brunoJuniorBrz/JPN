# M33-A — checkpoint publicado para retomada

PR #46: `feat/m33a-normative-wind-combinations`, draft, sem merge/deploy.
Base auditada: `83420da`. Estabilização: `08e9f71cb7b33adc834382ecdc5bc7bf997674cd`.

## CI e desempenho

A CI da estabilização passou nos nove jobs, Linux/Windows, antes das alterações normativas:
https://github.com/brunoJuniorBrz/JPN/actions/runs/41899046892
Imports JSON usam atributo de tipo; dados/cálculos preservados. Caches exatos limitados à montagem/malha reduzem integrações FE e fatorações repetidas. Nenhum timeout, tolerância ou malha foi relaxado.
Evidências: `validation/m33a/stabilization/`. Workers cFSM 12,808/12,757 s; HTTP resistente 15,651 s neste ambiente.
A CI do checkpoint normativo precisa ser conferida após o push. Este checkpoint não declara a M33-A concluída.

## Fontes e domínio implementado

Os três PDFs fornecidos foram lidos somente nos trechos aplicáveis e permaneceram privados. Hashes, cláusulas, páginas e diferenças estão em `data/normas/supplied-source-review-m33a.json`.
O inventário anterior `source-audit-m33a.json` fica identificado como histórico, sem apagar dados recuperados do Git.
`reviewed-roof-catalog.ts` transforma extrato privado versionado nos contratos existentes; reutiliza provedor, distribuidor, compilador e solver.
Domínio: planta quadrada, queda width-positive, sem balanços/saliências/lanternins; duas águas 45°, h de beiral/b≤0,5, incidências 0/90; uma água 30°, h baixo/b<2, incidências 90/270.
Exige fechamento efetivamente estanque, janelas fixas com ruptura acidental desprezível, volume único, duas alternativas de Cpi, aplicação estática e demais declarações explícitas. Usa Ce global; verificações locais de telhas/terças/fixações continuam bloqueadas.
A altura de beiral e a altura máxima usada na velocidade são registradas separadamente. A geometria conserva a precisão de tan(30°), sem arredondar o cálculo.
NBR 8681:2025: ELU normal e ELS rara/frequente/quase permanente; G individual de aço ou cobertura industrializada, Q de utilização de cobertura e vento principal/acompanhante. ELS rara usa ψ1 nas acompanhantes.
Cada ação inteira mantém seu fator; vento mutuamente exclusivo e efeitos favoráveis/desfavoráveis explícitos. Vetores de fatores exatamente iguais são resolvidos uma vez, com alternativas registradas na rastreabilidade.
Dados importados permanecem DECLARED_UNVERIFIED; não recebem SUPPORTED_VERIFIED automaticamente.

## Comparação comprovada 2023 / corrigida 08.04.2025

Tabela 7, EFI/α90: seis sinais negativos passam a positivos, nos grupos h/b≤1/2 (45°/60°), 1/2<h/b≤3/2 (45°/60°), 3/2<h/b≤6 (50°/60°). Somente o primeiro caso de 45° integra o domínio implementado.
6.3.2.1(c), abertura dominante a sotavento: referência da Tabela 4 passa à Tabela 6; procedimento permanece bloqueado.
5.3.3: a definição de Fr perde a menção textual explícita à categoria II; os fatores numéricos comparados não mudam.
Não foram encontradas diferenças numéricas no subconjunto comparado de velocidade/S3 grupo 3, Ce da Tabela 8 a 30° e alternativas simplificadas de pressão interna. Isso não certifica equivalência integral das edições.

## Validação e retomada

47 testes direcionados passaram antes do último teste adicional de precisão geométrica. TypeScript e lint direcionado passaram antes da reorganização final dos oráculos privados.
10 testes com dados privados passaram: integrais manuais independentes, duas tipologias, quatro famílias de combinações, 108 combinações no solver nativo, equilíbrio e IDs governantes. Resíduos relativos ficaram abaixo de 1e-8. Evidências derivadas: `private-tests.json` e `private-validation-results.json`.
A última edição moveu também os fatores dos seletores de oráculos para configuração privada; repetir esses 10 testes na retomada. Não há valores de tabelas publicados nesses seletores.
Uma tentativa de configuração privada incluiu indevidamente a suíte pública em ambiente development; foi interrompida e corrigida. Não conta como passagem da suíte completa.
A suíte pública completa foi iniciada novamente no ambiente correto; seu fechamento e o resultado da nova CI devem ser conferidos na retomada. Não presumir aprovação a partir deste checkpoint.

Configuração: `JPN_NORMATIVE_DATA_DIR` aponta para diretório absoluto fora do Git, contendo `m33a-reviewed-extract.json`, conforme esquema exportado. Ausência/erro bloqueia, sem fallback. O proprietário deve provisionar os dados licenciados separadamente em outro computador.
Validação privada: `node node_modules/vitest/vitest.mjs run --config validation/m33a/private.config.ts`; exige também `manual-oracles.json` privado e ambiente do runner nativo indicado no inventário.

Continuam bloqueados: demais inclinações/proporções/direções, aberturas dominantes/permeabilidade não implementada, vento dinâmico/vizinhança, coberturas compostas/isoladas, procedimentos que dependam das páginas corrigidas após 48, demais classes de ações e compatibilidade datada NBR14762:2010/6.7.
Faltam revisão independente da transcrição/aplicabilidade, fechamento dos checks no SHA final e validações estruturais completas.
Preservados: NOT_READY_BLOCKED, computedStructuralApproval=false e fabricationRelease=false.
