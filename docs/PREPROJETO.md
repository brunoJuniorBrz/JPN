# JPN v0.6 — pré-projeto, levantamento e proposta

Data da execução: 30/10/2026. Esta versão evolui o aplicativo existente; não implementa dimensionamento normativo ou liberação de fabricação.

## Fluxo disponível de ponta a ponta

1. Na página inicial, escolher **Abrir exemplo completo de pré-projeto** ou criar a própria obra. O exemplo só é instalado ao clicar, sem substituir os anteriores. Medidas, perfis, propriedades, preços e cargas do exemplo são **fictícios**.
2. Em **Medidas**, informar o retângulo entre linhas extremas de tesouras, altura baixa, inclinação e eixo transversal. Em **Estrutura**, escolher uma água ou duas águas simétricas; configurar espaçamentos, altura da tesoura, painéis e prolongamentos longitudinais das terças.
3. Cadastrar perfis por categoria ou copiar do catálogo. Preço por metro e propriedades técnicas são opcionais para o levantamento. Massa desconhecida permanece pendente; para análise são exigidos E, área, fonte/data e referência do cálculo quando a origem for calculada.
4. Em **Resultado**, conferir peças, comprimentos entre eixos, massas declaradas e vistas. **Visualizar em 3D** carrega Three.js sob demanda; arrastar gira, gesto de dois dedos amplia/desloca. A grade informa metros por célula. Há seleção, destaque e quantidade de peças equivalentes. Sem WebGL2, usar as vistas SVG 2D, com cotas opcionais.
5. Em **Aproveitamento**, informar espessura de serra, perda em cada extremidade e sobra mínima. Zero é uma informação explícita. O comprimento comercial vem de cada perfil; a distribuição é uma simulação FFD, com peças, sobras, resíduos, aproveitamento e estimativa de barras por grupo. Pode-se registrar comprimentos finais por peça, mas **nenhuma simulação desta versão libera corte**.
6. **Atualizar quantitativos no orçamento** transfere comprimentos por categoria e cópias de preços por metro. Não duplica os itens vinculados; preserva os demais materiais e preços já editados. Em **Orçamento de venda**, acrescentar fabricação, instalação, equipamentos, transporte e despesas como serviços/itens explícitos; configurar perdas, encargos, markup/margem e condições. Os cálculos financeiros anteriores em centavos/BigInt foram preservados.
7. Emitir proposta PDF com itens/quantidades, valor de venda e condições; custo de compra e lucro permanecem internos. A planilha interna existente continua disponível. Não se deduz compra de barras a partir do simples total em metros; a simulação é um planejamento separado.
8. **Revisões e desenhos** registra cópias preliminares da geometria, perfis e configurações técnicas; exporta DXF 3D em mm e SVG frontal. PDF/XLSX de levantamento incluem pendências, IDs e comprimentos geométricos/finais declarados. O PDF de levantamento também inclui planta/frente/lateral. Documentos identificam o caráter preliminar.

Backup reproduzível: [examples/preprojeto-duas-aguas.json](../examples/preprojeto-duas-aguas.json). Importar em Configurações adiciona uma cópia; não altera projetos existentes. O mesmo exemplo é produzido por `src/domain/preproject-example.ts` e verificado por testes.

## Modelagem e limites físicos

O `StructureModel` continua sendo a fonte dos nós e peças em mm. Duas águas usa cumeeira central, mesma inclinação nos dois lados e número **par** de painéis, garantindo divisão do banzo na cumeeira. A área desenvolvida é `comprimento × 2 hypot(vão/2, desnível de meia água)`. Painéis ímpares são recusados, não corrigidos silenciosamente. Sentidos de queda definem o eixo; em duas águas as setas indicam as duas direções.

Balanços suportados são **longitudinais**, explicitamente informados, prolongando somente as terças além das primeiras/últimas linhas de tesouras. Acrescentam comprimentos e área de cobertura. Não há balanço transversal da tesoura, deslocamento arbitrário de pilares ou distribuição irregular de vãos. A distância entre tesouras é uniforme e limitada pelo máximo informado; uma distribuição irregular exige outra tipologia.

O desenho de peças representa interseções geométricas; não inventa ligações entre terças e pontos internos dos banzos. Não deduz contraventamento, rigidez de ligação, fundação, chumbadores, chapas, furação ou solda. As vistas de medidas mostram o envelope entre tesouras; o modelo de peças mostra também os prolongamentos. Uma geometria calculável não comprova estabilidade ou resistência.

## Análise integrada e protegida contra obsolescência

O painel **Análise disponível** recebe a configuração explícita de **uma tesoura T1 isolada**. Pilares, terças, seus balanços e o restante do conjunto 3D são excluídos por contrato e explicados no painel. Essa seleção é uma seção geométrica para análise declarada, não a análise da cobertura completa. O usuário precisa declarar a hipótese articulada e informar apoios e todas as componentes de cargas nodais. A interface oferece vínculos cartesianos em zero; o contrato da API também suporta deslocamentos prescritos.

O adaptador seleciona apenas barras T1, identifica seus nós reais e converte:

| Entrada na interface | Contrato do solver |
| --- | --- |
| coordenadas/deslocamentos mm | m: dividir por 1.000 |
| cargas kN | N: multiplicar por 1.000 |
| E em GPa | Pa: multiplicar por 1.000.000.000 |
| área em cm² | m²: multiplicar por 0,0001 |

Fonte/data são exigidas para E/A; não são inferidas do nome, massa linear ou aço. Propriedades calculadas precisam de referência própria. Não são calculados vento, peso próprio, combinações, flexão, flambagem, dinâmica, resistência ou segunda ordem. Uma carga fora dos nós ou apoio não representável requer outro modelo e não deve ser forçada neste solver.

`POST /api/analysis` valida o contrato Zod, limita o corpo a 500 kB, confere a origem da chamada de navegador e entrega os dados ao motor. Respostas são validadas: esquema, valores finitos, IDs de nós/barras e, no serviço remoto, SHA-256 do corpo enviado. O resultado contém o SHA-256 normalizado calculado pelo motor, versão do motor/NumPy/SciPy, hipóteses, resíduos, deslocamentos, reações e axiais com sinal de tração/compressão. Erros não geram tabelas com zeros substitutos.

O conteúdo de geometria/perfis é serializado em ordem canônica para identificar dependências. Modificações invalidam cargas/vínculos anteriores; o usuário os reconfigura conscientemente. Mudança de cargas, apoios ou hipótese também oculta o resultado anterior. Uma resposta que chega depois de alteração das entradas é descartada. Resultados são transitórios: após recarregar a página é necessário analisar novamente; inputs permanecem no projeto. A identificação canônica do frontend não é uma assinatura digital; o hash criptográfico de análise vem do solver.

Quantitativos transferidos guardam IDs das peças, categoria e a identidade da configuração. Alterar a geometria/perfil bloqueia a emissão do orçamento vinculado até atualizar os quantitativos. Comprimentos finais declarados também ficam desatualizados. Notas/perfis integram essa identidade de modo conservador: mudanças podem exigir revisão mesmo sem alterar comprimentos.

## Aproveitamento: algoritmo, conservação e significado

Produção usa **First Fit Decreasing**: ordena peças por comprimento decrescente e coloca cada uma na primeira barra com capacidade. É uma heurística simples e auditável, sem alegação de mínimo global. Uma instância de regressão `[4,4,3,3,3,3]` em barras de 10 resulta em 3 barras na FFD, embora o ótimo comprovado por partição exaustiva seja 2 (`4+3+3`, duas vezes). Testes não escondem esse limite.

O cálculo usa micrômetros inteiros: consumos arredondados para cima e comprimento de estoque para baixo. Para cada peça há uma perda de serra conservadora, inclusive na última peça; há ainda a perda explicitada em **cada** ponta. Invariante por barra: peças + serra + pontas + sobra = estoque representado. Sobra abaixo do mínimo reaproveitável compõe desperdício; sobra acima do mínimo é discriminada como reutilizável. Uma peça que não cabe após as perdas impede o plano completo; não é omitida.

Perfis/grupos só são misturados quando as especificações declaradas completas coincidem. Cada perfil usa o comprimento comercial escolhido naquele cadastro. Seleção automática entre vários comprimentos comerciais, aproveitamento de retalhos existentes, otimização por preço e programação inteira não foram implementados. Foi avaliada a [formulação MIP de bin packing do OR-Tools](https://developers.google.com/optimization/pack/bin_packing); não foi incorporada uma dependência grande para apresentar a heurística como ótima.

Sem comprimentos finais, o plano usa medidas geométricas e informa a limitação. Mesmo com comprimentos finais declarados, faltam aprovação técnica verificável, ligações, tolerâncias e liberação de revisão de fabricação. Por isso o estado permanece `simulation_only`, sem ordem de corte ou documento liberado.

## Persistência e revisões

Snapshots passam a **v4**, mantendo a chave física `jpn-projetos:v1`. v1/v2/v3 migram em memória para v4; a leitura não regrava os dados. Medidas, custos e materiais antigos são preservados; novos campos começam vazios ou no comportamento anterior sem balanço. Versões desconhecidas continuam recusadas.

Revisões são cópias de geometria, perfis e configurações do levantamento, limitadas a 20 por projeto. Registros existentes não podem ser modificados nem removidos pelo repositório; copiar uma revisão altera somente o rascunho e mantém o histórico. Não se trata de histórico imutável de propostas comerciais, aprovação profissional, autenticação ou trilha externa de auditoria. O dono dos dados locais pode editar um backup; não há assinatura criptográfica de aprovação.

localStorage foi mantido para preservar o fluxo transacional local existente e limitar a mudança de infraestrutura. Resultados FE transitórios e arquivos CAD/PDF não são persistidos em base64. O commit recusa um conjunto que produziria backup acima de 5 MB, preservando o estado anterior, e a interface mantém avisos de falha de salvamento. O limite prático do navegador pode ser menor; continua necessário exportar backups. Histórico maior, anexos e múltiplos usuários justificariam IndexedDB/backend, mas não foram prometidos sincronização ou armazenamento remoto.

## Execução local

Node 24 e pnpm 12.15.0; Python 3.12:

```sh
pnpm install --frozen-lockfile
python -m venv .venv
```

PowerShell, sem ativar scripts:

```powershell
.venv\Scripts\python.exe -m pip install -r engine/requirements-validation.lock
.venv\Scripts\python.exe -m pip install --no-build-isolation --no-deps -e ./engine
pnpm dev
```

O adaptador encontra `.venv/Scripts/python.exe` no Windows ou `.venv/bin/python` no Linux. Neste ambiente de trabalho também encontra o Python portátil já preparado em `.tools/python/python.exe`. Pode-se definir `JPN_PYTHON_EXECUTABLE` com o caminho absoluto de um Python que tenha o pacote instalado. Não há comandos de shell montados com dados de projeto: o processo recebe JSON por stdin e executa apenas `python -m jpn_structural`.

## Implantação

Há dois modos testados:

- **Servidor Node com Python local:** instalar o pacote no venv, configurar o caminho do Python e executar `pnpm build` / `pnpm start`. Processo sem janela no Windows, limite de 20 s, resposta limitada e até duas análises simultâneas por instância Node.
- **Next + serviço Python separado:** executar `python -m jpn_structural.service --host 127.0.0.1 --port 8010`; configurar `JPN_ANALYSIS_URL=http://127.0.0.1:8010/analyze` no Node. Para implantação em hosts diferentes, fornecer URL HTTPS e `JPN_ANALYSIS_TOKEN` nos dois servidores. A variável nunca deve usar prefixo `NEXT_PUBLIC_`. O serviço exige token ao escutar fora de loopback, limita entrada/concorrrência, executa cada análise em worker separado e impõe timeout de 20 s. Deve ficar atrás de proxy TLS e controles de acesso/limite de uso da infraestrutura.

No **Vercel**, o adaptador exige o serviço remoto; não presume a presença de executável Python no runtime Node. Sem `JPN_ANALYSIS_URL`, somente a análise retorna indisponível; geometria, corte simulado, orçamento e documentos continuam funcionando. [Vercel documenta runtimes distintos](https://vercel.com/docs/functions/configuring-functions/runtime) e [limites de função](https://vercel.com/docs/functions/limitations); o pacote científico deve ser implantado no runtime apropriado, com os limites medidos. O proxy Node mantém o token do serviço fora do navegador.

`engine/Dockerfile`, com contexto de build `engine/`, prepara um serviço Python de usuário não root. A imagem Docker não foi construída/executada neste ambiente; foram executados os mesmos adaptadores como processos e HTTP locais. Não há credenciais de hospedagem/Vercel disponíveis, portanto nenhuma implantação pública é declarada. O servidor HTTP padrão é um adaptador privado para integração; TLS, autenticação de usuários e limites globais de uso devem ser configurados na borda antes de expô-lo publicamente. A concorrência de duas análises é por processo, não um limite global de múltiplas réplicas.

## Bibliotecas e validação

| Biblioteca | Papel | Licença |
| --- | --- | --- |
| Three.js 0.187.0 / @types/three 0.187.0 | visualização 3D e OrbitControls | MIT |
| @tarikjabiri/dxf 2.10.0 | escrita DXF | MIT |
| dxf-parser 1.1.2 | leitor independente nos testes JS | MIT |
| ezdxf 1.4.5 | segunda leitura/auditoria DXF nos testes Python | MIT |
| NumPy 2.5.4 / SciPy 1.18.1 | cálculo estrutural, preservados | licenças BSD e componentes conforme auditoria anterior |
| PyNiteFEA 3.2.1 | comparação independente, preservado | MIT |

APIs foram conferidas na documentação primária e/ou nos tipos/fontes instalados: [OrbitControls](https://threejs.org/docs/pages/OrbitControls), [DXF writer](https://dxf.vercel.app/), [ezdxf](https://ezdxf.readthedocs.io/en/stable/), documentação local de Next 16.4.3 para route handlers/lazy loading. Lockfile JS e lock de validação Python fixam as dependências; avisos de depreciação transitiva do ecossistema anterior permanecem identificados pelo instalador, sem atualização ampla fora do escopo.

Com Python/JS instalados, executar:

```sh
python engine/validate.py
pnpm typecheck
pnpm lint
pnpm test
python tests/verify_dxf.py
pnpm exec playwright install chromium
pnpm test:e2e
pnpm build
```

Usar o executável do venv nos comandos Python. `pnpm test` gera o DXF de referência em `test-results/cad/`; executar a auditoria ezdxf **antes** do Playwright, que limpa seu diretório de resultados ao iniciar. Não executar build e servidor de teste simultaneamente sobre a mesma `.next/`. Os testes de integração JS chamam Python real e exigem o pacote instalado, inclusive em CI. A workflow foi atualizada para preparar esse ambiente.

## Pendências e prioridades

1. Dimensionamento/licenças das normas, cargas normativas, flambagem e ligações continuam dependentes de engenharia complementar e validação independente; a análise disponível permanece experimental.
2. Otimização exata e comparação de estoques/compras de vários comprimentos são próximas evoluções comerciais; a simulação atual conserva materiais e informa a ausência de prova de ótimo.
3. Implantar e medir o serviço em infraestrutura autenticada; ampliar validação em aparelhos físicos e CAD AutoCAD, que não estava disponível. DXF passou em leitores independentes; isso não equivale a abrir o arquivo no AutoCAD.

O sistema não emite documentação de fabricação aprovada. Revisão visual, convergência, propriedades declaradas, revisão preliminar e aprovação estrutural são estados diferentes e não são convertidos automaticamente entre si.
