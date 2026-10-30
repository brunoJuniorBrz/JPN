# Entrega JPN v0.6 — pré-projeto integrado

Execução local em 30/10/2026. Resultado: incremento funcional sobre o aplicativo existente, com fluxos completos de levantamento, simulação, análise experimental disponível, proposta e documentos. **Não é dimensionamento normativo, projeto executivo ou liberação de fabricação.**

## Auditoria e referência reexecutada

Antes da implementação, foram relidos README/AGENTS/ROADMAP/documentação técnica e inspecionados contratos/domínios, componentes, persistência, exportações, motor Python e campanha PyNite. A versão instalada de Next 16.4.3 foi consultada nos guias locais de route handlers, lazy loading e testes.

Nesta execução a base foi reexecutada: **1.183 Python, 48 Vitest, 14 Playwright aprovados**, além da campanha de 1.000 comparações. A [CI do commit anterior](https://github.com/brunoJuniorBrz/JPN/actions/runs/41136719881), `a818faf948c958194c2e43c8ae1e872d927d16d8`, foi consultada e estava concluída com sucesso. Isso é distinto dos resultados novos abaixo. A workflow atual foi ampliada para instalar Python também no job do aplicativo; sua nova execução remota ainda não foi observada.

## Implementado e exercitado de ponta a ponta

- Uma água preservada; duas águas simétricas com cumeeira discretizada, painéis pares e invariância de eixos; balanços longitudinais explícitos de terças, quantidades e áreas coerentes.
- Visualização Three.js carregada sob demanda, rotação/zoom/pan, enquadramento isométrico que considera proporção da tela, grade com escala, seleção/destaque e grupos de peças. Vistas 2D continuam disponíveis e são o fallback sem WebGL2.
- Cadastro rastreável de propriedades declaradas/calculadas: tipo, dimensões/espessura, A, E, inércias, massa, comprimento comercial, preço cotado por metro, fonte e data/referência. Nenhum catálogo de fabricante ou propriedade real foi inventado.
- Simulação FFD com distribuição por barra, serra/pontas explícitas, sobras reutilizáveis, desperdício, aproveitamento e estimativa de compra por perfil. Comprimentos finais podem ser declarados por peça; registros de outra configuração são recusados. O estado continua `simulation_only`.
- Transferência explícita de comprimentos para o orçamento, origem por IDs/categoria/configuração e preservação dos preços editados. Orçamento com quantitativos vinculados desatualizados não emite preço completo até atualizar. Custos, centavos/BigInt, margem/markup e documentos comerciais anteriores foram preservados.
- API Node chamando o Python real por processo controlado ou por HTTP privado; cargas/vínculos da tesoura T1 configuráveis, unidades rigorosas, E/A rastreáveis, versões/hash e resultados em tabelas. Alterações ocultam resultados antigos; respostas recebidas após mudança são descartadas.
- Snapshot v4 com migração v1/v2/v3, revisões preliminares preservadas pelo repositório, restauração para rascunho e limite de conjunto restaurável em backup de 5 MB.
- DXF 3D em mm/camadas/IDs e SVG frontal, sem detalhes de fabricação presumidos. PDF de levantamento com planta/frente/lateral, lista de peças e pendências; XLSX com comprimentos geométricos/finais declarados, massa/fonte e status; proposta com itens/quantidades sem custo interno; PDF da simulação de aproveitamento.
- Exemplo completo fictício na página inicial e [backup importável](../examples/preprojeto-duas-aguas.json), com simulação, hipótese de tesoura de teste e proposta, sem substituir exemplos antigos.

## Falhas encontradas e corrigidas

| Falha observada | Correção e verificação |
| --- | --- |
| API recusava chamada legítima de `127.0.0.1` porque Next normalizava `request.url` para `localhost` | Verificação usa o destino HTTP real (`Host`) e protocolo encaminhado conhecido; regressão mantém recusa de outra origem e aceita chamada normalizada |
| Dados do exemplo pareciam desatualizados após serialização/Zod, apesar de terem o mesmo conteúdo | Identificação canônica por conteúdo com ordenação de chaves; regressão faz backup, reabre e reconstrói a análise sem perder validade |
| Câmera 3D cortava extremos em viewport estreito | Ajuste por esfera envolvente e pelo menor ângulo de visão horizontal/vertical; cinco proporções verificam todos os extremos projetados, e captura de 375 px foi revisada |
| Dispositivo sem WebGL gerava mensagem de erro da biblioteca no painel de desenvolvimento | Verificação prévia de contexto e fallback 2D, sem construir renderer indisponível; teste de navegador injeta ausência de WebGL e volta ao SVG |
| Fixtures legadas de testes passavam a conter campos novos ao serem derivadas de `newProject()` | Fixtures v1/v2 mantidas com seus campos reais; expectativas de migração atualizadas para v4, sem afrouxar validação de versões antigas |
| Campo de balanço inválido poderia virar zero automaticamente | Ausência preservada como pendência; zero continua explícito, sem geometria aparentemente válida baseada em dado inválido |
| Conjunto local poderia ser gravado maior que o limite restaurável de backup | Commit valida tamanho do backup antes de escrever; regressão preserva estado anterior ao rejeitar excesso |

Uma execução intermediária teve falhas de seletor do painel de desenvolvimento e obsolescência do exemplo; foram investigadas e corrigidas antes da execução final. O build detectou também uma anotação TypeScript ausente no mock de WebGL do teste; foi corrigida. Não há teste essencial reprovado ou ignorado na execução final.

## Verificação final desta execução

| Verificação | Resultado |
| --- | --- |
| Python, suíte completa | **1.186 aprovados**, zero falhas/erros/ignorados |
| Campanha PyNite 3.2.1 | 1.000 casos, sementes 0–999, sem divergência fora dos limites definidos na auditoria inicial |
| Vitest | **79 aprovados**, zero falhas/ignorados |
| Playwright Chromium | **21 aprovados**, zero falhas/ignorados/flaky |
| Telas | fluxos em 320, 375, 768 e 1440 px; jornadas anteriores de 390 px preservadas |
| TypeScript / ESLint / build Next | códigos de saída 0 |
| `pip check` | dependências consistentes |
| DXF | dxf-parser + ezdxf 1.4.5; 130 barras/coord. 3D verificadas, mm, zero erros de auditoria |
| Conservação de corte | 300 problemas com semente fixa; quantidades e comprimento conservados; problemas pequenos comparados a partição exaustiva |
| Integração | Python local real, Node→HTTP Python real, autenticação do serviço, erros, corpo inválido, versão/hash/IDs e indisponibilidade em Vercel sem serviço |
| Revisão visual | captura 3D móvel e PDF de levantamento renderizado em PNG com Poppler; margens, tabelas, avisos e vistas conferidos |

Total: **1.286 testes aprovados**. A campanha de desvios repetida pelo runner não é contada novamente como outros 1.000 testes. Os testes aleatórios de corte executam 300 instâncias dentro de um teste de invariantes, não 300 testes individuais na contagem acima.

Desvios máximos contra PyNite permaneceram: deslocamento `2,0459328675670463e-14 m`, reação `1,6542617231607437e-7 N`, axial `1,680455170571804e-7 N`, semente 471. Soluções analíticas/equilíbrio/compatibilidade/energia continuam sendo evidências complementares; dois programas compartilham bibliotecas numéricas e sua concordância não prova aprovação de engenharia.

Um levantamento de **3.815 peças** teve geração geométrica em aproximadamente **8,5 ms** e agrupamento/aproveitamento em aproximadamente **23,6 ms** nesta medição Node local; o registro bruto acompanha as evidências. Isso não mede GPU, navegador móvel físico ou tempo de renderização de toda a interface. Há limites de 5.000 peças/100 vãos, gráficos por segmentos agrupados e renderização 3D sob demanda, sem loop contínuo de animação.

Evidência nova em `docs/validation/2026-10-30-platform/`: resultados Python/JUnit, Vitest, Playwright, resumo de verificações, medição e hashes dos fontes. As evidências da auditoria inicial foram preservadas separadamente.

## Arquivos e bibliotecas

Novos módulos principais:

- `src/domain/workspace.ts`, `analysis.ts`, `preproject-example.ts`.
- `src/domain/calculations/project-basis.ts`, `cutting.ts`, `platform.test.ts`.
- `src/components/planning/structure-3d.tsx`, `camera-fit.ts`, `camera-fit.test.ts`, `project-workbench.tsx`, `analysis-panel.tsx`.
- `src/infrastructure/analysis/runner.ts`, `runner.test.ts`, `src/app/api/analysis/route.ts`.
- `src/lib/exports/cad.ts`, `cad.test.ts`, `cutting.ts`.
- `engine/jpn_structural/service.py`, `engine/tests/test_service.py`, `engine/Dockerfile`, `engine/.dockerignore`.
- `tests/e2e/platform.spec.ts`, `tests/verify_dxf.py`, exemplo JSON, este relatório/guia e evidências.

Modificados: contratos `structure.ts`/`models.ts`/`project-details.ts`, cálculos `geometry.ts`/`structure.ts`/`estimate.ts`, repositório local e testes de migração, página inicial, formulários/previews/fluxo de planejamento, editor comercial, proposta/PDF/XLSX, estilos, package/lock/workspace pnpm, dependências de validação Python, workflow, README/ROADMAP e documentação de dimensionamento. A lista verificável completa acompanha o manifesto de fontes.

Novas bibliotecas: **Three.js 0.187.0, @types/three 0.187.0, @tarikjabiri/dxf 2.10.0, dxf-parser 1.1.2 e ezdxf 1.4.5, todas MIT**. O serviço HTTP usa biblioteca padrão Python. NumPy/SciPy/PyNite e as bibliotecas financeiras/documentais existentes foram preservados. Detalhes e fontes primárias em [PREPROJETO.md](PREPROJETO.md).

## Como executar e implantar

Instalar Node 24/pnpm 12.15.0 e Python 3.12; instalar o lock de validação e o pacote `engine` no venv; executar `pnpm dev`. Abrir o exemplo completo na página inicial. O [guia técnico](PREPROJETO.md) fornece comandos completos de instalação, testes e exemplos.

Localmente, o adaptador chama o Python instalado no venv ou `JPN_PYTHON_EXECUTABLE`. Em Vercel, fornecer `JPN_ANALYSIS_URL` apontando para serviço Python HTTPS separado e `JPN_ANALYSIS_TOKEN` nos servidores. Sem esse serviço, apenas a análise fica indisponível. Dockerfile foi fornecido, mas a imagem e uma implantação pública não foram executadas; os adaptadores processo/HTTP foram executados de verdade. Infraestrutura pública precisa de TLS, autenticação de usuários, limites globais e observabilidade sem dados sensíveis. Não foram adicionados serviços pagos nem credenciais fictícias de implantação.

## Limitações que permanecem

- Solver somente de primeira ordem axial/planar. Sem análise global 3D, flexão, flambagem, ligações, fundações, vento ou combinações normativas; E/A declarados não comprovam resistência.
- Duas águas somente simétrica, vãos uniformemente distribuídos; balanços somente nas terças longitudinais. Ligações entre terças e banzos não são discretizadas para análise automaticamente.
- FFD é heurística, com um único comprimento comercial escolhido por especificação. Não otimiza estoque múltiplo/preço nem garante número mínimo. A compra simulada de barras não é transferida automaticamente como compra definitiva; o vínculo comercial implementado usa comprimentos e preços por metro, e compras por barra podem ser orçadas explicitamente no fluxo comercial existente.
- Comprimentos finais são declarações para simulação, sem aprovação/liberação de fabricação. Nenhum desenho é documento executivo ou ordem de corte.
- Revisões são do levantamento técnico e limitadas pelo armazenamento local. Sem sincronização, autenticação, assinatura de responsável ou histórico imutável das propostas emitidas. Resultados FE não são persistidos.
- AutoCAD e aparelhos físicos não estavam disponíveis; leitores independentes, emulação de telas e fallback foram testados. Nova workflow ainda sem execução remota observada.

## Próximas três prioridades estratégicas

1. **Engenharia independente:** conferir tipologias, domínio de análise e casos reais; implementar catálogo verificado, ações/combinações e resistência/serviço em módulos normativos separados, com normas/edições e benchmarks rastreáveis.
2. **Planejamento industrial/comercial:** otimização exata/múltiplos estoques, preços por barra/retalho e comparação de compras; ligações/tolerâncias e revisões completas antes de qualquer ordem de fabricação.
3. **Operação profissional:** implantar serviço privado autenticado, executar a nova CI em Linux/Windows, medir aparelhos físicos e validar DXF no AutoCAD; ampliar armazenamento/histórico quando a escala justificar.
