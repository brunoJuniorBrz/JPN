# JPN Projetos — v0.6.0

Sistema local de projetos e levantamento geométrico de materiais de estruturas metálicas. O fluxo principal agora é **Obra → Medidas → Estrutura → Resultado**, com peças identificadas, desenho e PDF/XLSX para cotação sem preços. O orçamento de venda permanece como área secundária.

## Entrada rápida: 3D primeiro

**Análise espacial experimental:** depois do 3D, abra **Análise 3D experimental** nas ferramentas do pré-projeto. O painel executa um pórtico explícito de referência por PyNiteFEA 3.2.1, com deslocamentos/rotações, reações e esforços por combinação. A geometria rápida permanece visual: apoios, ligações, propriedades e cargas não são presumidos. [Entrega, validação independente, contratos, execução e limites](docs/ENTREGA-MOTOR-3D-EXPERIMENTAL.md). Em Vercel, configurar `JPN_SPATIAL_ANALYSIS_URL` para um serviço Python privado; a falta do serviço não bloqueia 3D ou levantamento.

Em **Novo projeto**, a opção padrão é a **Entrada rápida**. Informe o formato (uma ou duas águas), largura, comprimento e altura; nome, cliente e inclinação visual inicial são opcionais. O aplicativo cria um projeto não fictício, salva no navegador e abre imediatamente **Resultado → Perfis 3D**, com o modelo enquadrado inteiro. **Usar cadastro completo** preserva o antigo fluxo técnico para quem preferir começar detalhando tudo.

O gerador rápido propõe APENAS uma configuração **geométrica provisória**, com distribuição inicial de tesouras/terças, número de painéis e seções 3D **sintéticas**; a inclinação visual começa em 10% quando não informada. Nenhuma classe de aço, massa por metro, preço, comprimento comercial, resistência ou ação foi assumida ou aprovada. **Não usar a saída rápida para encomendar material ou cortar**. Informações físicas/normativas serão solicitadas no futuro motor de dimensionamento.

No 3D, selecione uma barra e use **Editar perfil deste grupo**, ou **Editar distribuição e espaçamentos**. As alterações em Medidas/Estrutura atualizam automaticamente as peças e a lista geométrica. Quando existem linhas de orçamento vinculadas por levantamento, o editor de planejamento atualiza suas quantidades preservando material manual, preço e perdas por grupo, desde que o modelo esteja calculável. Enquanto um formulário está incompleto, as linhas antigas permanecem sinalizadas como desatualizadas.

As configurações iniciais **não são uma otimização de engenharia**, apenas uma pré-visualização editável. Cargas, vento, apoios, análise espacial, verificações normativas, soldas e detalhamento de fabricação continuam pendentes.

## Pré-projeto integrado — v0.6

O visualizador agora oferece **Estrutural / Perfis 3D / Misto**, com tubos retangulares, quadrados e circulares, I/H, U/C e L nas dimensões cadastradas. Informe os campos opcionais em **Estrutura → Geometria da seção para visualização 3D**. Dados ausentes ou incompatíveis mantêm linhas com aviso. [Guia, arquivos, orientação, desempenho e limites](docs/PERFIS-3D.md) · [Galeria visual verificável](examples/perfis-3d.svg).

Projetos antigos podem mostrar **0 peças com seção 3D** porque os perfis eram apenas texto. Nesse aviso, **Ver demonstração com perfis** utiliza a geometria atual da obra e seções explicitamente sintéticas, sem salvar alterações, enquanto **Cadastrar dimensões** permite inserir seções reais. O 3D abre em **Perfis 3D**, com enquadramento da estrutura inteira, em celulares e computadores; somente **Focar peça selecionada** aproxima uma barra.

Disponíveis: uma ou duas águas simétricas, prolongamentos longitudinais das terças, vistas 2D/3D com seleção e fallback sem WebGL2, perfis com propriedades/fonte/data, simulação de aproveitamento FFD, quantitativos vinculados ao orçamento, revisões preliminares, DXF 3D em mm, SVG e PDF/XLSX. A análise experimental chama o motor Python real apenas para **uma tesoura isolada articulada**, com cargas e apoios explícitos; não representa a cobertura inteira nem aprova perfis.

A página inicial traz **duas demonstrações atualizadas**: cobertura de oficina 10 × 20 m (uma água) e galpão 10 × 20 m (duas águas). Ambas abrem diretamente em **Perfis 3D**, com todas as seções geométricas válidas para renderização, quantitativos vinculados e orçamento de venda fictício preenchido. As seções, preços, quantidades de fixadores, prazos e serviços são sintéticos, não são cotação nem dimensionamento normativo. O arquivo [preprojeto-duas-aguas.json](examples/preprojeto-duas-aguas.json) é um arquivo histórico, não o novo modelo de apresentação.

Guia completo, arquitetura, instalação Python, implantação Vercel/serviço separado, licenças e limites: [PREPROJETO.md](docs/PREPROJETO.md). Relatório desta execução: [ENTREGA-PREPROJETO.md](docs/ENTREGA-PREPROJETO.md).

O aplicativo usa snapshots **v4**, migrando v1/v2/v3 sem regravar na leitura ou apagar dados. As quantidades geométricas são recalculadas no planejamento e as linhas de orçamento vinculadas são atualizadas se houver modelo válido; análises e registros de fabricação dependentes podem ficar desatualizados quando a configuração muda. Revisões de levantamento são preservadas pelo repositório; não equivalem a aprovação ou histórico assinado de propostas. Nenhum arquivo é liberado para fabricação nesta versão.

Para desenvolvimento completo, preparar Python 3.12 conforme o guia antes de `pnpm test`; os testes JS incluem chamadas reais ao solver. Em Vercel, configurar o serviço remoto para habilitar análise; as outras funções permanecem disponíveis sem ele. Não houve implantação pública nesta execução.

Validação após os perfis 3D e o acesso à demonstração: **1.186 testes Python + 102 Vitest + 26 Playwright aprovados (1.314 no total)**, sem falhas ou testes ignorados; typecheck, lint e build aprovados. Inclui 1.000 comparações com PyNite, 300 problemas de aproveitamento com semente fixa, processos/HTTP reais e jornadas em 320/375/768/1440 px, com toque em celular emulado. O DXF foi reaberto e auditado por leitores independentes. Evidências desta etapa: [resumo verificável](docs/validation/2026-10-30-profiles-demo/summary.json). O histórico anterior permanece em `docs/validation/2026-10-30-platform/` e `docs/validation/2026-10-30-profiles-3d/`.

## Levantamento de peças

Abra **Abrir exemplo de levantamento** na página inicial: cobertura de oficina fictícia de 10 × 20 m, inclinação de 10%, 5 linhas de tesouras, 7 linhas de terças e 123 peças com seções 3D completas. A proposta de demonstração inclui material derivado do levantamento, telhamento por área, quantidades ilustrativas de fixadores, mão de obra e despesas. O segundo exemplo demonstra duas águas e a análise experimental isolada. Ambos são instalados somente ao clicar.

Para uma obra nova, informe medidas, espaçamento máximo entre tesouras e terças, altura da tesoura e número de painéis. A geração distribui os vãos igualmente, incluindo as extremidades, e calcula pilares, banzos, montantes, diagonais e trechos de terça. A área inclinada do exemplo é 200,997512 m². O comprimento de cada peça é geométrico entre eixos; não inclui descontos ou cortes de fabricação.

Perfis podem ser informados na estrutura ou copiados dos dados técnicos do catálogo. Massa é calculada apenas onde houver kg/m. A lista mantém dados ausentes como pendentes. A revisão do engenheiro aparece **depois dos resultados**, sem caixa de aprovação ou bloqueio do download por falta de revisão. PDF e Excel incluem as pendências. Apenas ausência de geometria calculável ou falha de salvamento impede a emissão correspondente.

**Estado do produto:** geração geométrica e quantitativos implementados; análise experimental de tesoura com cargas nodais disponível no painel técnico; dimensionamento por resistência, seleção automática de perfis e verificações normativas ainda não implementados. A aprovação final do engenheiro não substitui essas implementações. Ligações, chapas, fixadores, soldas, contraventamentos, corte e telhas comerciais não estão quantificados. O desenho e a lista não constituem projeto executivo completo.

Consulte o [diagnóstico e arquitetura](docs/PLANEJAMENTO-TECNICO.md) e o [plano do dimensionamento automático](docs/DIMENSIONAMENTO.md). AutoCAD/DXF fica na última etapa.

## Orçamento de venda preservado

Dentro do projeto, selecione **Orçamento de venda** para usar o fluxo comercial anterior:

1. Abra **Novo projeto** e informe nome da obra e cliente. Clique em **Salvar e continuar**.
2. Em **Medidas**, preencha largura, comprimento, altura do lado mais baixo e inclinação. Aceita vírgula: `6,50`.
3. Confira a cobertura em **De cima**, **De frente** e **De lado**. Arraste para mover, use dois dedos ou os botões para ampliar e **Ajustar à tela** para voltar.
4. Em **Materiais**, selecione um item ou cadastre outro sem sair da obra. Informe a quantidade manualmente ou escolha uma regra compatível com a unidade.
5. Em **Custos**, inclua mão de obra, despesas, ganho e, se necessário, encargos explicitamente informados.
6. Em **Resumo → Entregar o orçamento**, confira o serviço, preencha pagamento, prazo e validade e clique em **Baixar orçamento em PDF**. Abra o arquivo e anexe no WhatsApp ou e-mail do cliente.
7. Em **Planilha para uso interno**, baixe o XLSX com custos e lucro. As células exportadas são valores da emissão; alterações na planilha não recalculam o orçamento. Recalcule no sistema.

O PDF contém empresa, cliente, obra, escopo, valor total, condições, exclusões e observações comerciais. Não inclui preços de compra, lucro, margem nem notas técnicas internas. Projetos fictícios recebem identificação no documento. O número de referência identifica o projeto; cada emissão reflete os dados atuais, sem histórico imutável de propostas. Informações da empresa vêm de Configurações.

Os campos comerciais são compatíveis com backups v2 anteriores: iniciam vazios e precisam ser preenchidos antes de emitir o PDF. Nenhuma condição de pagamento ou validade é presumida para projetos existentes. A geração ocorre no navegador; não há envio automático nem serviço de armazenamento dos arquivos.

A navegação tem cinco passos, campos e botões maiores, exemplos ao lado dos campos e detalhes técnicos opcionais. Os dados válidos são salvos automaticamente após 600 ms. Projetos incompletos podem ser salvos para continuar depois; itens sem quantidade, preço ou conversão impedem a exibição de um preço de venda completo.

### Exemplo pronto

O exemplo automático antigo da garagem foi descontinuado. Ao abrir a nova versão, o aplicativo remove apenas os **três exemplos nativos antigos identificados por ID**, e materiais fictícios do catálogo anterior que não sejam referenciados por outros projetos. Projetos reais, cópias e materiais ainda referenciados são preservados. A remoção não recria automaticamente exemplos: use os dois botões da página inicial quando quiser uma nova demonstração. Depois de instalados, os exemplos são reutilizados ao abrir novamente; não acumulam cópias. Os preços e dimensões são sempre fictícios.

- Largura: 6 m; comprimento: 10 m; altura baixa: 3 m; inclinação: 10% pela largura.
- Área horizontal: 60 m²; área real: aproximadamente 60,299254 m².
- Telha por m²: área real, 5% de perdas, R$ 80/m² → compra de 63,315 m².
- Perfil: 24 m manuais, compra em barras de 6 m → quatro barras de R$ 250.
- Fixadores: 100 unidades manuais de R$ 2,50.
- Mão de obra: dois dias de R$ 600; transporte: R$ 350.
- Custo: **R$ 7.865,20**; markup: 25%; venda: **R$ 9.831,50**; lucro bruto: **R$ 1.966,30**; margem bruta: 20%.

As seções visuais são fictícias e NÃO constituem seleção técnica de perfis ou cálculo resistente. Ligações, soldas, contraventamentos, fundações, revestimentos e consumíveis podem estar ausentes do orçamento ilustrativo. Nunca utilize estes valores para comprar material, cortar peças ou executar a obra.

Uma cópia exportada pelo aplicativo está em [examples/cobertura-garagem.json](examples/cobertura-garagem.json). Pode ser importada nas configurações, adicionando uma nova cópia do projeto.

## Instalação

Ambiente: Node.js 24, pnpm 12.15.0. Dependências resolvidas no `pnpm-lock.yaml`.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Acesse http://localhost:3000. No PowerShell sem pnpm global ou com scripts bloqueados:

```powershell
npx.cmd --yes pnpm@12.15.0 install --frozen-lockfile
npx.cmd --yes pnpm@12.15.0 dev
```

Não é necessário mudar a política do PowerShell. Para produção:

```sh
pnpm build
pnpm start
```

## Testes

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm exec playwright install chromium
pnpm test:e2e
pnpm build
```

Os testes unitários incluem conversões m/mm/m², área e inclinação, quatro sentidos de queda, entidades geométricas, apoios, quantidades e perdas, compra por barra, centavos, margem versus markup, encargos, informações pendentes, atualização da geometria e do orçamento, serialização, migração v1/v2/v3→v4, importação sem sobrescrita e falhas de armazenamento.

Playwright verifica cadastro completo até o orçamento, números brasileiros, alteração de medidas, recarga, CRUD de projetos, catálogo, backup, configurações, corrupção de dados, zoom/pan por gestos de toque e cinco etapas preenchidas em larguras de 320, 390, 768 e 1440 px. As capturas ficam em `test-results/`. Os testes usam Chromium e emulação de toque; não equivalem a teste em Safari iOS ou Chrome Android físicos.

Histórico da v0.5.0: **47 testes unitários e 14 testes de navegador aprovados; TypeScript e lint sem erros; build de produção aprovado**. Os testes reabrem PDF e XLSX para conferir conteúdo, valores e separação dos dados internos, verificam paginação, compatibilidade dos campos novos, persistência e falha de armazenamento. Jornadas comerciais em 320, 390, 768 e 1440 px e de levantamento em 390 e 1440 px passaram no navegador. O build de produção teve abertura do novo exemplo, desenho e download PDF conferidos em viewport móvel; o documento também foi revisado visualmente; dispositivos físicos ainda não foram testados.

## Tecnologias e estrutura

### Histórico da auditoria inicial — anterior à integração v0.6

Foi acrescentado um pacote Python independente em [`engine/`](engine/README.md), sem integração automática às telas: treliças planas articuladas, análise elástica linear de primeira ordem, reações, esforços axiais e deslocamentos em SI. NumPy/SciPy fazem a álgebra linear; PyNiteFEA 3.2.1 é o referencial independente de testes. Instalação e execução completa estão no README do pacote.

A execução local registrou **1.183 testes Python, 48 testes Vitest e 14 testes de navegador aprovados**, sem testes ignorados; TypeScript, lint e build aprovados. Inclui 1.000 geometrias com sementes fixas comparadas ao PyNite, soluções analíticas, equilíbrio, compatibilidade, energia e rejeição de mecanismos. Consulte o [relatório da auditoria](docs/AUDITORIA-MOTOR.md) e a [evidência estruturada](docs/validation/2026-10-30/structural.json).

O histórico citado de outro protótipo com 20 testes não estava nesta cópia do repositório; os resultados acima pertencem à implementação identificada nos arquivos de evidência. O núcleo permanece experimental, sem verificações normativas, flambagem, flexão ou autorização para uso em projetos reais. A interface continua gerando geometria/quantitativos, sem executar análise resistente. Foi corrigido o arredondamento do número de vãos para respeitar o espaçamento máximo informado.

Next.js App Router, React, TypeScript strict, Tailwind/PostCSS, Lucide, Zod, Context API, Vitest e Playwright. Sem APIs pagas, banco remoto ou credenciais. A documentação compatível do Next está em `node_modules/next/dist/docs/`.

```text
src/app/                              Rotas e layout responsivo
src/components/projects/              Cadastro e navegação em cinco passos
src/components/geometry/              Formulário e renderização SVG interativa
src/components/estimates/             Materiais, custos e resumo
src/components/materials/             Formulário de catálogo
src/components/data-provider.tsx      Estado compartilhado e fila de salvamento
src/domain/models.ts                  Project, Settings, Snapshot e migração
src/domain/project-details.ts         Contratos de geometria e orçamento
src/domain/calculations/geometry.ts    Motor geométrico puro em milímetros
src/domain/calculations/estimate.ts    Quantitativos e cálculo financeiro puro
src/domain/calculations/units.ts       Conversões e formatação de medidas
src/domain/example.ts                 Exemplo fictício explicitamente identificado
src/domain/repositories.ts            Project/Material/SettingsRepository
src/infrastructure/persistence/       Adaptador local, backups e testes
tests/e2e/                            Jornadas de navegador e responsividade
```

## Persistência, compatibilidade e backup

Uma única estrutura JSON armazena projetos, materiais, configurações e revisões preliminares em `version: 4`. A chave física `jpn-projetos:v1` continua a mesma. Snapshots v1/v2/v3 são validados e migrados em memória; projetos v1/v2 sem levantamento recebem `planning: null`, enquanto a configuração dos projetos v3 é preservada, assim como orçamento e medidas. A próxima gravação persiste v4. Versões desconhecidas são rejeitadas. O modelo de peças é derivado, não armazenado no backup; a configuração e as cópias dos perfis são preservadas. A importação continua criando cópias e não altera configurações locais.

Zod valida leitura e gravação. localStorage só é acessado na infraestrutura, após a hidratação do cliente. Os repositórios isolam o armazenamento das telas. Uma futura implementação remota exigirá adaptar a coordenação assíncrona, autenticação e concorrência; não há Supabase implementado.

No primeiro passo, **Salvar e continuar** cria o cadastro. As demais alterações válidas usam debounce de 600 ms, com tentativa de gravação ao ocultar ou fechar a página. Falha de espaço, bloqueio do navegador ou conflito entre abas produz aviso e permite exportar os dados pendentes. Dados corrompidos bloqueiam gravações e podem ser baixados para recuperação. A recarga explícita após um conflito também reinicializa os formulários.

Backups JSON têm validação, prévia e limite de 5 MB. A importação sempre adiciona cópias com novos IDs, preserva configurações locais e remapeia as referências dos materiais importados. O preço, nome, unidades e fator de conversão de cada item são copiados para o projeto: alterar ou excluir o material do catálogo não modifica orçamentos anteriores. As configurações estão no backup, mas sua restauração é manual nesta versão.

As comparações antes da escrita e os eventos de armazenamento detectam conflitos entre abas; localStorage não oferece transação entre abas. Edite em uma aba por vez. Os dados pertencem ao navegador e à origem: `localhost` e `127.0.0.1` são espaços diferentes. Não há nuvem, autenticação, criptografia própria ou sincronização entre computador e celular. Exporte backups regularmente. Não são armazenados arquivos grandes ou imagens em base64.

## Geometria

O motor recebe medidas horizontais em metros e gera um **GeometryModel em milímetros** com planta, frente, lateral, linhas, círculos simbólicos de apoios, eixos e textos/cotas. O SVG consome esse modelo; futuros exportadores usarão o mesmo modelo.

Para queda pela largura:

```text
desnível = largura × inclinação / 100
comprimento inclinado = hypot(largura, desnível)
área real = comprimento × comprimento inclinado
altura alta = altura baixa + desnível
```

Para queda pelo comprimento, largura e comprimento trocam de papel nas duas primeiras fórmulas, e a área usa a largura como extensão transversal. O sentido positivo leva a água para a direita (X) ou o fundo (Y); o sentido negativo leva para esquerda ou frente. A origem é o canto frontal esquerdo da planta. Apoios são pontos fornecidos pelo usuário, projetados em todas as vistas. Apoios fora do contorno, incompletos ou duplicados são sinalizados e bloqueiam a regra de contagem.

Não são gerados pilares, vigas ou terças inferidos. Perfis recebidos podem ser descritos, sem dimensionamento automático. Alterações incrementam a revisão geométrica, mantêm o estado técnico preliminar e mostram a necessidade de rever itens manuais e especificações. Medidas aceitam até 1.000 m, inclinação de 0 a 100%; zero é permitido geometricamente e recebe aviso de drenagem.

## Quantidades e finanças

Regras disponíveis: quantidade manual, área real da cobertura (m²), um comprimento inclinado (m) e contagem de apoios explicitamente informados (un). Não se calcula número de telhas pela área: dimensões úteis, sobreposições e configuração do fabricante continuam pendentes.

```text
quantidade de compra = quantidade medida × (1 + perdas / 100) / fator de conversão
subtotal = quantidade final de compra × preço por unidade de compra
```

Unidades iguais usam fator 1. Unidades diferentes exigem informar quantas unidades de medição há em cada unidade de compra. Não há conversões presumidas. Compras em un/barra arredondam para cima ao inteiro; m, m² e kg arredondam para cima a 0,001. Regras geométricas usam seis casas na quantidade-base; o desenho preserva a geometria de ponto flutuante. Percentuais aplicados usam duas casas decimais; padrões legados são arredondados a essa precisão ao criar novos itens/projetos.

Preços são armazenados em **centavos inteiros**. Produtos e divisões financeiras usam BigInt com arredondamento de metade para cima; BigInt não é serializado no backup. Valores acima do limite inteiro seguro bloqueiam o preço. Zero é um custo explicitamente informado; campo vazio permanece pendente.

```text
direto = materiais + mão de obra + despesas
base = direto + encargos sobre direto
C = base + encargos sobre venda
P = preço de venda

Markup m: P = C × (1 + m)
Margem m: P = C / (1 - m)
```

Com taxa total `t` sobre venda, o motor resolve:

```text
Markup: P = base × (1 + m) / (1 - t × (1 + m))
Margem: P = base / (1 - m - t)
```

`m` e `t` são proporções nessas fórmulas, por exemplo 25% = 0,25. Denominador zero ou negativo bloqueia o preço. Encargos sobre custo incidem sempre na soma direta e não uns sobre os outros. Cada encargo é arredondado em centavos; pode haver variação residual de centavos na margem efetiva, apresentada no resumo. Não existem alíquotas presumidas. O lucro é bruto estimado, não resultado líquido contábil.

O dashboard soma somente preços calculáveis de projetos reais não arquivados. Uma informação técnica pendente não transforma o orçamento em aprovação de engenharia. O status Finalizado continua sendo informado pelo usuário.

## Limitações e próxima etapa

- Fase 4 parcial: PDF comercial e XLSX interno disponíveis. PDF interno detalhado, DXF e compartilhamento nativo permanecem pendentes. Downloads podem ser anexados manualmente.
- O desenho permanece identificado como **DESENHO PRELIMINAR — NÃO UTILIZAR PARA EXECUÇÃO**. Há análise experimental de tesoura isolada; não há aprovação de capacidade de carga, ligações, fundações ou ART.
- Outros tipos de estrutura aceitam orçamento manual, mas não possuem gerador geométrico nesta versão. Duas águas simétricas já estão disponíveis; outras tipologias permanecem pendentes.
- Há simulação FFD de aproveitamento, sem ordem de corte: quantidades dependem das peças, da serra e das perdas informadas.
- Despesas ausentes ficam claramente sinalizadas. Itens incompletos bloqueiam a venda; custos conhecidos continuam visíveis como parciais.
- Antes do primeiro salvamento, voltar pelo histórico do navegador pode descartar o cadastro novo. Links internos e fechamento recebem proteção quando há um formulário não salvo; o histórico nativo não é interceptado.
- Não há PWA instalável, cache offline testado ou sincronização. Há revisões do levantamento; propostas emitidas ainda não possuem histórico imutável completo.

Veja [ROADMAP.md](ROADMAP.md) para os próximos incrementos.
