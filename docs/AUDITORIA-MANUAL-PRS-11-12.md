# Auditoria manual final — PRs #11 e #12

**Veredito: APROVADO COM RESSALVAS para integração do escopo experimental documentado, após as correções pequenas desta auditoria.** Não é aprovação de segurança estrutural, dimensionamento comercial, modelos mistos ou fabricação. Não foi feito merge.

Data: 31/10/2026. Auditor: Codex, com revisão crítica do código e execução local. Esta é uma nova rodada de validação; os números abaixo não foram simplesmente copiados da entrega anterior.

## Identidade e método

- Repositório `brunoJuniorBrz/JPN`; branch auditada `feat/geometric-physical-adapter`.
- Commit inicial do PR #12: `e6b2b8d84c5ab115ccfe2188330361b8128520b1`, incluindo o trabalho do #11 em `74e223da0521ad1104fc578103d51487f8e94df1`. Ambos estavam abertos na conferência. Main observada: `d982ee408125e394e737007c4ccd17d2606187b1`.
- A cópia isolada existente `.tools/adapter-worktree` foi conferida contra os blobs do commit remoto: 224 arquivos do manifesto local e os dois assets em `public`, sem divergências. `next-env.d.ts` gerado não integra esse manifesto.
- Ambiente já configurado: Windows 10, Node 24.13.0, Python 3.12.10, PyNiteFEA 3.2.1, NumPy 2.5.4 e SciPy 1.18.1. `pip check` não encontrou dependências quebradas. O pacote Python editável aponta para o engine desta cópia, não para outra versão do projeto.
- Comandos `pnpm` executados por `corepack pnpm` 12.15.0, usando os scripts existentes. `JPN_PYTHON_EXECUTABLE` aponta ao Python portátil configurado. BLAS limitado com `OPENBLAS_NUM_THREADS=1`, `OMP_NUM_THREADS=1` e `MKL_NUM_THREADS=1`.
- Revisão direcionada → testes adversariais → correções mínimas → testes direcionados → uma rodada completa das suítes. DXF verificado antes de Playwright limpar `test-results`; build executado depois dos testes de navegador.
- Nenhuma consulta ou investigação do GitHub Actions, faturamento ou runners foi realizada nesta auditoria.

## Achados por gravidade

| ID | Gravidade | Problema reproduzido / impacto | Situação |
| --- | --- | --- | --- |
| M1 | Média, defesa de fronteira | `inspectConnectivity` não validava `model.units` em runtime. Um chamador que violasse o tipo TypeScript poderia fornecer metros como se fossem mm. O caminho normal do gerador fornece mm, portanto não se constatou esse erro nos projetos gerados. | **Corrigido:** recusa qualquer unidade diferente de `mm`, sem conversão implícita. Teste novo passou de falha a aprovação. |
| M2 | Média, integridade geométrica | `lengthMm=NaN` ou `+Infinity` escapava da comparação de conservação: a comparação com NaN é falsa e, para +Infinity, ambos os lados podiam ser infinitos. O gerador normal não produziu esses valores, mas a fronteira exportada do adaptador aceitava metadados corrompidos. `−Infinity` já era recusado mais adiante, com diagnóstico diferente. | **Corrigido:** comprimento original precisa ser finito e positivo antes da inspeção. Três testes novos cobrem NaN e os dois infinitos. |
| B1 | Baixa, comunicação | O roteiro/handoff conservador do #11 continua bloqueado e conserva textos históricos sobre adaptador futuro e limites 100/200. O novo caminho integrado, em Conferência, usa validação e exportação próprias. | **Ressalva mantida:** não causa liberação indevida, mas pode confundir. Não foi redesenhado ou alterado o contrato do handoff nesta auditoria. |
| B2 | Baixa, manutenção | Dois avisos de lint preexistentes: `baseNodeIds` não utilizado em `spatial-preparation-panel.tsx:11`; dependência `envelope` no effect de `structure-3d.tsx:154`. | **Ressalva mantida:** zero erros de lint; testes de geometria, Acabado e navegação passaram. Não se atribui a esta auditoria correção desses avisos. |

Nenhum achado alto/crítico permaneceu nos caminhos e casos auditados. As correções de produção limitam-se às duas verificações de entrada em `spatial-connectivity.ts`. Não foram alterados os contratos, o algoritmo do solver, as propriedades dos exemplos, a geração geométrica ou a interface. As demais mudanças são testes e evidências.

### Falhas registradas, sem omissão

Os testes adversariais adicionados tiveram **4 falhas em 13 testes** antes da correção: NaN, +Infinity, unidade incorreta e o diagnóstico esperado para −Infinity. Não foram falhas da suíte preexistente. Após corrigir as duas causas, **13/13** passaram. Os relatórios `targeted-red.json` e `targeted-green.json` estão preservados; nenhum teste foi removido ou marcado como skip. A suíte completa final passou.

## Auditoria do modelo físico

| Item | Verificação e conclusão |
| --- | --- |
| Continuidade | Os cortes são ordenados no sentido original. Liberações só são aplicadas nos extremos originais; não aparecem rótulas internas por segmentação. Além do balanço analítico, uma subdivisão adicional da cobertura preservou a resposta. |
| Geometria e IDs | Nós originais preservados, coordenadas não arredondadas; sem nós ou ligações inventados. Segmentos `ID:S1`, `ID:S2` mantêm `originalId`, extremos, t0/t1 e comprimento. Conservação de comprimentos, colisões de IDs, cortes pequenos e decisões órfãs/duplicadas foram testados. |
| Contatos | Todas as juntas exigem declaração com lista exata de peças e assinatura atual. Contatos independentes, cruzamentos sem nó original, sobreposição colinear, nós coincidentes com IDs distintos e componentes desconectados são recusados. Teste de linhas quase paralelas também passou. |
| Liberações | `rigid` conserva os seis graus; `pinned` libera as três rotações locais no extremo declarado. Duas extremidades esféricas e elementos axiais/mistos continuam bloqueados pelo adaptador. Uma liberação que cria mecanismo foi recusada pelo solver, sem rigidez artificial. |
| Apoios | Valores vêm de seis declarações explícitas por apoio; pendente não vira livre. Apoios duplicados são recusados. Base sem declaração bloqueia a preparação. Todos os apoios ausentes, translações insuficientemente restringidas e rotações de corpo rígido foram recusados como `UNSTABLE`. |
| Propriedades | E/G/ν e A/Iy/Iz/J vêm das declarações físicas com fonte/revisão. Não são inferidos dos perfis 3D. Relação isótropa E=2G(1+ν) e limites finitos são validados. |
| Unidades | mm→m, GPa→Pa, cm²→m², cm⁴→m⁴, kN→N e kN·m→N·m são explícitos; hash e referências numéricas cruzam TypeScript/Python. A nova validação da unidade protege o limite de entrada geométrica. |
| Cargas e combinações | Componentes em branco, nós/casos órfãos e fatores pendentes não são completados. Casos/combinações e fontes são rastreados; não há peso próprio ou vento automático. Proporcionalidade e inversão de sinais passaram. |
| Resultados obsoletos | Revisão inclui geometria e toda a preparação. Respostas são verificadas por hash, projeto, combinações e IDs. Testes cobrem alteração de cargas, geometria, liberações e revisão de conectividade; respostas obsoletas não ficam publicadas nos cenários exercitados. |
| Limites | 250 nós/600 membros no contrato SI; até 1500 graus livres na resposta. Entrada 500 kB, saída 2 MB, prazo de solver 20 s e concorrência 2 permanecem. Testes de timeout/limite de stdout usam workers controlados; o caso real 132/243 foi medido. |

## Validação matemática independente

### Balanço segmentado

Barra A→B com L=4 m, nó C em a=2 m, ramificação livre C→D de 1 m, apenas A engastado. Carga Fz=−1000 N em C; EI=200e9·8e−5=16e6 N·m². O trecho C→B e a ramificação sem carga não devem criar rigidez adicional ao nó C.

Pela integração de Euler–Bernoulli e estática, sem consultar matriz ou resultados de PyNite:

```
uC = F a³ / (3 EI)
uB = F a² (3L−a) / (6 EI)
θy(C) = θy(B) = −F a² / (2 EI)
RAz = −F; MAy = F a
Vz(x) = F; My(x) = −F(a−x), 0≤x≤a
```

| Grandeza | Referência | Calculado | Erro absoluto |
| --- | ---: | ---: | ---: |
| uZ(C), m | −1,6666666666666663e−4 | −1,6666666666666670e−4 | 5,42e−20 |
| uZ(B), m | −4,166666666666666e−4 | −4,166666666666668e−4 | 2,17e−19 |
| θY(C), rad | +1,25e−4 | +1,2500000000000003e−4 | 5,42e−20 |
| θY(B), rad | +1,25e−4 | +1,2500000000000006e−4 | 8,13e−20 |
| RZ(A), N | +1000 | +1000 | 0 |
| MY(A), N·m | −2000 | −2000,0000000000007 | 6,82e−13 |

Nas cinco estações de A→C, Vz=−1000 N e My=2000, 1500, 1000, 500 e aproximadamente zero N·m. N, Vy, T e Mz são nulos dentro de 1e−7 nas unidades SI correspondentes. Os trechos sem carga têm norma das ações nas extremidades menor que 1e−6. Apoio engastado tem seis movimentos nulos. Os testes repetem a referência com força de sinal oposto; tolerância relativa 1e−10. Os testes de equilíbrio somam forças e momentos globais independentemente da rotina do solver.

### Cobertura gerada 10 × 20 m

Confirmados **132 nós, 207 peças originais e 243 segmentos**, sem criação de novos nós no adaptador. O arquivo SI gerado e o mapa são comparados ao resultado TypeScript atual pelos testes, evitando validar apenas uma fixture desconectada do código.

Exemplo **sintético de pórticos rígidos**, inclusive nas peças visualmente diagonais: 12 engastes de seis graus; E=200 GPa, ν=0,3, G=E/2,6; A=100 cm², Iy=Iz=8000 cm⁴, J=16000 cm⁴, giro zero. Força no nó N11: (200, 300, −1000) N; momentos nulos; combinação TESTE-1 com fator 1. A altura de entrada é 4 m e a inclinação de 10% leva a cumeeira a Z=4,5 m. Não é uma treliça comercial dimensionada.

- Resíduo relativo de equilíbrio: **9,69766e−14**; componentes residuais de força até 2,26e−10 N e de momento até 1,43e−9 N·m.
- Deslocamento máximo: **0,0237006 mm**; 720 graus livres; condição escalada **26131,81196**.
- Multiplicação de todas as cargas por −2 reproduz respostas elásticas proporcionais; retirar os apoios resulta em `UNSTABLE`.
- Verificação adicional: subdividir uma barra contínua da cobertura em duas, com nó intermediário explicitamente introduzido somente no experimento de auditoria (133 nós/244 segmentos), altera deslocamentos em no máximo **8,17e−19 m**, rotações em 9,28e−20 rad, forças em 1,12e−11 N e momentos em 6,87e−12 N·m. Não apareceu rótula artificial.
- A cobertura rápida sem declarações continua bloqueada; carregar o exemplo separado não altera as hipóteses da obra.

## Comandos e resultados locais

Todos os comandos abaixo concluíram com exit code 0 na rodada final. A tabela não soma testes duplicados entre a suíte completa e as execuções direcionadas.

| Comando | Resultado | Aprovados | Falhas finais | Observações |
| --- | --- | ---: | ---: | --- |
| `python engine/validate.py --output-dir ../audit-python` | PASSOU | 1277 testes + 1000 comparações 2D | 0 | Sem erros/skips; inclui benchmarks espaciais anteriores; pytest em 29,00 s. |
| `python -m pytest engine/tests/test_spatial_adapter.py -q` | PASSOU | 6 | 0 | Ambos os sinais, estações com sinal, rotações, apoios insuficientes, mecanismo e cobertura. |
| `pnpm exec vitest run src/domain/spatial-connectivity.test.ts` | PASSOU | 13 | 0 | Depois das correções; antes delas foram 4 falhas registradas. |
| `pnpm typecheck` | PASSOU | — | 0 | TypeScript sem erros. |
| `pnpm lint` | PASSOU COM AVISOS | — | 0 erros | Dois avisos preexistentes, listados nos achados. |
| `pnpm test` | PASSOU | 152 | 0 | Sem testes pendentes/skips. |
| `python tests/verify_dxf.py` | PASSOU | 130 linhas 3D verificadas | 0 | ezdxf 1.4.5; unidades mm; nenhuma falha de auditoria. |
| `pnpm test:e2e` | PASSOU | 52 | 0 | Chromium, sem skips ou flakiness; 165,64 s; inclui 375 e 1440 px. |
| `pnpm build` | PASSOU | — | 0 | Next.js 16.4.3; geração das nove páginas e rotas concluída. |
| `python engine/benchmark_adapter.py` | PASSOU | Caso 132/243 | 0 | BLAS=1; 7,36 s com tracemalloc; pico rastreado 44.338.261 bytes; RSS 130.945.024 bytes. |
| `python docs/validation/2026-10-31-manual-audit/check_math.py` | PASSOU | Balanço + subdivisão da cobertura | 0 | Referência analítica e invariância por subdivisão; valores brutos em JSON. |
| `python -m pip check` | PASSOU | Dependências instaladas | 0 | Nenhum requisito quebrado. |

Benchmark: entrada compacta de 74.518 bytes, saída de 370.057 bytes. Hash da entrada: `5af145e8720e2c4cbd10662e8d796e4de08c0644bacb6c6aa79672ee5f92e156`. O tempo medido é inferior aos 20 s do transporte, sem ampliar o prazo. O teste desse prazo usa relógio controlado e interrupção de worker; não se esperou deliberadamente um worker real travado por 20 s.

## Regressões verificadas

| Área | Evidência executada nesta rodada |
| --- | --- |
| Estruturas e Perfis 3D | `quick-project`, `profiles-3d`, `planning` e testes de geometria/seleção/persistência; fallback sem WebGL incluído. |
| Acabado | `presentation-3d`: modos, telha/paredes, assets glTF, exportação PNG, mesmas quantidades e planejamento. |
| Quantitativos e orçamento | `app`, `platform`, `showcase` e cálculos unitários; itens manuais e vinculados preservados. |
| DXF | Reabertura/auditoria ezdxf após geração no Vitest; downloads nos testes de plataforma. |
| PDF e planilhas | Downloads no navegador; PDF reaberto com extração de texto/valores e exclusão de dados internos; XLSX reaberto com verificação de células e valores pelos testes unitários. |
| Persistência e backups | Reloads, backup v2/v4, migração, prevenção de corrupção e bloqueio quando storage falha; conectividade persistida sem modificar outras hipóteses. |
| Motor 2D | Suíte Python e campanha de 1000 casos, referência independente existente, equilíbrio e análise real/invalidação no navegador. |
| Mobile/desktop | Fluxos de 375 e 1440 px; testes adicionais em outras larguras existentes; ausência de overflow e erros JavaScript nos cenários exercitados. Screenshots dos resultados em 375/1440 px também foram inspecionadas. |

Os relatórios completos e checksums desta rodada ficam em `docs/validation/2026-10-31-manual-audit/`. Os logs preservam a saída do PowerShell: as linhas de script que pnpm envia a stderr podem aparecer formatadas como `NativeCommandError`, inclusive com exit code 0. Isso não foi contado como falha de TypeScript/lint; os códigos de saída e diagnósticos reais estão registrados separadamente.

## Limitações e ressalvas para decisão de integração

1. Auditoria local em **Windows/Chromium**. Não foi comprovada execução em Linux, Safari, Firefox, telefone físico, ambiente publicado ou serviço remoto. Ausência da CI remota registrada como limitação, sem investigação externa nesta rodada.
2. A aprovação cobre o **núcleo experimental de pórticos explícitos**, com os bloqueios mantidos. Não cobre elementos axiais/mistos, partições de contatos independentes, excentricidades, duas extremidades esféricas por membro ou criação automática de nós em cruzamentos.
3. O caso real 132/243 e sua subdivisão 133/244 foram medidos; não foi feito ensaio de todas as topologias no teto 250/600 ou garantia de desempenho para outros hardwares. Limites e recusa por condicionamento, tempo e bytes permanecem ativos.
4. Equilíbrio e proporcionalidade não são referência analítica completa da cobertura redundante. A referência direta independente cobre o balanço; os benchmarks anteriores incluem método das forças/Castigliano. Nenhuma conclusão de resistência ou conformidade ABNT foi produzida.
5. Os testes de exportação verificam estrutura e conteúdo dos arquivos; não foi feita revisão visual página a página de todos os PDFs possíveis. Tampouco se simulou merge ou publicação. Os PRs continuam separados da main; o #12 depende do #11.

**Conclusão para revisão final do ChatGPT:** APROVADO COM RESSALVAS para integrar o escopo experimental auditado com as correções M1/M2, preservando todos os bloqueios e a identificação de hipóteses sintéticas. Não há falha local final de testes. As ressalvas abertas e os avisos estão expressamente listados; não equivalem a aprovar uma estrutura real. Nenhum merge foi executado.
