# M35 — Estruturas declaradas, cargas nativas e quantitativos

## Base e escopo entregue

Base: `main` em `cc516b6f5cc97750de5aecf7564fcaff47a1d4f3`, após o PR #50. Branch: `feat/m35-irregular-structures-loads-takeoff`. Referências comerciais do PR #52, revisão `3fd6106b4ed639157fee1b13bd51bdc7b2cf28dd`, incorporadas sem merge de sua branch. `validation/tom-2026/REPORT.md` e `tom-commercial-source.json` preservam os bytes daquela revisão; seus testes foram ampliados para as capacidades novas.

Implementação funcional de edição por coordenadas, associação de propriedades por peça, cargas uniformes em peças declaradas compatíveis, análise mista real, exportação e levantamento preliminar. Não houve alteração dos kernels Python, contratos de cálculo, tolerâncias, limites ou autenticação. As duas configurações Vercel desabilitam a publicação automática desta branch. Nenhum merge ou deploy foi solicitado.

## Uso e arquitetura

1. Em nova obra/cadastro completo, abrir o editor de estrutura declarada ou importar seu JSON. Informar fonte/revisão, nós XYZ em mm, barras entre nós existentes, função e grupo. Coordenadas negativas são aceitas. Registrar a geometria aplica validação atomicamente.
2. Usar os painéis existentes de preparação para materiais, seções, atribuições por barra, vínculos, conexões, casos e combinações. Dimensões visuais e nomes comerciais não preenchem propriedades resistentes.
3. Cadastrar carga uniforme pelo ID original, kN/m, vetor local/global, caso e referência. A preparação converte unidades e remete as cargas nativas ao motor misto `/2`, incluindo todos os segmentos numéricos daquela peça. A intensidade é preservada, sem repeti-la como carga total por segmento.
4. Executar a análise compatível. Consultar deslocamentos, rotações, reações, esforços e estações internas existentes. A lista de rastreabilidade liga carga, caso, peça original e segmento numérico. Os resultados exportados conservam entrada e hash.
5. Em Materiais, consultar/exportar o levantamento declarado e transferir ao orçamento existente. Salvar/reabrir conserva preparação, geometria, contorno e preços declarados. Modificações invalidam análises e linhas vinculadas obsoletas.

`resolvePhysicalStructure()` continua sendo a fronteira comum. O novo editor não usa `generateStructure()` para criar uma topologia suposta. `adaptLoadedMixedProject()` reutiliza o adaptador geométrico-físico e a implementação nativa auditada de cargas do `mixed3d/2`; não faz cálculo matricial no navegador. `adaptMixedProject()` recusa o caminho `/1` quando ele perderia ações distribuídas.

O contrato misto atual exige ao menos um elemento de pórtico e um axial. Os casos novos respeitam essa condição explicitamente, sem barras, vínculos ou rigidez fictícios. A execução exclusivamente de pórticos pelo mesmo formulário e o roteamento automático entre famílias de solver não foram acrescentados. O `frame3d/2` anterior continua disponível no seu domínio, com suas cargas locais Fy/Fz e testes existentes; não se tornou um contrato global arbitrário nesta entrega.

## Quantitativos e contorno

`declared-takeoff.ts` calcula distâncias euclidianas entre nós em mm e totaliza peças e metros por função, grupo, material e seção. Mantém os IDs originais. Massa exige área física e densidade rastreáveis: `m = A × L × ρ`, com conversão cm²→m². Quando faltam dados, a massa é nula/pendente. Preços por metro exigem valor, fonte e revisão explícitos; não se convertem preços por peça comercial sem comprimento conhecido.

A transferência cria linhas em metros no orçamento existente, preserva linhas manuais, IDs e valores comerciais já editados. `quantityOrigin` conserva IDs, revisão e assinatura. A assinatura de levantamento inclui também grupo, propriedades e metadados comerciais, independentemente da identidade do cálculo matricial. Comprimentos de fabricação e compra permanecem nulos; não há desconto de ligação, plano de corte, estoque ou massa suposta. Campos retangulares remanescentes de projetos declarados não alimentam automaticamente áreas nem contagens comerciais.

`jpn.roof-outline/1` representa um polígono horizontal XY fechado, fonte/revisão e referências explícitas a peças de apoio. Valida orientação exterior anti-horária/furos horários, fechamento, interseções, segmentos nulos, recuos sobre a própria aresta, furos exteriores, tangentes e sobrepostos. A área usa a soma orientada dos polígonos. O editor mostra a projeção, permite recortes e não cria barras. Fixture ilustrativa côncava: **17,5 m² líquidos**, contra **24 m²** do retângulo envolvente; o teste de edição manual usa outra fixture de **18 m²**. Nenhuma é apresentada como geometria conhecida do Tom.

Referenciar peças de apoio não comprova o caminho de transmissão. Cargas de cobertura por área, distribuição de telhas e vento permanecem bloqueados para modelos declarados. A declaração de contorno não certifica associação estrutural nem libera essas ações.

## Referências matemáticas independentes

`declared-loading-real.test.ts` executa `engine/local_mixed_worker.py` com Python 3.12.10, PyNiteFEA 3.2.1 e dependências reais. O worker preserva `-I`, timeout e 768 MiB. Todos os modelos são sintéticos, com E, seções, densidade quando aplicável, vínculos e cargas explícitos.

| Caso | Referência independente e verificações |
|---|---|
| Balanço de dois trechos, L=2 m, q=-100 N/m, E=200 GPa, I₁=10⁻⁶ e I₂=2×10⁻⁶ m⁴ | Trabalho virtual: δ=q/(8E)·[(L⁴−(L−a)⁴)/I₁+(L−a)⁴/I₂] = **−0,00096875 m**; rotação por integração da curvatura; reação vertical 200 N e momento global Y −200 Nm. |
| Viga biapoiada de 2 m, mesmo q e I=10⁻⁶ m⁴ | δmeio=5qL⁴/(384EI)=**−0,0001041666667 m**; reações 100 N, momentos de apoio nulos, cortante de meio de vão nulo e My de meio de vão −50 Nm na convenção do contrato. |
| Uma peça original segmentada em encontro intermediário | Duas cargas nativas de mesma intensidade; resultado igual ao balanço homogêneo δ=qL⁴/(8EI); continuidade sem rótula artificial. |
| Pórtico em L, H=L=1 m, Icoluna=10⁻⁶ e Iviga=2×10⁻⁶ m⁴ | Trabalho virtual com flexão de coluna e viga e encurtamento axial: δz=qL⁴/(8EIviga)+qL³H/(2EIcoluna)+qLH/(EAcoluna). Também δx, rotação, reações e momento de base. Ramo axial explicitamente carregado com 500 N: N=500 N e δ=PL/EA. |
| Elementos inclinados e orientação local | Rotação física de 45° e transformação dos vetores/respostas; equivalência local/global com giro físico de 90° e inércias desiguais. |
| Combinações e segurança | Superposição, resposta dobrada e invertida; hash muda com direção, intensidade ou peça; rejeição de peça inexistente, carga transversal em axial, apoios ausentes e instabilidade no Python real. |
| Peso próprio | Densidade sintética explícita 1000 kg/m³: massa total **3,4 kg**, peso **34 N** com g=10 m/s²; pórticos com carga nativa e axiais com metade do peso em cada nó. Densidade ausente bloqueia. |

Os testes verificam equilíbrio e rastreabilidade além de deslocamentos. O carregamento distribuído usa a recuperação existente de esforços internos nativos, incluindo seus efeitos e momentos de extremidade. As equações analíticas não consultam respostas de outro run PyNite como oráculo.

Entradas, hashes, mapeamentos e respostas reais: `validation/m35/declared-loaded-real.json`. A regressão Python completa também preserva as comparações anteriores com oráculos externos, estabilidade, segunda ordem e verificações resistentes implementadas.

## Seis demonstrações exigidas e caso Tom

1. **Comercial real:** o comando explícito de referência auditada carrega 6 peças U por R$ 810,00, 20 peças U enrijecido por R$ 3.100,00, 31 telhas/107,65 m por R$ 3.767,75, 600 brocantes por R$ 360,00 e seis despesas totalizando R$ 1.613,54. Resultado **R$ 9.651,29**, sem margem adicionada. Não sobrescreve um orçamento preenchido.
2. **Recortes:** fixtures identificadas como ilustrativas validam área líquida e editor; não se usa 14,28×5,38 m como área do Tom.
3. **Persistência:** importação, gravação, recarga, backup/restauração de domínio e exportação conservam nós, barras, atribuições e informações comerciais.
4. **Cálculo real:** o fluxo de navegador executa o modelo sintético declarado com Python real e compara a flecha −0,00096875 m; testes numéricos adicionais cobrem os casos acima.
5. **Quantitativos:** três peças/3 m, preços declarados de R$ 10/20/30 por metro e transferência de R$ 60; alteração de nó atualiza o total geométrico para 3,5 m e torna análise/levantamento anteriores obsoletos.
6. **Bloqueios:** carregar os dados comerciais do Tom não gera 26 barras, seis tesouras, apoios, ações ou propriedades físicas. Um modelo ilustrativo incompleto continua sem resultado de análise nem autorização de fabricação.

Os arquivos exatos `planta baixa(2).pdf` e `ton valores(2).pdf` não estavam disponíveis neste ambiente. Usaram-se exclusivamente as transcrições auditadas no PR #52, como permitido na missão. A topologia resistente, posições de apoios, propriedades efetivas, ligações, ações e área líquida real do Tom continuam desconhecidas. Não se conclui aprovação estrutural da obra.

## Execução local e evidências

Ambiente Windows; Node 24.13.0, pnpm 12.15.0, Python 3.12.10, PyNiteFEA 3.2.1. Perfil opcional de seções/FSM isolado conforme os locks existentes. BLAS/OMP/MKL com uma thread. Sem `NODE_ENV=development` global no Vitest. `JPN_PYTHON_EXECUTABLE` e `JPN_SECTION_FSM_PYTHON_EXECUTABLE` apontam para os ambientes preparados.

| Comando/campanha | Resultado efetivamente observado |
|---|---|
| `python engine/validate.py --output-dir validation/m35/python-final` | **1683 testes aprovados**, 1000 comparações de referência; saída 0. |
| `pnpm test` | **533 aprovados**, 60 arquivos, 191,32 s. Depois acrescentados dois casos direcionados, conforme a linha seguinte. |
| `pnpm exec vitest run src/domain/declared-loading-real.test.ts src/domain/declared-takeoff.test.ts` | **18 aprovados**, incluindo pórtico em L e rejeição da área retangular residual, acrescentados após a suíte completa. Não se declara uma execução única de 535 testes. |
| `pnpm exec vitest run src/domain/roof-outline.test.ts` | **12 aprovados**, incluindo as duas regressões de contorno incompleto. |
| `pnpm typecheck`, `pnpm lint` | Aprovados; conferência final registrada em `validation/m35/logs/`. |
| Playwright: M35, integration-declared, integration-generated, app, delivery, preproduction, quick-project | **24 aprovados**, 1,6 min; celular 375 px e desktop 1440 px. Evidência JSON e screenshots em `validation/m35/`. Não se afirma execução de toda a suíte E2E. |
| Reexecução Playwright M35 após ajuste do diagnóstico no resumo | Resultado e log final em `validation/m35/checks.json` e `logs/`. |
| DXF independente e build de produção | Comandos, códigos de saída e logs finais em `validation/m35/checks.json`. |

O relatório registra o que se executou, sem substituir testes remotos por mocks. O estado da CI do novo PR é informado na descrição do PR; os 9/9 jobs do PR #50 são apenas baseline e não são atribuídos a esta branch. Não houve validação online/produção nesta missão.

### Falhas encontradas e tratamento

| Categoria | Falha e tratamento |
|---|---|
| Ambiental | Baseline local inicial: 12 aprovados/1 falha por fixture golden ausente no download. Restauradas as fixtures pelos SHAs exatos da main, sem alterar referências. |
| Ambiental | Primeira validação Python: 1680 aprovados/3 falhas CLI. O pacote editável do Python apontava para um checkout antigo e não encontrava módulo já existente. Reinstalado `engine` editável com `--no-build-isolation --no-deps`; 3 casos dirigidos e a validação completa passaram. Não se alterou o solver. |
| Integração funcional | O formulário podia fornecer contorno ainda vazio ao refinamento geométrico, que acessava o primeiro ponto inexistente e derrubava a página. Corrigida a rejeição antecipada e acrescentados casos de anel/furo vazios; nenhuma tolerância numérica relaxada. |
| Harness de persistência | A primeira campanha M35 leu localStorage antes da gravação com debounce. O teste agora aguarda a persistência efetiva, como já espera pelas respostas reais do solver. |
| Diagnóstico | O resumo declarado revisava a preparação como somente nodal mesmo após cadastrar carga distribuída; passou a selecionar o mesmo modo carregado usado no painel técnico. |
| Dados físicos insuficientes | Recusas de Tom incompleto, carga em axial incompatível e apoio ausente são resultados esperados, não cálculos aprovados. |

## Limitações e próximos passos

- O fluxo novo de cargas é o domínio **misto `/2` compatível**; não há roteamento automático para modelos puros nem extensão dos contratos anteriores.
- Contorno e seleção de peças de apoio não automatizam distribuição por área ou vento. A associação exige validação física adicional, inclusive para importações.
- A limpeza explícita de referências removidas não inventa novas conexões e não confirma novamente a revisão geométrica. Verificar as pendências antes de calcular.
- Quantitativos entre eixos não são detalhamento, massa certificada, compra otimizada ou plano de fabricação. Preços e propriedades precisam de revisão profissional.
- Não foram criados novos procedimentos normativos, verificadores de ligação ou formulários de fabricação. As verificações anteriores mantêm seu domínio e limitações.
- A execução permanece experimental: **NOT_READY_BLOCKED**, **computedStructuralApproval=false**, **fabricationRelease=false**. Resultado numérico válido não equivale à aprovação normativa da estrutura.

Veredito do incremento local: funcionalidades novas verificadas no domínio descrito, com limitações explícitas. O fluxo estrutural completo ainda exige dados reais do projeto, validação do caminho de cargas, cobertura dos demais domínios de solver e verificações de resistência/estabilidade/ligações aplicáveis. A publicação é para revisão, sem merge automático.
