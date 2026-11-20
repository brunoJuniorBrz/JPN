# PR #159 — sincronização E2E após criação rápida

## Causa confirmada
Duas execuções do commit 5f06375 (runs 44782448558 e 44782457982) aprovaram os testes de vento e de aplicação, mas falharam em 2 testes Playwright com limite de asserção padrão de 5 s. Os alvos `takeoff-totals` e `img[aria-label="Modelo 3D da estrutura"]` constam dos snapshots de erro coletados após o timeout. O modelo e a lista de materiais estavam efetivamente presentes; a asserção começava enquanto o `router.push` assíncrono do formulário rápido ainda abria `/projetos/{id}?fluxo=levantamento&etapa=3&vista=3d`.

As falhas alternaram entre os viewports 375 px e 1440 px nas duas execuções, típico de corrida de inicialização sob carga, não de erro geométrico determinístico.

## Correção delimitada
- Esperar explicitamente a rota do projeto (não só o clique) nos cenários `preproduction.spec.ts` e `spatial-preparation.spec.ts`.
- Aguardar até 30 s pelos totais e pelo canvas WebGL somente após navegar, sem `sleep` fixo nem ignorar erros.
- Ajustar o orçamento total dos testes para acomodar o carregamento CI; manter as verificações originais do dossiê PDF/Excel, persistência, preparação, 3D, bloqueios e logs de página.
- Atualizar em `validation/integration-general/audit.py` os dois blobs de testes revisados: a verificação de evidência histórica continua obrigatória para os demais arquivos.

| Arquivo revisado | Blob histórico | Blob revisado |
| --- | --- | --- |
| `tests/e2e/preproduction.spec.ts` | `5a52162de18fb0a6c3efd4d01aa9c5d1d690b2be` | `bea52d32ea889d8e1b2f1ed11da7457c7f3dd5e7` |
| `tests/e2e/spatial-preparation.spec.ts` | `1e78b58ca8c5405c7e66ad71300e3e752d7f8ea4` | `7b363e746d98d4a8374bff56a0a61737d5e5c7bd` |

## Limites de segurança
Nenhum código produtivo, fórmula, quantitativo, preço, carga ou aprovação foi modificado. `computedStructuralApproval=false`, `fabricationRelease=false` e `NOT_READY_BLOCKED` permanecem intactos. CI integral obrigatória antes de merge; esta mudança não comprova dimensionamento conforme norma.

## Execução 44796320130 · abertura do Studio

Nos traces a ação Análise começou em /projetos/novo e a asserção de totais começou em /. As respostas da rota levaram 90 e 89 ms. Os snapshots posteriores ao prazo já continham o menu e os totais de 123 peças e 201 m². Em Chromium, reter a requisição da rota até o prazo original reproduziu as duas falhas. Liberar a mesma requisição permitiu clicar em Análise e conferir os dois totais.

Os cenários de criação rápida e abertura dos exemplos agora usam openProjectStudio. O helper clica no botão da interface, aguarda o endereço do projeto com o fluxo, etapa e vista esperados e verifica a visibilidade da navegação do Studio. Os limites desta transição seguem os já usados nos testes de preparação e pré-produção. Cada cenário continua verificando seu próprio resultado.

| Teste protegido | Blob em c1b4fba | Blob revisado |
| --- | --- | --- |
| `tests/e2e/coldformed-design.spec.ts` | `6f3cdefe76d0c086c98e3aef674371c63c00dd52` | `71214405252d69fa2ceea59fea747343fcdcf500` |
| `tests/e2e/connections.spec.ts` | `4d349752250b46ce2406edfb25d0fdd8f88dabb7` | `88079d8f1f894607f22d76eebaa47825dad7de37` |
| `tests/e2e/loaded-mixed.spec.ts` | `1ba5e3a0f1bfdadda560ed862e7e3c4e05b5393c` | `d995faee75659bd99b178420eedcf3f65f0f9b33` |
| `tests/e2e/mixed-local.spec.ts` | `0ae03da7e799ee6e558379fb8d6db7fd65bc0983` | `7058934bb8f937845efce580daba3ac1bc2a84c5` |
| `tests/e2e/planning.spec.ts` | `42b0e9a79de1f9d4b07b20a2a3c564c8aca5ea23` | `ce120ffad120ffff7e8c5da21e15914f92d25c52` |
| `tests/e2e/platform.spec.ts` | `fdba218571b7e2da818bb4e0af6bd2f173e94587` | `0b57125a287146f29fd942e2ba54dd7c8aa45ede` |
| `tests/e2e/preproduction.spec.ts` | `bea52d32ea889d8e1b2f1ed11da7457c7f3dd5e7` | `80ee16ee82a14852d2eff8a612ddb9c17812380c` |
| `tests/e2e/presentation-3d.spec.ts` | `a74f874614f2da6b8cf2c5b815c585391ec72cea` | `8f42678f4e27d884ddce3aa2ad3eb9bec10c2a14` |
| `tests/e2e/profiles-3d.spec.ts` | `9cbfae46ab36298c65ffcd935b04e344e5f4b519` | `ebeb1cc6882bf7ab8f8914d1a142b49e0b6e8a8c` |
| `tests/e2e/quick-project-guided.spec.ts` | `e2eab98a19c53025b1075d0df0400be9bf6bb4e8` | `c5b43eca8ea660201ac89369889af4671fb89070` |
| `tests/e2e/quick-project.spec.ts` | `f780563e546b4e71f5f5b026e5b49288e74a7771` | `61d7d3ea551d9f967c97e3f173554c165b258dc1` |
| `tests/e2e/resistance-report.spec.ts` | `739671bb950986b761173bad7f73f60f5f113520` | `6cf07eed0a4a8d8e77dfbf6c19884d61ba3b8866` |
| `tests/e2e/result-workspace.spec.ts` | `e7dfc14ec6db7bd4225c8e0d4a5f8d55330451d5` | `53c92c662d9273eeca5ea3bf531a99ee076421ca` |
| `tests/e2e/roof-load-path.spec.ts` | `261d57541fe662db22245194ea0b034f292dc52d` | `ae4a9bb2294e1d66c42bef4503dd5a75b6c28206` |
| `tests/e2e/showcase.spec.ts` | `a2f08bbb7ec24d6d1c424ce73b2649d54bda84a4` | `ea17dce3954e53e619520bd5df423ef33dfa2c81` |
| `tests/e2e/spatial-adapter.spec.ts` | `ef9587b274f42e22ef546bd775bd86e9ef21ebe3` | `06cabe98b05a278dff73d863a239a8bb3e0bf3dd` |
| `tests/e2e/spatial-analysis.spec.ts` | `68f2843c570444ae00af87b82c5fb7997e935e17` | `bf2ab4952b0b4e01faeec9398aa22a51c75b749f` |
| `tests/e2e/spatial-coordination.spec.ts` | `7d18f889b1f769a8b1cfd07a194ffd0f8c1c9dbd` | `599c01c83862e4543c7d5d469f36de457fbd97e8` |
| `tests/e2e/spatial-preparation.spec.ts` | `7b363e746d98d4a8374bff56a0a61737d5e5c7bd` | `e8daebdcdfcfbc05b400334a910da4d8df330241` |
| `tests/e2e/ux-actions.spec.ts` | `1f4e72cafb6b27a4aadf34545d9fb17e6d1210b6` | `0e189b8fad155f3878ac6009ef0e079bd1c0fecd` |
| `tests/e2e/wind-load-path.spec.ts` | `408987cbea1a72e0785741b80bafa413e98c0a2d` | `ea76d21213eb959c2407e27dea4b240e44185751` |
