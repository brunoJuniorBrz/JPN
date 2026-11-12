# M49 — vigas e terças sem tesouras

Base: merge do PR #84 na `main`, `df7b01f890b580eebdddd9efcdc3a02fffd60a8c`.
O merge preservou exatamente a árvore `6f473ef`, com CI push e PR 11/11.
Não houve deploy. A CI do merge e a CI final desta missão ficam vinculadas no PR.

## Auditoria anterior à implementação

| Domínio | Já disponível na main | Lacuna / decisão M49 |
|---|---|---|
| Vigas e terças | XYZ declarado, propriedades por barra, elementos frame, UDL, segmentação contínua | Não havia papel `beam`; vigas usavam categoria de banzo. Articulação esférica dupla era bloqueada. Adicionados papel físico e rótula de flexão explícita com torção conectada. |
| Apoios existentes | `support-interface.ts`, DOFs e capacidades declaradas separados, reações conferidas por `physical-reaction-path.ts` | Reutilizados sem presumir capacidade, rigidez ou novo apoio. |
| Pórticos, treliças e mistos | `mixed-adapter.ts` e PyNite 3.2.1, frame/axial, 150 nós/320 segmentos, hash e estabilidade elástica | Preservados; cargas transversais em axial e mecanismos continuam recusados. |
| Telha → terça | Panos XYZ, células ortogonais, faixas tributárias, conservação de forças e momentos | Reutilizados sem redistribuidor novo. Ensaio agora inclui vigas flexíveis entre terças e apoios. |
| Vento / combinações | Pressões globais explicitamente declaradas, categorias, fatores, exclusividade e cobertura ELU/ELS | Ensaio usa sucção líquida prescrita e fatores unitários sintéticos. Não calcula automaticamente Cpe/Cpi ou fatores ABNT para essa garagem. |
| Segunda ordem | Pilotos M43 com referências independentes e falhas documentadas | Continuam experimentais; novos releases não os habilitam automaticamente. A validação M49 é linear. |

## Implementação restrita

- `beam` pertence aos papéis físicos declarados. O gerador antigo e seus cinco
  grupos/perfis permanecem iguais; ausência do grupo de viga significa dados
  pendentes, sem preencher propriedades. Backups/hashes históricos são preservados.
- `bending-pinned` libera **Ry e Rz locais**, mantendo Rx conectado ao nó.
  Requer hipótese explícita de contenção torsional. Não significa articulação
  esférica ou contenção real automaticamente comprovada.
- Liberações são aplicadas somente nas extremidades da peça original. Cortes
  internos das vigas continuam contínuos. `pinned` mantém sua semântica anterior;
  duas extremidades esféricas permanecem bloqueadas. O adaptador espacial legado
  recusa a nova hipótese em vez de interpretá-la como rígida.
- Seletores existentes expõem viga e a hipótese de ligação. Sem nova tela,
  solver, dependência, tolerância, coeficiente ou funcionalidade comercial.
- O auditor do #84 agora confere sua entrega **congelada no SHA original** e sua
  ancestralidade na HEAD atual. Também exige que testes, goldens e evidências
  históricos sigam idênticos. Não se regrava a matriz para aceitar alterações.
- `main` e a branch M49 têm deploy automático desabilitado nos dois Vercel configs.

## Referência independente e evidências

Garagem sintética 6 × 4 m: três terças em x=0,3,6 m, duas vigas de 6 m em
y=0,4 m. Somente quatro cantos possuem apoios. C0/C4, a meio vão das vigas,
ficam livres e recebem as reações da terça central. Translações e rotações dos
cantos são hipóteses explicitamente cadastradas do ensaio; não são capacidades
da obra existente. Os releases das barras mantêm flexão simplesmente apoiada.

`analytical-reference.ts` não importa código de distribuição ou solver:
`R=qL/2`, `M=qL²/8`, `δ=−5qL⁴/(384EI)` para terças, e
`M=PB/4`, `δ=−PB³/(48EI)` para vigas sob carga central. A flecha absoluta
da terça central soma sua flexão ao deslocamento dos dois apoios nas vigas.

| Caso | Pressão para baixo | Reação em cada canto | Flecha da viga | Flecha absoluta da terça central |
|---|---:|---:|---:|---:|
| G | 600 N/m² | 3.600 N | −2,025 mm | −5,775 mm |
| W, sucção | −900 N/m² | −5.400 N | +3,0375 mm | +8,6625 mm |
| G + W | −300 N/m² | −1.800 N | +1,0125 mm | +2,8875 mm |

Seis combinações exercitam a cobertura ELU/ELS com fatores unitários declarados.
Os rótulos não validam ações ou coeficientes normativos. O relatório continua
bloqueado e todas as 24 avaliações de apoio têm capacidade pendente.

Os testes conferem esforços, flechas, reações, equilíbrio em cada nó de
transferência, conservação global, limites de execução, inversão de extremos,
mudança isolada da rigidez das vigas, invalidação do hash, propriedades/apoios
ausentes e mecanismo rotacional. Há um teste pelo navegador em 390 px usando
importação, seleção explícita do release, HTTP real, Python e exportação.

- `analytical-comparison.json`: resumo versionado da execução real.
- Artefato CI `general-integration-browser-evidence`: `.tools/m49-runtime/`,
  solicitações/respostas completas, ações de extremidade, relatório e screenshot.
- Reprodução direcionada: `pnpm exec vitest run src/domain/m49-garage-real.test.ts`
  e `pnpm exec playwright test tests/e2e/m49-garage.spec.ts`, com Python 3.12
  e dependências reais nas configurações existentes do projeto.
- Resumo: `python validation/m49/summarize.py`. A CI executa esse conferidor
  sobre o artefato real; não regrava a evidência histórica.

## Pendências / próxima prioridade

Não verifica resistência global das peças, flambagem lateral/torsional,
contenções reais, semirrigidez, excentricidades, ligações/chumbadores, alvenaria,
concreto ou fundações. Geometrias/pressões fora do distribuidor auditado continuam
bloqueadas. Sucção deve ser sustentada por ligação real com capacidade de
arrancamento, ainda pendente. O modelo permanece elástico, bidirecional e sem
contato unilateral: não representa apoio que perde contato sob sucção.

Próxima prioridade: estabilidade lateral/torsional de vigas e terças com
contenções e ligações efetivamente declaradas, ligada à validação espacial de
segunda ordem M43. Seus casos espaciais pendentes não foram promovidos aqui.

`computedStructuralApproval=false`, `fabricationRelease=false`,
`NOT_READY_BLOCKED`. Execução numérica não é homologação ou liberação de obra.
