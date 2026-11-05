# Comandos e resultados reais — 02/11/2026

Ambiente local: Windows 10, Python 3.12.10, Node 24.13.0, pnpm 12.15.0.
Python principal: NumPy 2.5.4, SciPy 1.18.1, PyNiteFEA 3.2.1.
Perfil de seções: sectionproperties 3.10.2. Perfil FSM **em outro intérprete**:
NumPy 2.2.6, SciPy 1.15.3, pycufsm 0.2.0. BLAS/OMP/MKL=1 nos comandos numéricos.
Não foram usados mocks como evidência de execução Python.

| Comando efetivamente executado | Resultado/exit | Aprovados / falhas | Evidência e observação |
|---|---|---|---|
| Vitest baseline direcionada M23–M26 | 0 | 34 / 0 | `baseline.json`; não equivale a baseline completa |
| `python engine/validate.py` | 0 | 1478 / 0; skipped=0 | Execução inicial e final com `--output-dir docs/validation/engine-release/core`; `core/pytest.xml`, `core/validation.json`, `python-terminal.txt` |
| Campanha dentro de validate.py | 0 | 1000 / 0 | Seeds 0–999, referência independente PyNite e equilíbrio; máximos absolutos no JSON |
| `python engine/audit_loading.py` | 0 | Comparações e worker real passaram | `loading-audit.json`: peso/distribuídas, massa e resultantes independentes da cobertura 132/243 |
| `python -m pytest engine/section_tests/test_section_properties.py -q` | 0 | 4 / 0 | `sections-final.xml/txt`; área/I analíticos, J por série, escala e degeneração |
| Python FSM: `-m pytest engine/section_tests/test_elastic_strip.py -q` | 0 | 4 / 0 | `fsm-final.xml/txt`; dois casos originais, worker `-I` com cap real, JSON duplicado e geometria inválida |
| `python -m pytest engine/tests/test_second_order_release_audit.py -q` | 0 final | 5 / 0 final | Inicial: 3 passaram/2 falharam no balanço grosseiro (`pdelta.txt/xml`). Final: convergência e limitação explicitamente verificadas (`pdelta-green.*`) |
| `python -m pip check` principal | 0 | Sem dependência quebrada | Lock anterior preservado; optional sections acrescentado |
| Verificação de dependências FSM | 0 por importlib/packaging | 8 requisitos ativos / 0 conflitos | `fsm-dependencies.txt`; `pip check` não disponível nesse Python embutido sem pip |
| `pnpm test --reporter=json --outputFile=…` | 0 | 355 / 0 | `vitest-full.json`; suíte completa antes dos três testes adicionais |
| Vitest local-section-real + engine-release-gate | 0 | 3 / 0 | `final-additions.json`; API/worker de seção real e gate sem promoção normativa |
| Vitest cad.test.ts + `python tests/verify_dxf.py` | 0 / 0 | 130 linhas DXF 3D verificadas | `dxf-final-verified.txt`; unidades mm e auditoria ezdxf sem erros |
| `pnpm typecheck` | 0 | Sem erro | `typecheck-done.txt`; build também executou TypeScript |
| `pnpm lint` | 0 | Sem erro | `lint-done.txt` |
| `pnpm test:e2e` completo | 0 | 70 / 0 | `e2e-full.txt`; inclui criação rápida, Perfis 3D/Acabado, orçamento, PDF/Excel, backup e motores anteriores |
| Playwright controles finais, dois arquivos | 1 intermediário | 4 passaram / 2 falharam | `e2e-final-controls.txt`: resistência/seção/flecha passaram 375/1440; furação falhou por seletor do formulário |
| Playwright connections.spec.ts após correção de abertura | 1 intermediário | 0 / 2 | `e2e-geometry-fixed.txt`: seletor exato omitia sufixo `(mm)`. Nenhum dado/equação modificado |
| Playwright connections.spec.ts com rótulos corretos | 0 final | 2 / 0 | `e2e-geometry-final.txt`: furo externo recusado, dimensões e áreas conferidas, invalidação/reexecução em 375/1440 |
| `pnpm build` | 0 | Compilou, tipou, gerou rotas | `build.txt`; API nova local presente e bloqueada em produção |
| YAML workflow e JSON Vercel via parser local | 0 | Parse/flags conferidos | `static-config-ok.txt`; perfis sections/fsm e matriz Windows/Linux; branch sem deploy nas duas configurações |
| `python engine/benchmark_release.py` | 0 do monitor | 2 cálculos concluídos / 1 recusa prevista | `benchmark.json`: 150/320/10 retorna `OUTPUT_LIMIT`, não é análise concluída |
| `pnpm exec vitest run --config vitest.release-benchmark.config.ts` | 0 | 1 / 0 | `integrated-benchmark.json`, `benchmark-integrated.txt`; adaptador → worker → relatório da cobertura real gerada, sintética |

A árvore final possui **71 testes Playwright**: após a suíte de 70, o fluxo de
seção/flecha foi ampliado para duas larguras e a furação foi expandida. Todos os
seis casos dos dois arquivos afetados têm execução final aprovada, em quatro
casos no log intermediário e dois no último log. **Não foi repetida a suíte
completa de 71**, nem a suíte Vitest completa de 358; a CI deve verificar o
conjunto final. Os somatórios sobrepostos não são contados como testes distintos.

Outras falhas locais preservadas: rótulos ASCII danificados na primeira execução
UI (`e2e-targeted.txt`, corrigido em `e2e-targeted-fixed.txt`); DXF ausente após
limpeza de test-results pelo Playwright (`dxf.txt`, depois regenerado/verificado).
A tentativa de parser `yaml` inexistente foi substituída pelo `js-yaml` já
instalado; o parse final foi real. Não se modificaram critérios matemáticos para
contornar falhas. Logs PowerShell podem incluir `NativeCommandError` ao capturar
stderr de corepack; o exit code real, os resumos e os JSON/JUnit definem o resultado.

## Reprodução

Instalar `engine/requirements-validation.lock`, engine editável e dependências JS
do lock. Instalar `engine/requirements-sections.lock` no Python principal local;
instalar `engine/requirements-fsm.lock` em outro ambiente Python 3.12. Informar
`JPN_PYTHON_EXECUTABLE` absoluto quando não usar `.venv`. O comando
`pnpm dev:structural` habilita a execução somente em loopback. O perfil de seção
também admite `JPN_SECTION_PYTHON_EXECUTABLE`, apontando para o mesmo perfil numérico
compatível. Não apontar o solver principal para o perfil FSM.

Executar DXF antes do Playwright ou regenerar cad.test.ts depois: Playwright limpa
test-results. Benchmarks devem usar as três variáveis de threads com valor 1.
Os números de memória/tempo dependem do ambiente e não autorizam uma estrutura.

## CI e limites de comprovação

O workflow inclui core Windows/Linux, aplicação Linux e perfis opcionais
sections/fsm Windows/Linux. Não houve execução Linux local. O estado remoto da
publicação deve ser lido do run associado ao SHA final; configuração ou sucesso
da base não significam CI aprovada desta entrega. Registro remoto em `CI.md`.
Não houve teste HTTP online, deploy, benchmark de dois projetos externos completos,
aprovação ABNT ou revisão profissional nesta campanha.
