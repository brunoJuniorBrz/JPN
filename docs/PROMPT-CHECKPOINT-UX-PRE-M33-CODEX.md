# Checkpoint de UX pré-M33 — escopo real, validação e promoção à main

**Documento de execução, não implementação.** Base técnica: PR #44 `feat/m32-numerics-mixed-second-order`, SHA conferido `566e068010446c3af8cb4889391ac177dcf752e3`; PR #45 apenas pesquisa/docs. Confirmar HEADs antes de qualquer alteração.

## Fatos já auditados — não pedir nova missão de motor

- M32 inclui cumulativamente M26, M27–M30, M31, M32; GitHub `main...M32`: **85 commits à frente, zero atrás**, conforme a base consultada. Ainda NÃO foi mesclado à main.
- PR #39 (`feat/result-workspace-tabs`) é UX: quatro abas, canvas WebGL persistente, agrupamento da informação. PR #40 (`feat/ux-actionable-pending-piece-search`), empilhado sobre #39: busca de peças, pendências acionáveis.
- `result-presentation.ts`, `piece-search.ts` e seus documentos NÃO existem na M32; o renderizador Studio e o Modo Acabado JÁ existem na M32. **Portagem seletiva** em vez de merge cego do histórico.
- PR #38 contém checagens isoladas de soldas/parafusos e NÃO está na M32; **guardar para M36**. PR #42 é pesquisa; #43 é handoff/testes; #45 docs.
- Execução GitHub Actions para o **SHA final M32**: https://github.com/brunoJuniorBrz/JPN/actions/runs/41845654956 — **9/9 jobs com `conclusion=success`**, confirmados diretamente, inclusive application e perfis Python em Windows/Linux. Isso **não testa** portagem UX ainda.
- `coldformed_design.py` mantém `jpn.nbr14762-mrd/2` no avaliador convencional; `coldformed_geometry.py` atribui `/4` ao fluxo automático `computed-cfsm-ss`, e `src/domain/coldformed-design.ts` recusa `/2` e `/3` como execução cFSM automática atual. **Não atualizar versões indiscriminadamente.**
- Testes CUFSM/Octave, Stabileo, Frame3DD e soluções analíticas exercitam domínios delimitados. **Não são substitutos dos dois modelos externos completos de cobertura** ainda exigidos no gate.

## Solicitação enxuta ao Codex — apenas checkpoint de interface

1. Confirme SHA de M32 e faça branch candidata **a partir do HEAD M32**. Audite o diff e porte seletivamente #39, depois #40, sem sobrescrever `planning-editor.tsx`, `structure-preview.tsx` e outras evoluções posteriores. Se recurso já existir, não recriar. Não reimplementar M26–M32.
2. Aceitação funcional direcionada:
   - quatro abas Resultado, materiais/pendências e downloads nos lugares corretos;
   - WebGL/câmera/seleção persistentes ao alternar abas; Modo Acabado, Studio, filtros e mobile preservados;
   - busca por ID/categoria e destaque correto, com IDs originais intactos;
   - pendências corrigíveis levam ao formulário/categoria apropriado; indisponíveis seguem bloqueadas;
   - nenhuma alteração em quantitativos, hashes, snapshots, orçamento, métodos estruturais ou gate.
3. Execute `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` e Playwright **direcionado** às abas, busca, pendências, estado 3D e regressões da navegação afetada em 320/375/1440 px. Execute CI completa antes de propor promoção à main; se houver alteração em motor/contrato, exija de novo validação Python aplicável. Reporte comandos, locks, resultados e SHA testado — nunca infira sucesso da CI anterior.
4. Safari em **iPhone físico é uma etapa manual do proprietário**. Fazer emulação Playwright quando disponível; registrar `iphone-physical=not-verified` até ocorrer a verificação real; não fingir que o Codex tem acesso a um aparelho.
5. Não integrar #38/#42 e não executar M33 dentro desta branch. A M33 pode avançar **em paralelo sobre outra branch M32**; identificar especialmente possível conflito em `takeoff-summary.tsx` e criar nota de reconciliação, sem travar o desenvolvimento de vento/combinações.
6. PR draft separado com relatório de diferenças, testes, mudanças e limite de escopo. **Sem merge ou deploy automático.**

## Plano de promoção à main (entrega obrigatória do checkpoint)

O PR deve terminar com um documento específico que indique:
- SHA de origem M32, SHA da candidata, HEAD atual da main e `merge-base`; novo `ahead/behind`.
- **Ordem proposta:** revisar M32 acumulada como candidata do motor → agregar UX #39/#40 sobre ela após regressão → decidir promoção integrada à main em PR apropriado, ou promover por etapas menores se houver razões técnicas, sem reaplicar branches ancestrais.
- Evidências e riscos por camada: motor, cFSM/versão, UI/estado WebGL, armazenamento, DXF/PDF, casos normativos incompletos, CI, iPhone manual.
- Relação do que **entra** e do que **fica de fora** (#38, #42, pesquisa, funções experimentais ainda não aceitas), com motivo. O fato de código experimental existir na ancestralidade M32 NÃO significa que deva ser anunciado como recurso aprovado.
- Estratégia de conflito com a M33 paralela e ordem de merge/rebase final após as duas frentes.
- Resultado de `buildEngineReleaseGate` mantido em `NOT_READY_BLOCKED`, `computedStructuralApproval=false`, `fabricationRelease=false`.
- Nada é publicado ou promovido sem revisão final e autorização explícita.

**Critério de conclusão:** UX selecionada integrada e demonstrada, CI da candidata executada, plano concreto de promoção pronto. Não exigir revalidação externa de coberturas completas nesta tarefa de UI; elas permanecem prioridade da M35. Não confundir fechamento desta tarefa com conclusão normativa do produto.
