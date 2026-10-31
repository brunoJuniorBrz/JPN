# Adaptador geométrico-físico experimental — entrega incremental

Data: 31/10/2026. Base: `feat/spatial-integration-handoff`, commit `74e223da0521ad1104fc578103d51487f8e94df1` (PR #11 aberto na auditoria). Branch: `feat/geometric-physical-adapter`. Não houve merge ou alteração direta da main.

## Escopo entregue

Núcleo funcional para geometria JPN com **elementos de pórtico explicitamente declarados**, segmentação em nós originais interiores, conexões revisadas, propriedades físicas rastreáveis, apoios e cargas nodais. A execução utiliza o endpoint e o solver PyNiteFEA 3.2.1 existentes. O algoritmo de elementos finitos não foi reimplementado.

Esta é uma entrega parcial da missão mais ampla: **elementos axiais/treliças e modelos mistos permanecem bloqueados**. Não se convertem diagonais articuladas em pórticos para obter resultados. O exemplo declara deliberadamente todas as peças como pórticos rígidos sintéticos; não representa dimensionamento de uma cobertura comercial ou uma tesoura articulada real.

Entrada rápida, gerador e IDs visuais, Perfis 3D, Acabado, quantitativos, DXF/PDF, solver 2D e núcleo numérico do solver 3D foram preservados. Somente os limites de tamanho do contrato espacial existente foram ampliados. Nenhum perfil provisório ou projeto existente recebe propriedades ou hipóteses do exemplo.

## Arquitetura e contratos

- `src/domain/spatial-connectivity.ts`: inspeção e discretização determinísticas, sem dependência de interface ou solver. Declaração estrita `connectivity.version=1`; mapa `jpn.geometry-physical-map/1`, coordenadas em mm.
- `src/domain/geometric-physical-adapter.ts`: valida preparação persistida, resolve propriedades por grupo e liberações individuais, converte unidades e produz `jpn.spatial-adapter/1` contendo solicitação `jpn.frame3d/1`, mapa e hashes.
- `workspace.spatialPreparation.connectivity`: campo opcional; projetos sem ele continuam carregando sem migração destrutiva, defaults físicos ou aprovação automática. Backup v4 preserva as decisões. A preparação antiga e o pacote `jpn.spatial-handoff/1` continuam conservadores (`analysis_ready=false`); o novo adaptador tem validação própria e exportação distinta.
- `src/components/planning/spatial-adapter-panel.tsx`: painel dentro de **Preparar análise → 4. Conferência**. Mostra todas as juntas/IDs e cortes necessários; exige fonte e confirmação explícita para conectar todas as juntas exibidas. Permite preparar, revisar, executar e exportar o modelo da obra ou um exemplo separado. Resultados incluem combinações, deslocamentos, rotações, reações, esforços por estação e correspondência segmento → peça original.
- `src/app/api/analysis3d/route.ts` e `spatial-runner.ts`: transporte original reutilizado, com limites de tempo/bytes e verificação de identidade. Não houve novo serviço ou implementação paralela do solver.

`analysis_ready=true` no envelope novo significa elegível para submissão ao solver após validação das declarações e conectividade suportada. Não significa estabilidade já demonstrada, resistência, conformidade normativa ou autorização de fabricação. Instabilidade continua sendo recusada pelo solver sem resultados parciais.

## Conectividade e discretização

1. Validar limites, IDs únicos, coordenadas finitas, extremos, comprimentos e ausência de nós coincidentes com IDs distintos.
2. Projetar cada nó original sobre as peças. Identificar extremidades e encontros no interior usando tolerância geométrica de `1e-4 mm`, sem arredondar coordenadas, criar nós ou fundir IDs.
3. Verificar cruzamentos de segmentos e sobreposições; produtos vetoriais evitam cancelamento numérico no teste de linhas quase paralelas. Cruzamento sem nó original é recusado. Componentes desconectados e nós órfãos são recusados.
4. Exigir decisão rastreável para **cada junta**, inclusive encontros entre extremidades originalmente coincidentes. Exigir a lista exata de peças e assinatura geométrica atual. Ausência, duplicata, referência órfã ou decisão desatualizada bloqueia.
5. `connect` significa nó físico compartilhado, com comportamento das extremidades fornecido pelas declarações. `separate` é reconhecido e bloqueado: partições de nós coincidentes ainda não são suportadas. Nunca se une um contato independente para fazê-lo calcular.
6. Ordenar cortes segundo o sentido original da peça. Peça sem cortes conserva seu ID; peça cortada recebe `ID:S1`, `ID:S2`, etc. O mapa registra `originalId`, nós, parâmetros `t0/t1`, comprimento e quais extremos são originais. Não se truncam IDs nem se admitem colisões. A soma dos comprimentos deve conservar o comprimento original dentro de `1e-6 + L*1e-10 mm`.
7. Cada segmento herda material, seção e giro **físicos declarados**. Extremidades internas de uma peça contínua permanecem contínuas. Liberações aplicam-se apenas às extremidades originais correspondentes. Não se cria uma rótula na posição de uma terça.

Junta compartilhada pode transferir os seis graus conforme as liberações de cada membro. `rigid` mantém os seis; `pinned` libera as três rotações locais naquele extremo, preservando translações. Pórtico com duas extremidades esféricas é bloqueado neste adaptador porque o tratamento do modo torsional livre não foi implementado. `axial` não equivale a esse pórtico e é bloqueado separadamente.

## Integridade, unidades e invalidação

Materiais E/G/ν e seções A/Iy/Iz/J vêm exclusivamente das declarações físicas, com fonte e revisão. O cadastro visual não fornece propriedades resistentes. Campos pendentes não viram zero; cargas nulas precisam ser explicitamente informadas; apoios livres não são apoios ausentes. Apoios duplicados, mesmo combinando uma declaração livre e outra restrita, são rejeitados.

Conversões explícitas: mm → m (`/1000`), GPa → Pa (`*1e9`), cm² → m² (`*1e-4`), cm⁴ → m⁴ (`*1e-8`), kN → N e kN·m → N·m (`*1000`). Global Z é vertical. Eixos locais, ações nas extremidades e sinais de esforços são os do contrato espacial existente e constam da exportação completa.

A revisão SHA-256 inclui assinatura geométrica e **toda a preparação**, incluindo fontes, apoios, liberações, propriedades, cargas, combinações e decisões de conectividade. O hash da solicitação usa a canonicalização numérica IEEE-754 existente, comum a TypeScript/Python. A interface só mostra um resultado cuja identidade corresponda às entradas atuais; alterações ocultam resultados e descartam/abortam respostas em andamento. A resposta precisa corresponder ao hash, projeto, combinações, nós e segmentos enviados. Resultados não são gravados como aprovação no projeto.

## Caso obrigatório 10 × 20 m, entrada de altura 4 m

O gerador atual cria **132 nós e 207 peças**, não exatamente os ~120 nós estimados no handoff. A entrada tem duas águas e inclinação visual de 10%, com cumeeira em Z=4,5 m. Os encontros de terças com banzos exigem **243 segmentos físicos**, conservando os 132 nós e a correspondência com todas as 207 peças originais.

Arquivos reproduzíveis:

- `src/domain/examples/spatial-adapter-example.ts`: construção do exemplo separado, sem aplicação sobre a obra aberta.
- `examples/spatial-adapter-project.json`: projeto com todas as declarações.
- `examples/spatial-adapter-mapping.json`: rastreabilidade completa.
- `engine/examples/spatial-adapted-roof.json`: solicitação SI efetivamente produzida pelo adaptador TypeScript.
- `engine/examples/spatial-adapted-tee.json`: caso segmentado para referência analítica independente.

Hipóteses sintéticas completas da cobertura: todas as peças são pórticos rígidos contínuos, sem excentricidades; 12 bases com seis graus engastados explicitamente; E=200 GPa, ν=0,3 e G=E/[2(1+ν)]; A=100 cm², Iy=Iz=8000 cm⁴, J=16000 cm⁴ e giro físico zero em todos os grupos. Uma força nodal na primeira cumeeira gerada: Fx=0,2 kN, Fy=0,3 kN, Fz=−1 kN, momentos zero; caso `TESTE`, combinação `TESTE-1` com fator 1. Sem peso próprio, vento ou cargas distribuídas automáticos. Fontes identificam valores como sintéticos, sem catálogo comercial aprovado.

Resultado medido em Windows/Python 3.12.10, PyNiteFEA 3.2.1, BLAS com uma thread, com rastreamento de memória ativo:

| Medida | Valor |
| --- | ---: |
| Graus livres | 720 |
| Condição escalada | 26131,81196 |
| Deslocamento máximo | 0,0237006 mm |
| Resíduo relativo de equilíbrio | 9,70e−14 |
| Tempo total do benchmark | 7,27 s |
| Pico Python rastreado | 44.340.870 bytes |
| Pico RSS do processo | 131.014.656 bytes |
| Entrada / saída compactas | 74.518 / 370.057 bytes |

Valores observados, não garantia de tempo em qualquer máquina ou modelo. O hash da entrada e os valores brutos constam de `docs/validation/2026-10-31-spatial-adapter/benchmark.json`.

Os limites operacionais de solicitação passam de 100 nós/200 barras para **250 nós/600 segmentos**, em Zod e Python; resposta aceita até 1500 graus livres. Materiais/seções, casos, cargas e combinações conservam os limites anteriores. O formulário de preparação conserva o teto próprio de 200 registros de apoio. Não foram removidas as barreiras de 500 kB de entrada, 2 MB de saída, 20 s de solver, duas execuções simultâneas, condicionamento, deslocamento ou equilíbrio. O caso 132/243 foi medido; não se afirma capacidade garantida para toda combinação de 250/600.

## Validação matemática independente

`engine/tests/test_spatial_adapter.py` lê as solicitações geradas pelo TypeScript, efetivamente atravessando a fronteira mm/propriedades/cargas → SI → PyNite. A referência analítica não usa matriz ou resultados do solver.

Caso em T: barra original A→B de 4 m, nó C a 2 m, ramificação C→D de 1 m sem carga ou apoio. Somente A é engastado; C recebe Fz=±1000 N. O adaptador produz `BEAM:S1` (A→C), `BEAM:S2` (C→B) e `BRANCH`. A ramificação livre e a extensão sem carga têm esforços nulos. Para EI=200e9·8e−5=16e6 N·m², a=2 m, L=4 m:

```
M(x)=F(a-x), 0≤x≤a; M(x)=0, a<x≤L
uC = F a³/(3 EI)
uB = F a²(3L-a)/(6 EI)
Ry(C)=Ry(B)=−F a²/(2 EI)
RAz=−F; MAy=F a
```

As expressões resultam da integração de Euler–Bernoulli com deslocamento/rotação nulos em A e continuidade em C. Para F=−1000 N: uC=−0,1666667 mm; uB=−0,4166667 mm; Ry=+1,25e−4 rad; RAz=+1000 N; MAy=−2000 N·m. Ambos os sinais são comparados com tolerância relativa `1e-10`; esforços espúrios nas partes sem carga devem ter norma menor que `1e-6` nas unidades SI correspondentes.

Para a cobertura completa: equilíbrio independente de forças e momentos globais (soma de reações+cargas e r×F), tolerâncias absolutas 1e−6 N e 1e−5 N·m; inversão e multiplicação das cargas por −2 reproduzem proporcionalmente deslocamentos, rotações e reações; remoção de todos os apoios resulta em `UNSTABLE`. Equilíbrio e superposição não constituem, isoladamente, referência analítica completa da cobertura; a referência analítica direta cobre o caso segmentado e os testes espaciais anteriores permanecem em execução.

Vitest cobre IDs, sentido invertido, conservação de comprimento, contatos interiores, cruzamentos inclusive quase paralelos, sobreposições, nós coincidentes/órfãos, decisões ausentes/obsoletas/independentes, apoios repetidos, unidades, liberações somente nos extremos originais, backup e invalidação. A cobertura incompleta gerada pela entrada rápida permanece bloqueada por ausência de propriedades, cargas, apoios e ligações.

## Execução e evidências

Baseline da base escolhida: 1271 testes Python; 139 Vitest; 48 Playwright, sem falhas ou skips. Validação final local: **1274 testes Python**, campanha adicional de **1000 comparações** da treliça 2D, **147 Vitest** e **52 Playwright**, sem falhas, skips ou testes instáveis. TypeScript e build Next.js 16.4.3 aprovados. Lint terminou sem erros e com dois avisos preexistentes: import `baseNodeIds` não usado no painel de preparação e dependência `envelope` no hook de `structure-3d.tsx`. DXF auditado por ezdxf: 130 linhas 3D, unidades mm e nenhum erro.

Na primeira execução direcionada de navegador, dois testes de persistência falharam porque o próprio `addInitScript` do teste restaurava a fixture original em todo reload. Corrigido para inicializar somente storage ausente, com asserção de gravação antes de recarregar; os quatro testes direcionados e a suíte completa passaram depois. Nenhuma falha foi marcada como skip ou ignorada. A primeira checagem TypeScript também identificou a ausência de narrowing através de um helper arrow `never`; o helper passou a ser uma declaração de função e as checagens finais passaram.

Relatórios brutos e resumo verificável estão em `docs/validation/2026-10-31-spatial-adapter/`. Screenshots locais são produzidas como `test-results/adapter-results-375.png` e `adapter-results-1440.png`; a imagem de 375 px foi inspecionada visualmente. Os testes também verificam ausência de overflow horizontal e erros JavaScript, preservação dos quantitativos, independência do exemplo, download dos resultados e invalidação após revisão das conexões.

Comandos, usando Node 24 e Python 3.12 com dependências fixadas:

```text
JPN_EXPORT_ADAPTER_FIXTURES=1 pnpm exec vitest run src/domain/spatial-connectivity.test.ts
python -m pytest engine/tests/test_spatial_adapter.py -q
python engine/validate.py --output-dir engine/validation-results
pnpm typecheck
pnpm lint
pnpm test
python tests/verify_dxf.py
pnpm test:e2e
pnpm build
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 MKL_NUM_THREADS=1 python engine/benchmark_adapter.py
```

Em PowerShell use `$env:NOME='valor'` em vez de prefixos POSIX. `JPN_PYTHON_EXECUTABLE` pode apontar ao Python instalado; em Linux a configuração padrão da aplicação usa `.venv/bin/python`. O comando de exportação é exclusivo de testes e atualiza os exemplos versionados; não modifica projetos de usuários.

A matriz Windows/Linux existente de GitHub Actions foi preservada. Os runs da base #11 `41227213454` e `41227190957` falharam antes de executar steps. Isso não constitui aprovação ou falha dos cálculos em Linux. Não houve tentativa de contornar a infraestrutura ou enfraquecer o workflow. O estado dos checks do novo PR deve ser conferido antes de qualquer merge. Não foi executado merge nesta missão.

## Pendências explícitas

- Elementos axiais verdadeiros, coexistência axial/pórtico e tratamento dos modos de rotação sem rigidez: não implementados; bloqueados.
- Partições de uma junta com peças conectadas e outras independentes, nós coincidentes independentes e cruzamentos que exigem criar nós: não implementados; bloqueados.
- Pórticos esféricos nas duas extremidades e excentricidades: não implementados; bloqueados.
- A interface atual registra a confirmação de todas as juntas exibidas em lote. Para casos que não compartilhem todas essas juntas, não confirmar; o núcleo aceita a decisão `separate` persistida e recusa a análise com diagnóstico.
- O roteiro/handoff anterior conserva seus estados conservadores e diagnósticos geométricos brutos. A prontidão e os resultados do novo caminho aparecem exclusivamente no painel integrado e na exportação nova.
- Validação Linux depende da CI disponível; medição de desempenho executada somente no ambiente Windows descrito. Sem garantia para o limite máximo em todo hardware.
- Sem P-Delta, flambagem, cisalhamento, dinâmica, ligações semirrígidas, vento normativo, ações distribuídas, resistência, ABNT, soldas ou fabricação. Nenhum resultado deste PR declara segurança estrutural.

Próxima missão recomendada: elemento axial e modelo misto com casos analíticos independentes, seguindo os bloqueios existentes, antes de aceitar uma cobertura articulada real.
