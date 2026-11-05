# Missão 21 — caminho de cargas por área

## A — diagnóstico e base

Auditoria em 01/11/2026. Main consultada: `01caa9f2c5fd6f38b2d98769f597d9b73aaee359`. Os PRs #18 → #19 → #20 → #22 permaneciam abertos, sem merge. Base isolada desta entrega: **PR #22, `243ab80638593a61bf2e61f81f1049f1036382c3`**, branch de trabalho `feat/roof-area-load-path`. Isso reaproveita as dependências sem aprovar sua integração definitiva na main.

- #18: peso próprio e UDL reais em `jpn.mixed3d/2`; ressalvas de auditoria sobre dupla contagem e testes posteriores. Mantidos o caso exclusivo de peso, a revisão rastreável, sua invalidação e o bloqueio quando faltam dados. As duas correções Vitest posteriores estão na base.
- #19/#20: WSGI/worker protegido e transporte local/remoto, hashes, validação de resultados e PyNiteFEA 3.2.1. Não se reimplementou solver, autenticação ou transporte. O histórico de testes remotos não equivale a aprovação normativa.
- #22: catálogo de 56 entradas com massa/dimensões publicadas. Dados de levantamento/visualização não preenchem A/I/J/E/G/ν ou densidade física de análise. U simples e U enrijecido continuam distintos.
- Baseline direcionada da base exata: **23 testes aprovados**, incluindo catálogo, conectividade e carregamentos mistos existentes. Documentos antigos de dimensionamento são planejamento; a leitura do código e dos testes definiu o comportamento atual.

Limitação principal: `adaptLoadedMixedProject` bloqueava incondicionalmente qualquer ação por área. O motor já recebia UDL; faltava uma transformação geométrica conservativa, explicitamente declarada, até essas UDL.

## B — entrega principal

Fluxo implementado: medidas → `generateStructure` inalterado → superfícies derivadas dos eixos → faixas tributárias → peças originais → segmentos físicos existentes → `jpn.mixed3d/2` → Python/PyNite real → resultados e seleção no visualizador.

Suportadas coberturas **retangulares de uma água e duas águas simétricas do gerador existente**, nos quatro sentidos de queda, com terças paralelas, terças nas bordas e na cumeeira. Incluem-se prolongamentos longitudinais explicitamente informados, representados pelas peças existentes. Cada ação uniforme abrange toda a cobertura suportada, declara vetor global unitário, magnitude kN/m², projeção, caso exclusivo, caminho, fonte e revisão.

Hipótese delimitada: transmissão unidirecional de uma superfície coincidente com os eixos das terças. Não se automatizam excentricidades de telhamento, comportamento bidirecional de placas, balanço transversal além da terça extrema, cargas parciais, recortes, cobertura curva, direções de terças não paralelas ou novas ligações. Não se presumem material, rigidez, apoios, contraventamentos, vento ou coeficientes normativos.

Para linhas de terças em coordenadas transversais `u_i`, as divisões internas são `(u_i + u_(i+1))/2`; os limites externos são as bordas declaradas. A faixa de uma terça extrema é reduzida à metade do vão adjacente. Em uma água, `z` é linear em `u`; em duas águas cada plano é tratado separadamente. A cumeeira recebe duas meias faixas disjuntas, agregadas em **uma única UDL por peça/caso**.

Com intensidade `p` e direção unitária `d`, a carga linear é `q = 1000 p b d` N/m, para projeção horizontal. Para superfície inclinada, `b` é multiplicada por `sqrt(1 + (dz/dx)² + (dz/dy)²)`. O comprimento da terça é o comprimento físico longitudinal, não o comprimento inclinado transversal. Os segmentos de uma peça recebem a mesma intensidade; sua divisão não duplica a área ou o comprimento carregado.

Conferências independentes antes de emitir cargas: soma de áreas, força `∫p d dA`, momento global `∫r × (p d) dA`, comparados com `ΣqL` e `Σr_meio × qL`. Como as superfícies são planas e a intensidade uniforme, seus centroides integram exatamente os primeiros momentos. O somatório das linhas extremas/internas é a regra trapezoidal, exata para esses primeiros momentos. Não se somam reações manualmente às tesouras: a transferência é realizada pelos elementos e vínculos físicos no solver.

Tolerâncias novas: geometria de associação **1e-7 m** (coerente com a tolerância de contato existente); conservação relativa **1e-10**, escalada por área, força e braço característico. Rejeita resultados não finitos. As tolerâncias matemáticas e limites do solver não foram alterados.

O contrato derivado **`jpn.roof-load-path/1`** acompanha a preparação exportada: superfícies, caso/fonte/revisão/caminho, limites das faixas, área efetiva, peça original, carga linear, resultantes e momentos esperados/distribuídos. O mapa existente preserva os IDs dos segmentos. O hash de entrada inclui o modelo físico e a revisão da preparação; a identidade de sessão inclui geometria e declarações. Editar dados registrados invalida resultados; alterar geometria revoga a associação.

As ações por área usam casos exclusivos, sem carga nodal, UDL manual ou peso próprio no mesmo caso. Uma ação por caso nesta primeira versão. Combinações com ações automáticas e outras ações requerem declaração de independência das fontes, como a proteção herdada do peso próprio. A base dessa revisão agora inclui as ações por área e a associação; projetos sem esses campos preservam a base de revisão anterior. Igualdade numérica entre duas ações não prova duplicação ou independência física.

Interface: registra ações e seus casos/combinações isoladas com fator 1 explicitamente indicado; associa superfícies às terças da geometria atual; lista faixas, cargas, forças e momentos; seleciona a peça no 3D existente. Há um exemplo separado, sintético e identificado, que não copia propriedades para a obra do usuário. O usuário não precisa editar JSON para o caso suportado.

## C — fundação para regiões compostas

**`jpn.roof-regions/1`**, em metros: identificadores estáveis, contornos retangulares XY, elevação de origem e gradientes do plano, associações por IDs, fonte/revisão e footprint declarado como união de retângulos. Vértices 3D e sentido/inclinação resultam do plano explicitamente informado. O vazio de uma composição em L não é preenchido pelo retângulo envolvente.

Valida regiões adjacentes, L, IDs/associações duplicados, sobreposições, cobertura exata do footprint, lacunas, degeneração e incompatibilidade de elevações em encontros. O contrato é opcional em `workspace.spatialPreparation.roofRegions`, com persistência, snapshots e backup compatíveis; não altera o esquema das medidas ou os quantitativos legados.

**Regiões compostas permanecem preliminares e não analisáveis.** Sua presença bloqueia os adaptadores espaciais pelo diagnóstico `COMPOSED_ROOF_PRELIMINARY`; o gerador retangular não é usado como substituto silencioso. Não foi criado editor de coberturas compostas, novo gerador de peças, visualizador composto ou dimensionamento. Esta é uma fundação de contrato/validação para a missão seguinte, não uma reconstrução da cobertura do profissional.

## Referências reais disponíveis e requisitos preservados

Foram extraídos os textos e renderizadas/conferidas visualmente todas as páginas de **`planta baixa.pdf`** e **`ton valores.pdf`**, ambos com uma página. Os originais permanecem fora do repositório. A terceira imagem de cobertura mencionada não estava disponível entre os arquivos desta mensagem.

A planta contém desenhos cotados de uma composição não retangular, painéis subdivididos, recortes e encontros; há cotas como 5,38, 14,28, 3,78 e 2,71 m e uma elevação parcial. Faltam identificação inequívoca dos planos, datum/elevacões completas, associações espaciais, condições físicas e informações suficientes para construir um modelo estrutural da obra. Não se combinaram as vistas ou medidas isoladas em coordenadas inventadas. A indicação de 10% da imagem citada na missão não pôde ser conferida nessa imagem ausente; não foi inferida como valor exato a partir de cotas arredondadas.

A planilha comercial distingue U simples e U enrijecido 75×40×2,65, separa tesouras e terças e lista 31 telhas TR25 de 0,43 mm, com diferentes comprimentos e soma de 107,65 m lineares. Esses comprimentos não fornecem largura útil, sobreposições ou peso por área; não foram transformados em área tributária ou carga. O campo 101,00 não recebeu unidade presumida. Massa, propriedades geométricas, aço e ligações continuam pendentes para análise da obra real.

Requisitos para próximas missões, preservados sem implementar novos modelos comerciais:

- Identificar desenhos/vistas, regiões, inclinações e revisões; esclarecer medidas divergentes/arredondadas antes de reconstruir o espaço.
- Rastrear tipo real de perfil e peça original até corte/fornecimento, sem equivalência entre U simples e enrijecido nem liberação automática para fabricação.
- Quantificar telhas por comprimento e quantidade, com largura útil/sobreposição/perdas declaradas e separação de área geométrica, medida de compra e ação física.
- Manter fornecedores, unidades, fixadores, soldagem, abrasivos, pintura/consumíveis e mão de obra separados; zeros comerciais declarados não são propriedades físicas.
- Futuramente gerar desenhos/listas/documentos comerciais a partir do modelo validado, com revisão e responsabilidade; não calibrar algoritmos para reproduzir o total da planilha.

Os casos de teste positivos são **sintéticos e independentes da obra real**. A referência real forneceu casos negativos de cotas insuficientes e perfis comerciais sem propriedades físicas; eles permanecem bloqueados.

## D — validação e entrega

| Verificação executada | Resultado real |
| --- | --- |
| Baseline: carregamentos, catálogo e conectividade | 23 aprovados, 0 falhas |
| Direcionados: distribuição/regiões + carregamentos anteriores | 23 aprovados, 0 falhas; inclui Python real |
| Navegador direcionado 375/1440 px | 2 aprovados; associação, seleção no 3D, análise, novo caso/ação zero e invalidação |
| `python engine/validate.py` | 1444 aprovados, 0 falhas/erros/skips; 1000 comparações adicionais e benchmarks aprovados; 65,54 s |
| `pnpm typecheck` | PASSOU, código 0 |
| `pnpm lint` | PASSOU, código 0; 0 erros e 1 aviso herdado em `structure-3d.tsx:156` sobre dependência de hook, arquivo inalterado |
| `pnpm test` | 216 aprovados, 0 falhas/pendências |
| `python tests/verify_dxf.py` | PASSOU; ezdxf 1.4.5, 130 linhas 3D em mm, 0 erros de auditoria |
| `pnpm test:e2e --reporter=json` | 59 aprovados, 0 falhas/skips/flaky; 257,94 s, incluindo regressões comerciais, exportações, backups e telas pequenas |
| `pnpm build` | PASSOU, código 0 |

Ambiente real: Windows, Python 3.12.10, PyNiteFEA 3.2.1, NumPy 2.5.4, SciPy 1.18.1, Node 24.13.0; BLAS/OMP/MKL com uma thread. Suítes completas executadas uma vez, após os testes direcionados. A evidência resumida está em `docs/validation/mission21/checks.json`. Não se corrigiu o aviso de UI herdado, por estar fora do escopo. Na fase direcionada foram corrigidas uma expectativa de código/mensagem no teste e a seleção do summary externo diante dos novos details; nenhuma tolerância numérica foi flexibilizada.

Referências independentes exercitadas: retângulo 6×8 m, declividade 25%, faixas projetadas 1/2/2/1 m, pressão horizontal 0,2 kN/m² → força vertical -9600 N e momentos globais [-38400, 28800, 0] N·m. Superfície inclinada e balanços longitudinais são comparados com áreas e centroides analíticos; direções oblíquas/invertidas, quatro sentidos de queda e duas águas também são conferidos.

A UDL derivada de uma terça extrema (-200 N/m) foi aplicada ao worker Python real em um balanço de 4 m, E=200 GPa e I=1e-5 m⁴, com barra axial transversal explicitamente declarada: `uZ=qL⁴/(8EI)=-0,0032 m`, `θX=qL³/(6EI)`, reação Z=800 N e momento de engaste X=1600 N·m; no meio, módulos de cortante e momento=400 N e 400 N·m. Trata-se de controle analítico independente, não de simplificação oculta da cobertura.

A cobertura gerada 10×20×4 m usa 132 nós/243 segmentos com hipóteses sintéticas explícitas. Uma ação por área de 0,1 kN/m² horizontal produz reação vertical total de 20000 N. O motor real calcula a estrutura completa; a combinação invertida inverte seus deslocamentos. O caso de pressão zero é executado; vínculos insuficientes continuam sendo recusados como `UNSTABLE`. Casos sem propriedades/apoios/ligações, casos de área duplicados/manuais, terças axiais e revisões obsoletas são bloqueados. Reações não são recalculadas por um simulacro no frontend.

**Veredito: Checkpoint B implementado e validado localmente; C entregue apenas como contrato geométrico preliminar.** Não é aprovação da obra real, da pilha para merge ou de dimensionamento. Linux/CI desta nova branch e uso físico em iPhone ainda não foram comprovados nesta execução; os testes de tela usam Chromium com viewports móveis.

Arquivos centrais: `roof-load-path.ts`, `roof-regions.ts`, `roof-load-path.test.ts`; integração em `structural-loading.ts`, `loaded-mixed-adapter.ts` e `spatial-preparation.ts`; exemplo `examples/roof-area-project.ts`; interface nos painéis existentes e `roof-load-path-panel.tsx`; jornada `tests/e2e/roof-load-path.spec.ts`. Contratos matemáticos, solver Python, geometria/quantitativos, DXF, PDF/Excel e catálogo permanecem preservados.

`vercel.json` da raiz e de `engine` bloqueiam deploys Git **somente** para `feat/roof-area-load-path`, conforme a [configuração oficial de Git](https://vercel.com/docs/project-configuration/git-configuration#gitdeploymentenabled). A branch/PR não deve publicar prévia automaticamente. Não se alteraram projetos, segredos ou autenticação; sem deploy manual ou merge. A validação nova usa transporte local real, sem mocks como prova numérica; este incremento não foi publicado nem validado na Vercel.

Não é possível medir o saldo de créditos com as ferramentas disponíveis. O escopo foi contido no Checkpoint B e na fundação preliminar de C, sem redesenho, nova infraestrutura, orçamento/PDF ou dimensionamento normativo.

Próximo passo: auditoria independente desta distribuição; depois obter a imagem ausente, plantas com planos/elevacões confirmadas e propriedades técnicas dos perfis reais antes de desenvolver gerador/conectividade para regiões compostas. O JPN continua experimental: análise elástica não equivale a dimensionamento, detalhamento, aprovação normativa ou autorização para fabricar.
