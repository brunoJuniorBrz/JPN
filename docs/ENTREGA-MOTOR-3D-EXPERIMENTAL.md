# Entrega — motor espacial 3D experimental

31/10/2026. Branch `feat/experimental-spatial-analysis`, criada da `main` **`4dae505ec18e399146d2dda8d36a6d7d61a53ca9`**. A especificação oficial foi lida integralmente nesse SHA; seu briefing cita uma baseline anterior (`a0e70d2`). Implementação em cópia isolada, preservando o diretório de trabalho anterior. Entrega por PR, sem merge ou escrita na `main`.

## Resultado e escopo

Implementados contratos `jpn.frame3d/1` → `jpn.frame3d-result/1`, adaptador Python **PyNiteFEA 3.2.1**, processo/serviço HTTP, inspeção de preparo da geometria JPN e painel **Análise 3D experimental**. O pórtico espacial explícito de cinco nós/quatro barras é executado realmente na interface; deslocamentos, rotações, reações e seis ações internas estão disponíveis por combinação e barra.

O domínio desta fase é estática elástica linear de primeira ordem, materiais isotrópicos, membros prismáticos Euler–Bernoulli com flexão e torção de Saint-Venant, apoios cartesianos em zero e cargas **nodais**. Resultados não constituem dimensionamento, estabilidade ao flambamento, adequação normativa ou autorização de fabricação.

A cobertura da entrada rápida continua sendo geometria visual. Perfis sintéticos não fornecem E/G/A/I/J para análise. Quando as ligações, propriedades, apoios, caminho de cargas, combinações ou sistema lateral não estão declarados, a análise da obra permanece pendente. O exemplo independente é identificado explicitamente e não altera o projeto, quantitativos, preços ou análise 2D.

## Baseline e validação local

Antes das mudanças funcionais, executados sobre o SHA base:

| Verificação | Baseline | Final local |
|---|---:|---:|
| Python, incluindo treliças históricas | 1.186 | **1.271** |
| Vitest | 112 | **127** |
| Playwright | 35 | **39** |
| TypeScript / ESLint / build | aprovados | **aprovados** |
| DXF independente | 130 linhas 3D, mm, sem erros | **preservado** |

Nenhuma falha ou teste ignorado nas execuções finais. **1.437 testes finais**, além das 1.000 comparações PyNite da campanha 2D repetida pelo validador. A campanha utiliza as mesmas sementes já testadas, não é contada novamente como 1.000 testes extras. Falhas intermediárias não foram omitidas: um teste de liberação inicialmente esperava momento sem carga de momento na junta, contrariando equilíbrio; a fixture foi corrigida para declarar o momento. Um defeito real de codificação no transporte Windows foi corrigido e coberto por regressão UTF-8. A revisão final também tornou o vínculo idempotente e exige novo vínculo quando mudam suas hipóteses, evitando reutilizar revisão antiga.

Ambiente: Windows x64, Python 3.12.10, Node 24.13.0, dependências do lockfile pnpm 12.15.0; NumPy 2.5.4, SciPy 1.18.1, PyNiteFEA 3.2.1 e pytest 9.2.0. O diretório isolado reutilizou dependências JS idênticas por junction e configurou o executável Python explicitamente. A CI existente continua executando Python em **Windows e Ubuntu** e aplicação em Ubuntu; o status remoto do SHA proposto deve ser verificado nos checks do PR, separadamente destes resultados locais. Não se atribui uma execução Linux ao ambiente Windows.

Evidências: `docs/validation/2026-10-31-spatial/`, incluindo baseline, relatórios completos, resultado de referência, hashes e build. Capturas de resultado em 375/1440 px foram inspecionadas; tabelas possuem rolagem horizontal própria e não alargam o documento. Não foram usados aparelhos físicos.

## Bibliotecas e implementação

PyNiteFEA 3.2.1, licença **MIT**, passou de referência de validação a dependência de runtime do módulo 3D. Está fixado em `engine/pyproject.toml` e no lock Python já existente. A montagem e a solução de pórticos pertencem ao PyNite; não há matriz elementar de pórtico implementada no JPN.

Foram examinadas as APIs instaladas `FEModel3D.add_material/add_section/add_member/def_support/def_releases/analyze_linear`, `Ke`, `Member3D.T/f` e `Analysis._prepare_model`. A preparação e a matriz da biblioteca são usadas também para o diagnóstico espectral. Essas interfaces, inclusive a preparação privada, ficam deliberadamente presas à versão: outra versão é recusada até revalidação. A documentação web identifica 3.2.0 em algumas páginas; os fontes 3.2.1 instalados prevaleceram.

NumPy/SciPy fornecem álgebra para inspeção e diagnóstico, preservando versões/licenças da auditoria anterior. O teste independente usa o **método das forças/trabalho virtual**, sem matriz, transformações ou recuperação de esforços do PyNite. O pequeno sistema de redundantes é restrito ao referencial de teste; não é um segundo solver de produção.

Referências primárias: [PyNite 3.2.1 e licença](https://pypi.org/project/PyNiteFEA/3.2.1/), [API do modelo](https://pynite.readthedocs.io/en/latest/FEModel3D.html), [membros e eixos](https://pynite.readthedocs.io/en/latest/member.html), [análise linear](https://pynite.readthedocs.io/en/latest/analysis.html), [MIT 2.080J — métodos de energia](https://ocw.mit.edu/courses/2-080j-structural-mechanics-fall-2013/2d0cc95bd3556fdadc28226acabafa51_MIT2_080JF13_Lecture8.pdf). Nenhuma norma ABNT ou fórmula de resistência foi transcrita/implementada.

## Contratos, unidades e sinais

Contratos estritos separados em `src/domain/spatial-analysis.ts` e `engine/jpn_structural/frame3d_model.py`. O contrato de treliças `jpn.truss/1` e seu solver permanecem intactos.

Entrada obrigatória: versão, `units: SI`, teoria, projeto/revisão/fonte, nós XYZ, materiais E/G/ν com fonte/revisão, seções A/Iy/Iz/J com fonte/revisão, membros `kind: frame`, IDs de extremidades, material/seção, giro físico e seis flags de liberação em cada extremidade; apoios, casos com fonte, cargas nodais e combinações com coeficientes explícitos.

O global mantém **Z para cima**, sem permutar os eixos para a convenção gráfica Three.js. SI: m, N, Pa, m², m⁴, N·m e rad. Conversões de fronteira testadas: mm/1.000, cm²×10⁻⁴, cm⁴×10⁻⁸, GPa×10⁹, kN×1.000 e kN·m×1.000. O adaptador não obtém área/inércias/torção de texto, massa ou seção visual.

E/G/ν são declarados e conferidos pela relação isotrópica `E = 2G(1+ν)` com tolerância relativa 0,1%. A API da biblioteca exige densidade; seu argumento recebe zero apenas porque **nenhuma rotina de peso próprio existe neste contrato**. Isso não declara densidade física igual a zero nem calcula peso. Cargas de vento/peso/sobrecarga não são criadas.

Nos apoios, a ordem é **UX/UY/UZ/RX/RY/RZ**; `true` restringe em zero e `false` libera. Não há recalques, molas, apoios inclinados ou restrições artificiais. Nas liberações, `true` libera a componente; somente liberações rotacionais são implementadas. Liberações que deixem mecanismo ou singularidade são recusadas, sem travar a rotação silenciosamente. Membros axiais puros/treliças mistas não são convertidos automaticamente em elementos rígidos.

No físico, **x local é longitudinal inicial→final**, distinto do Z longitudinal do renderer. Os eixos y/z de referência seguem `Member3D.T` do PyNite: local y aponta na direção da projeção do +Y global sobre o plano normal a x, com convenção específica para barras paralelas ao global Y. O giro positivo em graus segue a mão direita em x. Cada resultado retorna as três linhas da matriz de eixos locais em coordenadas globais; o giro visual do catálogo não é reaproveitado como orientação física presumida.

As ações de seção são da **parte final sobre a parte inicial**, no sistema local: N positivo em tração; Vy/Vz nas direções locais; T/My/Mz pela mão direita. A recuperação usa as ações de extremidade da biblioteca e equilíbrio estático: força constante e momento linear, exatos para o escopo de cargas exclusivamente nodais. São entregues x=0, L/4, L/2, 3L/4 e L. `end_actions_local` preserva as doze ações nodais do elemento, grupos Fx/Fy/Fz/Mx/My/Mz no início e fim. Os sinais de diagramas nativos do PyNite não são simplesmente rotulados como tração positiva: há testes físicos específicos para essa conversão.

Translações saem em m, rotações em rad, reações em N/N·m. O painel converte para mm/kN/kN·m e mantém rotações em rad. Casos D/L/W são apenas identificadores. **Somente as combinações fornecidas são resolvidas**; para analisar um caso unitário, declare explicitamente seu coeficiente. Lista vazia ou coeficientes todos nulos são erros, sem combinação padrão oculta.

## Hash e integridade dos dados

SHA-256 cobre todo o input: projeto/revisão/fonte, teoria, geometria, materiais, seções, giro, liberações, apoios, casos, cargas, fatores e fontes. A serialização canônica ordena chaves e representa números por tags contendo seu IEEE754 big-endian de 64 bits; zero negativo é normalizado. Isso evita diferenças de notação de floats entre Python/JavaScript. Não é uma alegação de implementação RFC 8785 ou assinatura de aprovação. A ordem de arrays participa da identidade; reordenar exige nova análise, embora a invariância física à ordem seja testada.

Além do hash canônico, o transporte HTTP usa SHA-256 dos bytes do corpo enviado. Node confere esquema, finitude, versão, projeto/revisão, combinações e conjuntos de IDs da resposta. O browser confere esquema e hash novamente. A CLI 3D lê UTF-8 explicitamente; fontes com acentos foram testadas no processo e HTTP reais no Windows.

Uma resposta só é apresentada se a identidade ainda corresponder ao modelo/rascunho atual. Alterar input físico, revisão de ligações/sistema lateral ou geometria/perfis do projeto invalida a identidade. O vínculo revisado à obra gera revisão criptográfica da geometria/perfis e decisões declaradas. Respostas em voo após alteração são descartadas. No reload, resultados não permanecem atuais.

Rascunhos e resultados 3D são **transitórios** nesta fase, exportáveis como JSON. Não foram acrescentados campos a snapshots ou backups: v1/v2/v3→v4, revisões, materiais, documentos e análise 2D continuam como antes; nenhuma migração v4→v5 foi necessária. Persistência durável de drafts 3D é pendência explícita, não funcionalidade alegada.

## Preparação da geometria e ligação à obra

`spatialReadiness` distingue `visual_ready` e `analysis_ready`. Detecta pontos de contato internos, cruzamentos sem nó e sobreposições colineares, preservando IDs nos diagnósticos. Enumera falta de E/G/ν/A/Iy/Iz/J, liberações/conexões, apoios, caminho de cargas, combinações e sistema lateral. Para modelos grandes limita a inspeção a 100.000 pares; uma inspeção parcial **bloqueia**, não aprova.

O PyNite divide automaticamente membros físicos em todos os nós interiores. O backend recusa esses contatos **antes** da biblioteca e confere que cada membro permaneceu com um único subelemento. Cruzamentos não criam juntas. Nós coincidentes, órfãos, componentes desconectados, comprimento nulo e sobreposições não geram resultados.

`buildSpatialRequest` só mapeia geometria com segmentação compatível, preserva IDs/conectividade, converte mm→m e exige propriedades/apoios/cargas/liberações/combinações já declarados, revisão de ligações e de estabilidade lateral. Não inventa contraventamento: o responsável pode declarar ação de pórtico ou outro sistema representado e revisado. O diagnóstico de preparo não é prova de estabilidade; a rigidez é verificada na análise.

O JPN rápido 10×20 m comum **continua bloqueado para cálculo da obra** por contatos entre nós e falta de dados físicos. Há teste de um mapeamento geométrico compatível com terças somente nas bordas e todas as decisões dadas explicitamente como fixture; isso não se transforma em configuração padrão do produto. Geometrias que exigem novas divisões precisam de uma fase própria de modelagem de ligações/discretização.

## Validação matemática independente

85 testes Python novos cobrem:

- `δ=PL/(EA)`, reações e tração/compressão em X/Y/Z, membro invertido e carga pequena.
- Balanço `δ=PL³/(3EI)`, reação `P`, momento `PL`, eixos forte/fraco e giro de 90°.
- Torção `θ=TL/(GJ)` em três direções, com reação de momento oposta.
- Viga de dois apoios com nó central explicitamente criado: reações P/2, momento PL/4 e deslocamento PL³/(48EI). Nenhuma carga foi repartida arbitrariamente entre nós.
- Pórtico plano e pórtico espacial hiperestáticos, forças e momentos simultâneos, reversão e referência por trabalho virtual independente.
- Superposição de combinações, rotação/translação rígidas, ordem de IDs, liberação de momento, equilíbrio global/nodal.
- Propriedades ausentes/não finitas, fontes/referências inválidas, mecanismo, condicionamento inadequado, limite operacional, dependência ausente, stdout inválido, Unicode, CLI/HTTP privados, limites e concorrência.

No referencial espacial, abre-se o apoio final e calculam-se flexibilidades por `∫[NᵢNⱼ/(EA) + TᵢTⱼ/(GJ) + Mbᵢ·Mbⱼ/(EI)]dx`. Seis redundantes anulam suas translações/rotações. As integrandas são quadráticas e a quadratura de dois pontos é exata nesse domínio; não há reutilização do MEF do PyNite. O caso de referência usa Iy=Iz; anisotropia forte/fraca é validada separadamente no balanço.

Maior diferença absoluta do pórtico espacial nesta execução:

| Grandeza | Diferença |
|---|---:|
| Translação | 2,52×10⁻¹⁷ m |
| Rotação | 8,35×10⁻¹⁸ rad |
| Reação de força | 3,87×10⁻¹¹ N |
| Reação de momento | 9,78×10⁻¹¹ N·m |

Tolerâncias pré-definidas dos testes de pórtico: relativa 10⁻⁸, absoluta 10⁻¹¹ m/rad e 10⁻⁶ N/N·m. Não foram ampliadas para acomodar divergência. Esses valores pertencem às fixtures; não são incerteza garantida para toda entrada aceita.

O diagnóstico espectral usa a matriz da biblioteca, particionada pelos vínculos declarados e escalada diagonalmente. Autovalor mínimo ≤ `10 n ε λmax` recusa singularidade numérica; condição escalada >10¹⁰ recusa mau condicionamento. Resíduos nodais e globais de forças/momentos precisam ficar abaixo de 10⁻⁸. A solução é direta linear: não há convergência iterativa/P-Delta a alegar. Movimento relativo acima de 1% do envelope ou rotação acima de 0,05 rad gera `MODEL_LIMIT`; esses limites são operacionais, **não normativos**, e abaixo deles ainda pode haver instabilidade/resistência inadequada.

## Desempenho e limites de execução

Limites: 100 nós/600 graus, 200 membros, 50 materiais/seções, 100 apoios, 10 casos, 500 cargas nodais e 10 combinações. Coordenadas ±10.000 m, barras de 10⁻⁵ a 1.000 m, limites finitos de propriedades/cargas/fatores definidos nos contratos. Entrada 500 kB, saída 2 MB. Modelo fora do domínio é recusado por inteiro.

Medições em worker isolado com tracemalloc, BLAS limitado a uma thread no serviço/processo 3D, Windows/Python 3.12.10:

| Fixture | Nós / membros | Tempo | Pico rastreado Python | Pico RSS do processo |
|---|---:|---:|---:|---:|
| Pórtico espacial | 5 / 4 | 1,69 s | 26,84 MiB | 102,90 MiB |
| Grelha/pórticos rígidos 10×20 m, apoios/cargas explícitos | 60 / 79 | 0,88 s | 2,37 MiB | 102,90 MiB |

O primeiro caso inclui importação inicial; o segundo aproveita imports no mesmo worker. RSS é máximo acumulado do processo, não incremento exclusivo do modelo; tracemalloc não substitui RSS. Não são promessas de escala, throughput, latência remota ou desempenho em todos os hosts. O validador limita o processo dos benchmarks a 20 s.

O runner Node interrompe o filho local após 20 s, limita stdout por bytes e libera a vaga em erros. O serviço HTTP executa worker separado com timeout duro de 20 s e limite compartilhado de duas análises. Node admite duas chamadas 3D simultâneas por instância; o limite legado 2D é separado. Não há limite global entre réplicas. Testes controlados verificam kill, saída parcial, timeout, saída excessiva e liberação de slots; a medição real de throughput distribuído não foi feita.

## Usar e implantar

Preparação regular (Python 3.12/Node 24):

```sh
python -m venv .venv
# Linux; no Windows use .venv/Scripts/python.exe
.venv/bin/python -m pip install -r engine/requirements-validation.lock
.venv/bin/python -m pip install --no-build-isolation --no-deps -e ./engine
npx --yes pnpm@12.15.0 install --frozen-lockfile
npx --yes pnpm@12.15.0 dev
```

Em **Novo projeto**, a entrada rápida continua igual. Depois do 3D, em ferramentas do pré-projeto, abra **Análise 3D experimental → Carregar exemplo espacial validado → Executar análise 3D experimental**. Confira as condições no JSON SI editável, apoios e fontes. O painel mostra a combinação, deslocamentos/rotações, reações, esforços e eixos; permite exportar entradas/resultados. O editor JSON é uma interface técnica inicial, não um modelador gráfico de vínculos.

CLI independente:

```sh
.venv/bin/python -m jpn_structural.frame3d < engine/examples/spatial-portal.json
.venv/bin/python engine/validate.py
npx --yes pnpm@12.15.0 typecheck
npx --yes pnpm@12.15.0 lint
npx --yes pnpm@12.15.0 test
.venv/bin/python tests/verify_dxf.py
npx --yes pnpm@12.15.0 test:e2e
npx --yes pnpm@12.15.0 build
```

A API nova é `POST /api/analysis3d`; a antiga permanece `/api/analysis`. Localmente encontra o Python do venv, ou `JPN_PYTHON_EXECUTABLE`. Não executa comandos de shell derivados do projeto.

Para serviço privado, `python -m jpn_structural.service --host 127.0.0.1 --port 8010`, endpoint **`/analyze3d`**. Node usa **`JPN_SPATIAL_ANALYSIS_URL`** e o token servidor **`JPN_ANALYSIS_TOKEN`**. O endpoint 2D e `JPN_ANALYSIS_URL` existentes permanecem independentes. URL remota exige HTTPS; HTTP só em loopback; redirects são recusados. Publicar fora de loopback exige token e proxy TLS. A API Next confere origem do navegador e limita bytes; credenciais não são públicas.

Em Vercel, a análise exige serviço Python remoto preparado; não presume processo científico local. Sem configuração, o painel informa **Serviço de análise indisponível**, enquanto 3D, levantamento e comércio continuam disponíveis. Foram testados processo e HTTP locais reais; nenhum serviço Python público, imagem Docker ou credencial de hospedagem foi validado nesta missão.

## Pendências explícitas

- Revisão técnica independente para uso real; normas, ações/combinações justificadas por normas licenciadas, resistência, flambagem global/local, estabilidade de segunda ordem e serviço.
- Ligações semirrígidas, molas, recalques, excentricidades físicas, treliças axiais mistas, empenamento/restrição da torção, cisalhamento de Timoshenko, não linearidade e P-Delta.
- Cargas pontuais/distribuídas em membros, peso próprio automático, telhamento→caminho de cargas, vento por localização e discretização consciente de contatos.
- Seções reais de fabricante e cálculo geométrico auditável; nenhuma integração sectionproperties foi usada para justificar capacidade resistente.
- Modelador/formulários completos de vínculos e loads, persistência v5 de drafts 3D com migração própria, autenticação/rate limiting distribuído e execução pública do serviço.

Não foram implementados preços, otimização por custo, soldas, fabricação, aprovação normativa ou merge automático. As etapas seguintes da missão permanecem separadas.

## Arquivos centrais

Python: `frame3d_model.py`, `frame3d.py`, fixture `engine/examples/spatial-portal.json`, testes `test_frame3d.py`, `test_frame3d_service.py`, referencial `spatial_reference.py` e `benchmark_spatial.py`; serviço/validador/pyproject atualizados. TypeScript: `spatial-analysis.ts`, `spatial-readiness.ts`, `spatial-runner.ts`, `/api/analysis3d`, `spatial-analysis-panel.tsx` e integração de uma aba no workbench. Testes Vitest, transporte e E2E novos. README e guia do motor orientam a reprodução.

Geradores geométricos, entrada rápida, renderer de perfis, contratos/persistência de projetos, cálculos financeiros/corte e exportadores não foram reescritos. Suas regressões existentes continuam executadas integralmente.
