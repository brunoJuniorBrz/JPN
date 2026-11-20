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
