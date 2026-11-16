# INT-1f — Studio 3D no fluxo da análise mista

## O que entrou
- `mixed-analysis-workspace.tsx`: obras com `physicalStructure` agora abrem no **Studio 3D** (`Structure3D`) com seleção de peça e de nó
  preservadas; a **Vista simples** (`PhysicalLineView`) continua como opção ("Studio 3D" / "Vista simples").
- `src/domain/studio-result-layers.ts` (puro, testado): modelo físico → modelo do Studio (sem perfil, massa ou cobertura inventados) e
  camadas sobre o resultado `/3` (ou `/2`): deformada, deslocamento, momento fletor, cortante, axial, reações e verificação (utilização
  da matriz NBR 8800 da mesma combinação).
- Toda camada passa por `reviewResultOverlay`/`acceptOverlay` antes de qualquer desenho: hash de entrada (`input_sha256`) = hash da
  entrada preparada atual, hash do resultado, combinação, motor e unidade. Falha = camada recusada com o código (`OVERLAY_STALE` etc.),
  nada é desenhado (`studio-layer-refused`). A legenda sempre diz "Imagem de resultados, não é aprovação estrutural".
- Deformada: eixos deformados (laranja) sobre o modelo; fator de escala automático (8% do vão) ou informado.
- `computedStructuralApproval=false` e `fabricationRelease=false` mantidos; as camadas não declaram aprovação.

## `studio-next.spec.ts:23` — instabilidade (causa documentada, sem skip)
Evidência:
- A falha é sempre na primeira asserção do ciclo: `data-environment` esperado `procedural`, recebido `pending`, em 5 s, com o canvas
  já renderizando (`data-draw-calls=12`, `data-mode="profiles"`). As asserções de vazamento (`isContextLost()` após desmontar,
  `isConnected=false`) nunca chegam a ser avaliadas nas execuções que falham.
- O ambiente procedural é gerado após um timer de 60 ms por `stage.loadEnvironment()` (PMREM, síncrono na GPU/CPU do contexto).
  Em WebGL por software (runner Linux do CI) isso pode passar de 5 s, o timeout padrão do `expect`.
- Passou no CI da main `545be76`; passou local na main e em main + #105 (várias execuções); falhou de forma intermitente em PRs
  diferentes com o mesmo sintoma, inclusive em PRs que não tocam 3D (#106). `quick-project.spec.ts:5` tem o mesmo padrão
  (canvas ainda não montado após `reload`, 5 s).
- Conclusão: limite de tempo no CI, não vazamento de contexto. Correção sugerida, fora desta PR: dar ao `expect` do ambiente
  procedural um timeout próprio (p. ex. 30 s) nos dois specs, sem skip e sem afrouxar a checagem de `isContextLost`.

## Testes
- `src/domain/studio-result-layers.test.ts` (camadas, recusa por hash, deformada, rampa).
- E2E `tests/e2e/journey-galpao.spec.ts` termina mostrando a deformada no Studio (390 px e 1440 px) e a camada de verificação.
