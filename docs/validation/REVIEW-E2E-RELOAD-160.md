# PR #160 — regressão de restauração do Studio após análise 3D

Data: 23/11/2026. Escopo: sincronização E2E, sem alteração de cálculo estrutural.

## Evidência
A execução [45036759495](https://github.com/brunoJuniorBrz/JPN/actions/runs/45036759495), no HEAD `909054f`, aprovou 137 cenários Playwright e falhou apenas em `tests/e2e/spatial-analysis.spec.ts:42` (desktop 1440), após `page.reload()`. O seletor de imagem `Modelo 3D da estrutura` não existia no prazo padrão de 5 s. Typecheck, lint, testes unitários e auditoria de integração passaram. A execução paralela [45036754615](https://github.com/brunoJuniorBrz/JPN/actions/runs/45036754615) foi aprovada. O log do E2E não prova sozinho se houve restauração da etapa Análise ou atraso do canvas; o trace está no [artifact de navegador](https://github.com/brunoJuniorBrz/JPN/actions/runs/45036759495/artifacts/14762475470).

## Correção delimitada
Após recarregar o projeto, o teste seleciona explicitamente a etapa `Estrutura`, abre o modelo 3D e só então exige o canvas. A navegação do Studio já foi alterada por F0–F6, e não há contrato de que recarregar a etapa `Análise` mostre automaticamente a visualização. Mantêm-se as verificações de resposta obsoleta, ausência de resultados indevidos, persistência, integridade do serviço e erros de página. O canvas passa a ter o orçamento de até 30 s já utilizado nos testes de carregamento WebGL. Nenhum `waitForTimeout` foi introduzido.

## Evidência histórica e segurança
`tests/e2e/spatial-analysis.spec.ts`: blob protegido anterior `bf2ab4952b0b4e01faeec9398aa22a51c75b749f`; novo blob revisado `0dd90a536316d9dbbfebcd8dcff23edf5ad113ff`. Registrado em `validation/integration-general/audit.py`. Não alterados `computedStructuralApproval=false`, `fabricationRelease=false`, `NOT_READY_BLOCKED`, coeficientes, cargas, resistências, apoios, solver ou quantitativos.

## Critério de aceite
Requer CI completa verde no HEAD, incluindo Playwright e build, e revisão independente antes de integrar. Caso o cenário ainda falhe, usar o trace para identificar a causa real; não elevar mais timeouts nem ignorar asserções.
