# JPN Projetos — v0.4.0

Sistema local de projetos e orçamentos de estruturas metálicas. Cadastro, geometria de cobertura de uma água, catálogo e orçamento implementados. A entrega comercial agora inclui **PDF para o cliente e planilha XLSX interna**. CAD permanece para a próxima etapa.

## Como usar

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

Na primeira abertura desta versão, é adicionado uma única vez **EXEMPLO — Cobertura da garagem**, sem alterar projetos existentes. O dashboard tem o botão **Abrir exemplo**. Todos os preços e quantitativos manuais são identificados como fictícios. O exemplo e seus materiais podem ser editados ou excluídos; sua exclusão não provoca recriação automática. Estatísticas comerciais do dashboard não somam exemplos.

- Largura: 6 m; comprimento: 10 m; altura baixa: 3 m; inclinação: 10% pela largura.
- Área horizontal: 60 m²; área real: aproximadamente 60,299254 m².
- Telha por m²: área real, 5% de perdas, R$ 80/m² → compra de 63,315 m².
- Perfil: 24 m manuais, compra em barras de 6 m → quatro barras de R$ 250.
- Fixadores: 100 unidades manuais de R$ 2,50.
- Mão de obra: dois dias de R$ 600; transporte: R$ 350.
- Custo: **R$ 7.865,20**; markup: 25%; venda: **R$ 9.831,50**; lucro bruto: **R$ 1.966,30**; margem bruta: 20%.

Não há apoios, bitolas, soldas ou ligações inventados nesse exemplo. Ele ensina geometria e orçamento; não é um projeto de fabricação nem uma cotação de mercado.

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

Os testes unitários incluem conversões m/mm/m², área e inclinação, quatro sentidos de queda, entidades geométricas, apoios, quantidades e perdas, compra por barra, centavos, margem versus markup, encargos, informações pendentes, atualização da geometria e do orçamento, serialização, migração v1→v2, importação sem sobrescrita e falhas de armazenamento.

Playwright verifica cadastro completo até o orçamento, números brasileiros, alteração de medidas, recarga, CRUD de projetos, catálogo, backup, configurações, corrupção de dados, zoom/pan por gestos de toque e cinco etapas preenchidas em larguras de 320, 390, 768 e 1440 px. As capturas ficam em `test-results/`. Os testes usam Chromium e emulação de toque; não equivalem a teste em Safari iOS ou Chrome Android físicos.

Verificação desta entrega: **39 testes unitários e 11 testes de navegador aprovados; TypeScript e lint sem erros; build de produção aprovado**. Os testes reabrem PDF e XLSX para conferir conteúdo, valores e separação dos dados internos, verificam paginação, compatibilidade dos campos novos, persistência e falha de armazenamento. Jornadas em 320, 390, 768 e 1440 px passaram contra o build de produção. Download de PDF em viewport móvel e visual do documento foram conferidos; dispositivos físicos ainda não foram testados.

## Tecnologias e estrutura

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

Uma única estrutura JSON armazena projetos, materiais e configurações. O documento agora usa `version: 2`. A chave física `jpn-projetos:v1` foi mantida para localizar os dados já existentes. Documentos e backups da Fase 1 são validados com o schema antigo e migrados em memória; novos campos ficam vazios, sem medidas ou custos inventados. A próxima gravação persiste a versão 2. Documentos de versões desconhecidas são rejeitados.

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
- O desenho permanece identificado como **DESENHO PRELIMINAR — NÃO UTILIZAR PARA EXECUÇÃO**. Não há cálculo estrutural, capacidade de carga, ligações, fundações ou ART.
- Outros tipos de estrutura aceitam orçamento manual, mas não possuem gerador geométrico nesta versão. Duas águas pertence à fase posterior.
- Não há plano de corte: quatro barras não garantem aproveitamento de cortes de peças específicas.
- Despesas ausentes ficam claramente sinalizadas. Itens incompletos bloqueiam a venda; custos conhecidos continuam visíveis como parciais.
- Antes do primeiro salvamento, voltar pelo histórico do navegador pode descartar o cadastro novo. Links internos e fechamento recebem proteção quando há um formulário não salvo; o histórico nativo não é interceptado.
- Não há PWA instalável, cache offline testado, sincronização nem histórico de revisões completo.

Veja [ROADMAP.md](ROADMAP.md) para os próximos incrementos.
