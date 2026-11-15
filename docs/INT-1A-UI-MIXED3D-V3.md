# INT-1a — a UI emite `jpn.mixed3d/3`

Continuação do #107 (head `ed2134b`, transporte HTTP já aceitando /3). `computedStructuralApproval=false`, `fabricationRelease=false`, `NOT_READY_BLOCKED`.

## O que mudou
- **Schemas Zod** (`structural-loading.ts`): `loadedMixedRequestV3Schema` (= todos os campos e regras do /2 + `local_axes: "jpn-z-up/1"`), `loadedMixedResultV3Schema` (+ `local_axes.members` com giro declarado, deslocamento de referência, giro enviado ao solver e base `global_to_local`), uniões `anyMixed*`, guardas `isLoadedRequest/isLoadedResult` e verificação de rastreabilidade dos eixos (`AXES_TRACE`: giro declarado igual ao enviado, base ortonormal, um registro por pórtico). `/1` e `/2` mantêm schemas, números e hashes.
- **Adaptadores**: `adaptLoadedMixedProjectV3` emite /3 (também sem carregamento declarado, com listas vazias). `adaptLoadedMixedProject` (/2) e `adaptMixedProject` (/1) não mudam.
- **Giro declarado por peça**: novo campo `spatialPreparation.localAxes` (`local-axes-review.ts`): giro no sistema `jpn-z-up/1`, fonte, revisão e assinatura da geometria. O giro legado (base interna do PyNite) **não é reaproveitado**. Peça de pórtico sem giro revisado, com revisão de geometria antiga, duplicada ou órfã gera `AXIS_REVIEW_PENDING` listando as peças; nenhum valor padrão é assumido.
- **UI** (`local-axes-panel.tsx`, `mixed-analysis-workspace.tsx`): painel “Eixos locais” com pendência visível por peça e registro revisado; `execute()` usa o adaptador /3. Exemplos sintéticos embutidos (seções isotrópicas) declaram giro 0° na própria UI, sem alterar os projetos de exemplo nem seus hashes /1 e /2; qualquer exemplo com Iy ≠ Iz exigiria revisão explícita.
- **Recuperação, relatórios e conexões** reconstroem o adaptador pela versão do próprio resultado (`current-mixed-adapter.ts`): /3 exige os eixos revisados; arquivos /1 e /2 restauram como antes. Runners local/remoto já aceitam /3 (parse por `anyMixed*`; o health remoto aceita /1–/3).

## Aceite
`src/domain/local-axes-ui-route.test.ts`: a viga de referência da C1 (6 m, 100 N/m, Iy=8e-6, Iz=1e-6, extremos rotulados, apoios fixos) como projeto físico → `adaptLoadedMixedProjectV3` → **rota HTTP `/api/experimental/mixed3d`** → PyNite → verificações da UI. Em 90° com desnível de 0,6 m a flecha vertical no meio é **−1,06524562 mm**, igual ao valor `/3` de `validation/c1-local-axes/evidence.json` (tolerância 1e-9 mm) e a 2·10⁻⁴ da solução fechada com Iy (−1,065234 mm); sem resposta lateral. Também 30° e 135°; giro revisado de 90° leva à flexão no eixo fraco (Iz); pendência e invalidação por geometria; o gêmeo /2 do mesmo modelo é recusado pela guarda `AXIS_CONVENTION_AMBIGUOUS`.

## Limites
Persistência/migração de projetos antigos: não há; cada peça precisa ser revisada. Segunda ordem (M43), rota remota de design e eixos nos contratos `frame3d` continuam fora. O backend remoto precisa anunciar /3 (o `app.py` do #107 já anuncia).
