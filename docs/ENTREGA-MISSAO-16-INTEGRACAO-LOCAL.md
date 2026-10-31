# Missão 16 — integração estrutural mista local

## Entrega e escopo

A fatia vertical integra geometria paramétrica JPN, declarações físicas, adaptador misto, processo Python real e seleção de resultados por peça no visualizador existente. O exemplo abre pela interface, permite conferir/editar propriedades, apoios, ligações, cargas e combinações, executa Python 3.12/PyNiteFEA 3.2.1 e exporta entradas, resultados e mapeamento. Não exige editar JSON.

Base controlada: PR #15, `2b89890b41d298f435cfb4f4d3e8e2b2a4b8c6a1`. Proteção matemática separada: PR [#16](https://github.com/brunoJuniorBrz/JPN/pull/16), `814d8524b1f7924e30f00dccd6b97a843970a969`, branch `fix/frame3d-local-basis-guard`. A integração `feat/mixed3d-local-workflow` parte desse commit e deve ser revisada sobre essa branch. Ordem de revisão: #15 → #16 → integração local. Nenhum merge ou deploy foi realizado. O PR #13 não integra esta árvore.

Desenvolvimento em checkout isolado `.tools/mission16-worktree`, preservando arquivos do diretório de trabalho original. Python 3.12.10, NumPy 2.5.4, SciPy 1.18.1, PyNiteFEA 3.2.1, pytest 9.2.0, Node 24.13.0 e pnpm 12.15.0 reais. Instalado pacote editable deste checkout; `pip check` sem inconsistências. Resultados numéricos dos testes de integração não são mocks.

## Execução local

Na branch de integração, usar Python 3.12 e Node 24:

```powershell
py -3.12 -m venv .venv
.venv\Scripts\python.exe -m pip install -r engine/requirements-validation.lock
.venv\Scripts\python.exe -m pip install --no-build-isolation --no-deps -e ./engine
.venv\Scripts\python.exe -m pip check
pnpm install --frozen-lockfile
$env:JPN_PYTHON_EXECUTABLE = (Resolve-Path .venv\Scripts\python.exe).Path
pnpm dev:structural
```

Linux: criar `.venv` com `python3.12 -m venv .venv`; substituir o executável por `.venv/bin/python` e exportar `JPN_PYTHON_EXECUTABLE` com caminho absoluto. A implementação Linux usa RLIMIT_AS, mas não foi executada nesta sessão Windows; não se declara homologação Linux.

Abrir **http://127.0.0.1:3000** (Host `localhost` é recusado pelo launcher). Criar/abrir um levantamento, acessar **Análise Estrutural Experimental → Abrir exemplo misto independente**. Conferir as quatro etapas da preparação e a declaração de conectividade. Clicar **Executar análise mista local**. Selecionar peça no 3D ou por ID; escolher seu segmento físico, combinação e nó. Exportar entradas/resultados pelos botões. **Voltar à obra** restaura o escopo real sem copiar hipóteses sintéticas. `JPN_LOCAL_PORT` permite outra porta local.

`pnpm dev`, `pnpm start` e os antigos transportes não habilitam essa execução. `pnpm build` continua sendo build de produção. Sem Python, limite de memória verificável ou launcher correto, o cálculo é bloqueado e o restante do projeto permanece utilizável.

## Contratos e preparação física

`physical-declaration.ts` recebe `elementKind` opcional, sem default; `spatialPreparation` recebe exceções opcionais `memberKinds`. Contratos antigos e versão de backup permanecem preservados. Projetos antigos abrem com tipo físico pendente. Não inferimos tipo a partir de perfil visual, nome da peça ou articulação.

`mixed-adapter.ts` reutiliza a inspeção/discretização existente. A seleção individual de tipo prevalece sobre o grupo. Pórticos exigem E/G/ν/A/Iy/Iz/J, orientação, fontes e revisões; axiais exigem E/A com fontes/revisões, sem propriedades de flexão. Campos legados de flexão podem permanecer nulos em grupo exclusivamente axial. Se uma exceção desse grupo for pórtico, suas propriedades de flexão voltam a ser exigidas. Propriedades isotrópicas contraditórias são recusadas.

Tipo axial exige ambas as extremidades explicitamente axiais. Uma extremidade articulada de pórtico continua sendo pórtico. Axial + ligação rígida/articulada, ou pórtico + ligação axial, é contradição. Liberações originais só passam ao primeiro/último segmento da peça; cortes internos de pórtico não recebem rótulas. Pórtico com rótula esférica nas duas pontas continua bloqueado pelo domínio suportado.

Revisão de conectividade exige fonte e confirmação explícita de todas as juntas enumeradas; não ocorre automaticamente. Contatos independentes, cruzamentos sem nó, sobreposições, componentes desconectados, decisões/IDs obsoletos e comprimentos não conservados são recusados. O adaptador preserva `originalId`, IDs dos segmentos, extremos, intervalos e comprimentos. Novos limites mistos: 150 nós e 320 segmentos, sem relaxar o solver. Conversões: mm→m, GPa→Pa, cm²→m², cm⁴→m⁴, kN→N, kN·m→N·m.

Apoios podem ser declarados por nó; os presets só são aplicados mediante ação explícita às bases. Livres e pendentes permanecem distintos. Restrições rotacionais ou momentos em nós exclusivamente axiais são recusados. Nenhuma rigidez, apoio, carga, peso próprio ou contraventamento é acrescentado para estabilizar a obra.

## Exemplo integrado e caso recusado

`mixedReferenceProject()` é uma cópia independente, em memória, de geometria JPN de duas águas 10 × 20 × 4 m: **132 nós, 207 peças originais, 243 segmentos físicos**, sendo **207 segmentos de pórtico e 36 diagonais axiais**. Montantes verticais são pórticos rígidos por hipótese sintética explícita, não uma tesoura comercial articulada. Doze bases têm seis vínculos declarados. Propriedades sintéticas: E=200 GPa, ν=0,3, G=E/[2(1+ν)], A=100 cm², Iy=Iz=8000 cm⁴, J=16000 cm⁴; giro 0°. Não são propriedades aprovadas para a obra.

Carga nodal sintética TESTE na cumeeira: Fx=0,2 kN, Fy=0,3 kN, Fz=−1 kN, momentos zero; INVERSO tem sinais opostos. TESTE-1 e INVERSO-1 selecionam esses casos com fatores explícitos 1/0. Sem ações presumidas. `engine/examples/mixed-adapted-roof.json` é a saída real do adaptador TypeScript, cuja sincronização é testada contra o fixture.

A hipótese alternativa com **todos** os montantes e diagonais axiais foi efetivamente executada e resultou **UNSTABLE**. Foi preservada em `mixed-incomplete-all-webs-axial.json`, com teste de recusa sem resultado parcial. O exemplo estável é uma hipótese física distinta e declarada, não um reparo silencioso dessa estrutura. A obra criada pela entrada rápida continua bloqueada enquanto incompleta.

Na execução HTTP real registrada, 720 graus livres, condição escalada ≈27255,74 e tempo de solver ≈1,88 s. As duas combinações são verificadas quanto a inversão de translações, rotações, forças, momentos e reações. Identidade, diagnósticos e recurso de memória estão em `validation/mission16-local/http-smoke.json`.

## Isolamento de execução

`scripts/dev-structural.mjs` cria servidor Next de desenvolvimento ligado exclusivamente a **127.0.0.1**, confere socket real, Host e origem/Fetch-Site. A nova rota Node `/api/experimental/mixed3d` exige flag do launcher e `NODE_ENV=development`; em produção responde 403. Não há segredo no navegador nem endpoint misto público. Host/origem estrangeiros retornaram 403 em HTTP real, além dos testes de política da rota.

`local-mixed-runner.ts` cria um processo novo por health/análise, com `-I -X utf8`, arquivo de worker fixo, sem executar conteúdo recebido como código. Limites: entrada 500000 bytes, saída 2000000 bytes, stderr 16000 bytes, 20 s, concorrência 1 por processo Node e BLAS com uma thread. Deadline/cancelamento/excesso de saída matam o processo; a vaga só é liberada após `close`. Sem confirmação em 1,5 s, o executor fica bloqueado até reiniciar. Erro de processo já iniciado não libera a vaga antecipadamente. Testes de lifecycle usam processos simulados para verificar eventos/temporizadores; os cálculos têm testes separados com Python real.

Adicionalmente, testes iniciam um processo Python real com uma tarefa de espera de 60 s, sem simular resultado numérico. O relógio real atingiu o deadline e o subprocesso encerrou aos 20,066 s, antes da liberação da vaga. Outro teste confirmou encerramento por cancelamento. Isso complementa os testes simulados de falha de limpeza/excesso de saída; não é usado como referência matemática.

`engine/local_mixed_worker.py` aplica limite de **768 MiB antes de importar NumPy/SciPy/Pynite**. Windows: Job Object com limite de memória comprometida por processo e kill-on-close, consultado para confirmação. Uma alocação real acima do limite falhou como esperado no teste `--memory-self-test`. Isso não significa limite de RSS. Linux: RLIMIT_AS de espaço de endereçamento, implementado mas não comprovado neste ambiente. Plataforma sem suporte verificável falha fechada. Não expor o launcher por proxy público.

JSON com chaves duplicadas, não finitos, dados inválidos, versão de dependência errada, instabilidade e falha numérica não produz resultado publicável. Entrada e saída são validadas com contratos estritos. A resposta exige hash canônico, projeto/revisão, combinações, IDs/tipos de todos os nós/elementos e rotações ativas coerentes.

## Resultado ligado ao 3D e obsolescência

O visualizador existente recebe somente cores de resultado; buffers de posição, IDs, geometria, quantitativos e modo Acabado normal são preservados. Raycast continua usando IDs originais; o painel encontra somente os segmentos cujo `originalId` corresponde à seleção. Um ID de segmento nunca é confundido com índice de instância. Testes cobrem cores em sólidos/linhas e invariância das matrizes/IDs.

Axial positivo significa tração, negativo compressão. Em pórticos, N=−f_local[0]. Para cargas exclusivamente nodais, estações recuperadas por equilíbrio: Vy=−f[1], Vz=−f[2], T=−f[3], My(x)=−f[4]−x·f[2], Mz(x)=−f[5]+x·f[1]. Sinais de ações nodais e esforços de seção não são intercambiáveis. Axiais não recebem cortantes/momentos fictícios.

Mostramos translações em mm, rotações em rad, reações em kN/kN·m, combinação, condição, equilíbrio global e hipóteses do solver. Nos nós livres, o painel identifica a parcela como resíduo nodal, não apoio. Nós exclusivamente axiais indicam rotações inativas. A verificação de equilíbrio nodal e global ocorre no motor antes de publicar.

Sessão de resultados inclui geometria, projeto, escopo exemplo/obra e declaração física integral. Editar dados invalida a sessão, aborta a consulta e incrementa o ticket da requisição; respostas atrasadas não voltam a aparecer. Revisão/hash mudam também para cargas, combinações, materiais, ligações, apoios e conectividade. O teste navegador retarda a entrega de uma resposta Python real, edita os dados durante o trânsito e exige descarte.

Legenda: azul pórtico; turquesa axial em tração; violeta em compressão; cinza nulo; ocre sinais diferentes entre segmentos; laranja seleção. Nenhuma cor indica segurança. **Deformada gráfica não implementada**; deslocamentos numéricos estão disponíveis. Sem verificação ABNT, flambagem, segunda ordem, fabricação ou escolha automática de perfis.

## Validação e evidências

Referência independente espacial: método das forças/trabalho virtual, sem usar matriz PyNite como oráculo. Máximos absolutos nesta execução: deslocamento 1,4583e−17 m, rotação 1,2496e−17 rad, reação 1,1824e−11 N/N·m, axial 2,2101e−10 N, ações de pórtico 7,7194e−11 N/N·m, energia 5,2320e−15 J. Segundo caso usa equilíbrio de nó e fórmulas independentes de balanço/compatibilidade axial. A suíte herdada cobre liberações, mecanismos, bases degeneradas, sinais, momentos, não coplanaridade e contraste elevado de rigidez, sem tolerâncias relaxadas.

Benchmark herdado reexecutado com BLAS=1: 98 nós, 133 pórticos, 36 axiais; 2,397 s incluindo rastreamento de alocações, pico rastreado 5,69 MB, pico RSS do processo 97,09 MB; equilíbrio relativo 3,73e−15. Não são limites universais de desempenho. Relatório bruto: `validation/mission16-local/mixed-reference-benchmark.json`.

| Comando/ensaio final | Resultado | Testes/falhas e observações |
| --- | --- | --- |
| `python -m pip check` | Aprovado | Dependências reais consistentes |
| `python engine/validate.py --output-dir docs/validation/mission16-local/python` | Aprovado | **1403 testes**, 0 falhas/erros/skips; campanha adicional de **1000 comparações** com PyNite; benchmarks espaciais herdados aprovados; 57,07 s |
| `python -m pytest engine/tests/test_local_mixed_worker.py -q` | Aprovado | 7 testes de subprocessos reais, também incluídos nos 1403; proteção de memória, referência analítica, entrada inválida, exemplo estável/instável |
| `python engine/audit_mixed3d.py` com BLAS=1 | Aprovado | Referências independentes, equilíbrio, energia e benchmark registrados |
| `pnpm typecheck` | Aprovado | 0 erros |
| `pnpm lint` | Aprovado com aviso | 0 erros; 1 warning herdado sobre dependência `envelope` em Structure3D |
| `pnpm test` | Aprovado | **169 testes**, 0 falhas; inclui adaptador, execução real, hashes/IDs, forças invertidas, lifecycle e término efetivo de processo |
| `python tests/verify_dxf.py` | Aprovado | ezdxf 1.4.5, **130 linhas 3D**, mm, 0 erros de auditoria; executado após Vitest, antes de Playwright apagar artefatos temporários |
| `pnpm test:e2e` | Aprovado | **54 testes**, 0 falhas/skips/flaky; 184,22 s na execução final congelada |
| `pnpm build` | Aprovado | Compilação, TypeScript, prerender e rotas concluídos; executado após encerrar o servidor dev |
| HTTP local de desenvolvimento | Aprovado | Health real, cálculo real 132/207/243; listener 127.0.0.1; Host/origem estrangeiros 403 |
| Política de produção (teste de função da rota) | Aprovado | 403 com NODE_ENV=production, mesmo com flags locais ativadas; dev comum sem flag também 403 |
| HTTP do build iniciado em modo produção | Não executado | Revisão automática bloqueou o comando de início local, retornando somente `blocked by policy`; não houve contorno nem deploy. Build e política da rota foram verificados separadamente |
| Linux / Vercel / GitHub Actions | Não comprovado | Ambiente local é Windows; ver limites abaixo e roteiro Vercel |

Comandos Python usaram o executável 3.12.10 configurado; pnpm foi chamado por Corepack. `OPENBLAS_NUM_THREADS=OMP_NUM_THREADS=MKL_NUM_THREADS=1`. Evidências brutas: `validation/mission16-local/{python/,worker-targeted.xml,vitest.json,playwright.json,typecheck.txt,lint.txt,dxf.txt,build.txt,python.txt}`. Capturas 375/1440 px em `viewer-375.png` e `viewer-1440.png`. O PowerShell registra `NativeCommandError` ao redirecionar o cabeçalho do pnpm escrito em stderr; os exit codes finais foram zero e os JSON/JUnit registram explicitamente o resultado real das suítes.

As regressões incluem orçamento/cálculos comerciais, backup/persistência, quantitativos, PDF/XLSX/DXF, criação rápida, Perfis 3D, Acabado, navegação e ambos os motores anteriores. Isso é evidência dos testes existentes, não revisão manual exaustiva de todas as combinações possíveis de obra/dispositivo.

Falhas intermediárias não foram omitidas: primeiro ensaio 0/2 por health BUSY (defeito corrigido); segundo 0/2 porque a seleção ampliada de nós abria N1 sem apoio (ajustada para priorizar apoio declarado, sem criar vínculo); terceiro 0/2 por expectativa de teste incorreta `""` versus opção real `"pending"` ao voltar à obra (teste corrigido, sem modificar dado físico). Primeiro ensaio completo: 53/54, uma falha durante HMR após alterar hooks do componente, que reiniciou o exemplo para a obra. Reteste afetado: 2/2, incluindo resposta real atrasada e descartada. A execução completa final congelada passou 54/54. Arquivos `playwright-initial-*.json`, `playwright-test-pending-expectation.json` e `playwright-hmr-failure.json` preservam as falhas anteriores. Nenhuma falha da CI remota é tratada como aprovação.

## Falhas encontradas e limites

1. **Alta, corrigida separadamente:** frame3d admitia bases locais não ortogonais PyNite 3.2.1. Dois testes adversariais reproduziram a ausência de recusa; proteção equivalente à do motor misto agora rejeita antes da solução. Evidências red/green no PR #16 e `MISSAO-16-PROTECAO-BASES.md`.
2. **Média, corrigida nesta integração:** health de desenvolvimento podia permanecer bloqueado pelo BUSY durante cancelamento/remontagem StrictMode. Retentativa limitada apenas de health aguarda encerramento real, preservando concorrência 1. Há botão de nova verificação; análises nunca são repetidas automaticamente.
3. **Modelo recusado, não corrigido artificialmente:** hipótese com todos os webs axiais é instável. Mantida como fixture negativo. A entrada rápida incompleta também continua bloqueada.
4. **CI remota não comprovada:** run [41241715020](https://github.com/brunoJuniorBrz/JPN/actions/runs/41241715020), revisão do PR #15, falhou em cerca de 3 s. Jobs Windows/Linux/application falharam sem etapas; `steps=[]` confirmado pela API. Consultar check-runs/anotações retornou 403 `Resource not accessible by integration`. Não existe log de teste executado nesse run; a causa não pode ser atribuída com evidência a código, runner ou faturamento. Não foram alterados billing/runners nem disparadas tentativas repetitivas.
5. **Pendências explícitas:** homologação Linux/Vercel, deformada gráfica, contatos independentes, rótulas esféricas nas duas pontas, limites superiores aos admitidos e dimensionamento resistente. Roteiro remoto em `VALIDACAO-VERCEL-PENDENTE.md`.

**Veredito: APROVADO COM RESSALVAS para uso experimental local no Windows e revisão dos PRs empilhados.** A fatia vertical foi executada de ponta a ponta com Python real e resultados associados aos elementos 3D. Linux, Vercel e HTTP do build em produção não foram comprovados; deformada e domínio físico não suportado permanecem pendentes. Não há aprovação normativa nem liberação de estruturas reais. O veredito limita-se à funcionalidade e aos ambientes/ensaios efetivamente executados.
