# M33 — pré-auditoria independente: origem normativa de vento e combinações

**Estado:** documento de preparação, não implementação normativa; base exata PR #44, SHA `566e068010446c3af8cb4889391ac177dcf752e3`. Não houve alteração dos cálculos. **O PR #44 já contém a cadeia acumulada de código M26–M32 e está 85 commits à frente da main, sem commits faltantes da main; NÃO há uma missão de reimplementação/merge de M26–M32 como pré-requisito técnico da M33.** Consulte `docs/MAPA-INTEGRACAO-REAL-POS-M32.md` para saber quais PRs paralelos não estão incluídos. A promoção de release à main ainda exige revisão.

## 1. Descobertas já verificadas no código

| Peça existente | Evidência | Reutilização na M33 |
| --- | --- | --- |
| `src/domain/wind-speed.ts` | Calcula S2, Vk, q; `edition: "2023-original"`; `currentEditionCorrectionsVerified:false` | Conferir texto 2023 + errata 2025, corrigir se preciso, preservar contrato/revisão |
| `src/domain/wind-contracts.ts` | `jpn.wind-roof/1`; `externalCoefficient`/`internalCoefficient` declarados; geometria, incidência, fonte; `pending-engineer-review` | A camada normativa gera declarações *rastreáveis* ou contrato novo versionado, sem autovalidar registros manuais |
| `src/domain/wind-load-path.ts` | `distributeWindActions`, pressão líquida `q*(Cpe-Cpi)`, reações às terças, força/momento conservados | Não recriar distribuidor; validar compatibilidade de zonas e incidência |
| `src/domain/roof-regions.ts` e `roof-load-path.ts` | Águas planas, distribuição tributária e superfícies em SI | Reaproveitar geometria; detectar explicitamente zona aerodinâmica fora do subconjunto retangular representável |
| `src/domain/engineering-combinations.ts` | Casos permanent/variable/wind, exclusividade, ULS/SLS, `gamma*psi` declarados, `pending-engineer-review` | Criar *provedor* de combinações conforme edição vigente; manter compilador e trilha declarada |
| `src/domain/loaded-mixed-adapter.ts` | Transferência real de UDL às peças e solver `mixed3d/2` | Manter intacto na primeira etapa, testar fim a fim |
| `src/components/planning/wind-engineering-panel.tsx` | UI experimental usa JSON técnico com campos pendentes | Primeira M33: núcleo e testes, depois formulário guiado; não exigir JSON como fluxo final do engenheiro |
| `src/domain/engine-release-gate.ts` | `normative-actions` bloqueado; `fabricationRelease:false` | Manter a barreira global, mesmo se alguns procedimentos normativos individuais passarem |

Testes de `src/domain/wind-load-path.test.ts` já incluem zonas assimétricas, conservação, lacunas/sobreposições, pressão líquida nula, persistência e comparação via PyNite; `wind-speed.test.ts` cobre verificações de velocidade. Evitar duplicar estes testes: acrescentar os **testes novos de seleção normativa**.

## 2. Edições normativas — pesquisa de procedência, não extração de tabelas

- **NBR 6123:2023 com Errata 1 de 08/04/2025**. Confirmação da publicação pela CBIC: https://cbic.org.br/cbic-divulga-boletim-de-normas-tecnicas-de-abril-e-maio-3/ ; ficha da errata: https://www.dinmedia.de/en/standard/abnt-nbr-6123-errata-1/392191276 . O código atual declara expressamente a edição **original**, portanto não presumir automaticamente conformidade com a versão corrigida.
- **NBR 8681:2025** substituiu a edição 2003. Fonte: ABECE https://site.abece.com.br/em-vigor-a-nova-nbr-8681/ ; identificação da edição: https://www.dinmedia.de/en/standard/abnt-nbr-8681/396242177 .
- **NBR 6120:2019**, consultar versão corrigida e aplicabilidade das ações gravitacionais: https://cbic.org.br/inovacao/2019/10/15/norma-para-calculo-de-estruturas-de-edificacoes-e-publicada-2/ .
- Necessária obtenção **legítima do texto completo e corrigido** para cada fórmula, tabela, figura, exceção, interpolação, classificação e fator a implementar. Metadados de edições e exemplos antigos NÃO fornecem autorização matemática para preencher constantes. Conferir a norma específica de projeto estrutural quando seus coeficientes/composições forem determinantes.

**NÃO programar Cpe/Cpi/zonas/fatores com base em memória do modelo, motores de outras edições ou arredondamento de memoriais.** Proveniência obrigatória: norma, edição, errata, item/tabela/figura, domínio, entradas, unidade, regra de interpolação e revisão.

## 3. Domínio mínimo explícito da M33

Coberturas retangulares de **uma água e duas águas simétricas** com a geometria já gerada, terças paralelas e hipótese de distribuição de telhamento biapoiado, ação estática global na cobertura, incidências e características de edifício cobertas por procedimentos efetivamente lidos na norma.

Separar:
1. `SUPPORTED_VERIFIED`: a combinação de tipologia, inclinação, relação geométrica, vento incidente, fechamento, aberturas e fatores está comprovadamente contemplada na fonte aplicável e coberta por teste externo.
2. `DECLARED_UNVERIFIED`: coeficientes e fatores informados pelo engenheiro; continuam utilizáveis como estudo experimental, sem rotulagem automática normativa.
3. `BLOCKED_UNSUPPORTED`: faltam características da obra, a figura/tabela necessária, casos de abertura/pressão interna, topografia, orientação, zona não representável, geometria fora do domínio, norma incompatível ou cobertura insuficiente de combinações.

"Edificação fechada" isoladamente não é seleção de Cpi. Definir aberturas, permeabilidade, volume e hipóteses exigidas. Quando um caso de pressão interna demandar cenários alternativos, gerar casos identificados e mutuamente exclusivos, sem descartar silenciosamente o mais desfavorável.

**Atenção de integração:** `wind-load-path.ts` exige zonas retangulares que particionem cada superfície, e zonas longitudinais alinhadas à discretização existente; a M33 deve detectar quando uma zona normativa não cabe nesse contrato e bloquear, ou implementar a discretização explícita com uma campanha de validação própria. Não homogeneizar coeficientes para evitar alteração do distribuidor.

O M33 inicial NÃO deve incluir automaticamente fachadas, componentes locais de telha/fixadores, topografia complexa, edificações abertas, telhados curvos, imperfeições e segunda ordem global. Estes itens podem ser essenciais em obra real: caso atinjam o caso, bloquear a aprovação.

## 4. Três referências já selecionadas (sem inventar fixtures)

Documento fonte: `docs/VALIDACAO-OBRAS-REFERENCIA.md`. Não há dois modelos completos de cobertura reproduzidos ainda.

| Referência | Uso adequado na M33 | Limitação/ação prévia |
| --- | --- | --- |
| **REF-04 — UFMG 2025, cobertura de rampa/escada** | Prioridade em fatores S2, ações e referências de vento; criar ficha de incidência/pressões; parte da geometria é mais complexa que as tipologias automáticas | Não interpretar pressões globais publicadas como Cpe de uma zona; só transcrever entradas comprovadas; pode ser comparação PARCIAL |
| **REF-01 — UBS Conselvan** | Geometria 1/2 águas e comparações de ações isoladas quando entradas equivalentes estiverem disponíveis | Memorial declara V0=45 m/s numa folha e V0=33 m/s noutra e usa pressão adotada arbitrariamente. **Nunca usar os resultados de vento como oracle normativo sem reconciliação.** |
| **REF-02 — CBCA, Anexo D** | Referência para ações, peças formadas a frio e combinações **do documento histórico** | Norma antiga e apoio sobre estrutura de concreto: NÃO usar como verdade normativa 2025 nem afirmar equivalência global sem detalhar vínculos |

Não inserir números de Cpe, Cpi, gamma ou psi sem fonte normativa identificada. Os números publicados nos memoriais podem conter edição antiga, método distinto, arredondamento e hipótese insuficiente.

Cada fixture futura deve declarar `status` (`normative-oracle`, `historical-reference`, `partial-physics`, `blocked`), `source_url`, folha/seção, edição normativa, entradas extraídas, hipóteses, itens ausentes e a grandeza exata comparada. Sem fixtures com campos numéricos ficcionais apresentados como memória real.

## 5. Contrato de aceitação verificável

- **Teste de norma isolado:** coeficiente/zona/fator calculado com entrada legítima, dentro dos limites geométricos, acompanhado de item/tabela/figura/edição; comparação independente e limites de interpolação (inclusive extremos).
- **Teste de recusa:** aberturas desconhecidas, incidência não coberta, conflito de edição, zona fora do contrato, falta de isopleta/S3 e dados nulos; nenhuma adoção automática "conservadora" sem demonstração de que cobre os casos normativos.
- **Teste de equivalência:** quando coeficientes normativos efetivamente conhecidos são inseridos nos contratos atuais, resultado do distribuidor novo = distribuidor anterior para a mesma física, dentro da precisão previamente fixada.
- **Integração completa:** fonte normativa → casos e zonas → `distributeWindActions` → `compileEngineeringCombinations` → `loaded-mixed-adapter` → solver → reações/solicitações, com conservação de carga, momento, sinais e exclusividade.
- **Rastreabilidade e invalidação:** toda alteração em geometria, referência normativa, aberturas, fatores, edição, fonte ou direção torna obsoleta a combinação e seu relatório; resultados antigos continuam legíveis como históricos, sem aprovação.
- **Compilação e CI:** lockfiles preservados, Python 3.12, Node 24, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e`, `pnpm build`, perfis opcionais; registrar limites de ambiente e falhas.
- **Gate:** nenhum caminho pode devolver `computedStructuralApproval=true` ou `fabricationRelease=true`. A implementação de origem normativa parcial não implica resistência, segunda ordem, ligações, fundação, ELS e vento local completos.

## 6. Divisão de trabalho

**Preparado sem consumo dos ciclos de implementação pesada:** auditoria do repositório, inventário de código/testes existentes, confirmação pública da edição das normas, identificação das fontes de referência e dos bloqueios, contrato de aceitação e prioridades. Nenhuma fórmula/tabela da norma foi inventada.

**Codex — somente trabalho que exige codificação e execução especializadas:** consultar texto aplicável completo, extrair e implementar coeficientes/zonas e Cpi nos domínios comprovados, compor fatores atuais da NBR 8681:2025, testar seleção/interpolação/exceções, integração pelo caminho de cargas já existente e executar comparações independentes reproduzíveis.

**Sequência correta:** usar o HEAD do PR #44 como base cumulativa de M26–M32 → congelar fixtures verificáveis → implementar seleção normativa isolada em branch separada → integrar/validar → beta de cobertura na M34. Em paralelo, preparar uma candidata de produto para incorporação **seletiva** de UX #39/#40 (ainda fora da M32) e eventual promoção revisada à main. PR #38 (ligações isoladas) é assunto posterior de resistência e ligações; #42 permanece pesquisa. Não mergear este documento automaticamente à main.
