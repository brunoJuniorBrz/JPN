# Resistência Ue/MRD: incremento executável após as fontes fornecidas

**Atualização M31:** a [auditoria posterior](MISSAO-31-AUDITORIA-EVOLUCAO-ESTRUTURAL.md)
corrige vetores incompletos, encerramento de processos Windows e a avaliação
numérica dos espaços cFSM. Resultados automáticos do avaliador `/2` precisam
ser recalculados pelo `/3` antes de compor um relatório atual. As evidências
históricas abaixo são preservadas, sem promover aprovação da peça/estrutura.

Branch `feat/m27-m30-structural-engine-complete`, continuação do PR draft #37.
Sem merge, deploy ou alteração das hipóteses dos projetos existentes.

> A continuação da auditoria do commit `aa80040` está registrada ao final deste
> documento. Ela substitui as classificações PASS baseadas em dados externos
> pelos estados condicionais do contrato de resultado `/2`. A tabela de testes
> original abaixo é histórica; consulte as evidências `continuation/` para a
> execução atual.

**Resultado:** há uma cadeia local executável entre geometria física,
propriedades calculadas, solver misto real e procedimentos resistentes da
NBR 14762:2010. **O domínio completo M27–M30 continua NÃO PRONTO.** Não há
aprovação da peça inteira, da estrutura ou para fabricação. Este incremento
não anuncia Ue ou I/W como famílias integralmente dimensionadas.

## O que passou a executar

| Procedimento | Implementação e limite |
|---|---|
| C.3.1–C.3.3 | Compressão MRD, mínimo global/local/distorcional e coeficiente resistente 1,20. Exige N constante na peça original e estudo elástico explicitamente revisado. |
| C.4.1–C.4.3 | Flexão MRD por eixo e sinal, mínimo dos três modos e coeficiente resistente 1,10. Não inventa forças ou momentos críticos. |
| C.5 | Função independente de inércia efetiva de serviço; não substitui silenciosamente os deslocamentos calculados com seção bruta. |
| 9.6.2 | Tração: escoamento bruto, ruptura líquida fora da ligação e ruptura efetiva na ligação. Áreas/Ct declarados, ou hipótese explícita sem furos/recortes e com todos os elementos ligados por soldas. Isso não verifica a resistência das soldas. |
| 9.7.4 | Verificação separada de esbeltez geométrica sob compressão. |
| 9.8.3 | Cortante de uma única alma sem enrijecedores transversais, kv=5, três ramos. Usa altura plana e espessura físicas. Não verifica esmagamento da alma/introdução localizada de carga. |
| 9.9 | Interação de N constante com momentos concomitantes. Procura extremos do polinômio de utilização entre mudanças de sinal e cortes, conservando a posição na peça original e o vetor de seis esforços. |

Torção/empenamento resistente, cortante no outro eixo e interação flexão–cortante
9.8.4 permanecem bloqueados quando solicitados. Esta última exige a capacidade
de seção de 9.8.2.1; não a substituímos por um valor MRD interpretado sem validação.
Não basta passar nos procedimentos acima para concluir uma peça: ligações,
estabilidade global, segunda ordem, ações normativas e demais modos pertinentes
continuam separados. Em particular, o solver misto permanece de primeira ordem.

As equações foram conferidas nas páginas numeradas 34–36, 50–53 e 74–77 da
NBR 14762:2010 fornecida. As pequenas descontinuidades decorrentes dos
coeficientes normativos arredondados foram mantidas, sem suavização artificial.
As fórmulas não foram copiadas de código de terceiros sem licença.

## Geometria, unidades e integridade

O worker admite `jpn.verified-coldformed/1`: recalcula a seção com
sectionproperties 3.10.2, compara A/Iy/Iz/Wy/Wz/J com as propriedades utilizadas
e só então executa `jpn.coldformed-design/1`. Este último é o contrato do núcleo
aritmético; o endpoint não permite usá-lo para contornar a geometria.

As propriedades geométricas brutas são calculadas em mm e convertidas para SI
na fronteira. Na interface, MPa, GPa, cm², cm³, cm⁴ e kN/kN·m são convertidos
explicitamente. Os eixos de seção largura/altura correspondem a y/z locais.
Módulos elásticos usam o menor valor das duas fibras por eixo nesta integração;
o padrão de esforços do estudo crítico precisa corresponder à peça e ao eixo.

O refinamento passou de três malhas fixas para três a cinco malhas adaptativas,
mantendo o alvo solicitado e os limites de recursos. A seção sintética
100×50×15×2 mm, raio interno 3 mm, não atingia 0,001 com três malhas:
variação de J=0,0010376987. Refinar resolveu o caso; o alvo não foi relaxado.
A saída evolui para `jpn.section-analysis-result/2`; a entrada permanece /1.
Convergência observada não equivale a limite certificado do erro.

A ação explícita **Aplicar propriedades calculadas ao grupo físico** aplica
A/I/J ao grupo inteiro e A/I/J/W ao cadastro resistente selecionado, com seis
algarismos significativos e resolução absoluta de cada grandeza registrada.
O cálculo exportado conserva os valores completos. Essa quantização explícita
evita exigir identidade dos últimos bits entre soluções esparsas em processos
distintos. A admissão resistente aceita no máximo a resolução correspondente
a seis algarismos, com meia unidade da resolução e guarda de 128 ULP; não há
uma tolerância percentual resistente configurável. A resistência usa as
propriedades recalculadas sem arredondamento. Não altera propriedades do solver
sem a ação do usuário. Contradições físicas são recusadas, inclusive alturas de
alma incompatíveis.

Cada estudo vincula geometria, material, contenções, ligações, cargas,
combinações e revisões por SHA256, além dos hashes de entrada/resultado do
solver. Exclui apenas o metadado derivado da revisão do projeto, evitando uma
referência circular ao persistir o próprio estudo. Alterações físicas invalidam
o estudo. Registrar declaração ou aplicar seção invalida a análise. Resultados
de resistência são transitórios e exportáveis; não são persistidos como uma
aprovação em backups. Duplicatas por peça/combinação são recusadas.

## Como executar na interface

Instale o perfil opcional `engine/requirements-sections.lock` em Python 3.12
e o pacote local do motor. Configure `JPN_PYTHON_EXECUTABLE` para esse Python e
inicie `pnpm dev:structural`. A seção e a resistência ficam no executor local,
sem integração de publicação remota neste incremento.

1. Abra um projeto com modelo físico, cargas e ligações explicitamente declarados.
2. Declare combinações ULS e suas referências. O controle **Revisar finalidade
   e fatores das combinações** edita as declarações existentes sem exigir JSON;
   não seleciona coeficientes normativos. Registrar remove a antiga conferência
   de duplicidade de ações e exige recálculo.
3. Cadastre material resistente e geometria física Ue na peça; calcule a seção,
   confira o refinamento e aplique as propriedades ao grupo físico se apropriado.
4. Recalcule **ações de ligações** para recuperar esforços contínuos auditados.
5. Em **Verificar resistência Ue**, selecione uma ULS e informe o estudo crítico
   por modo, com fonte/revisão/responsável e condições físicas correspondentes.
   Somente tração axial pura dispensa esses modos; o worker verifica a hipótese.
6. Registre o estudo, recalcule a análise e execute a verificação Python.
   Exporte o cálculo rastreável com capacidades, modo governante, cláusulas,
   posição, esforços concomitantes, auditoria geométrica e hashes.

## Referências independentes e casos executáveis

`python engine/verify_coldformed_chain.py --output resultado.json` executa uma
viga em balanço de 2 m com tirante axial vertical de 1 m. Modelo sintético:
E=200 GPa; viga A=0,01 m², Iy=Iz=J=1e-5 m⁴; base A engastada e ponto C com
translações fixas/rotações inativas. A seção do tirante é Ue 100×50×15×2 mm,
ri=3 mm, calculada; fy=250 MPa e fu=400 MPa são declarações do ensaio, não aço
de obra presumido. Não há peso próprio neste controle de tração.

As cargas são nodais verticais em B, 1.000 N e 200.000 N. A combinação do
ensaio tem fator 1, explicitamente sintética, sem seleção normativa de ações.
A hipótese resistente do tirante é sem furos/recortes, todos os elementos
conectados por soldas, com resistência das soldas fora do ensaio.

Referência mecânica independente: kb=3EI/L³, kt=EA/Lt e N=P·kt/(kb+kt).
Referência resistente: mínimo das três expressões de 9.6.2, que neste controle
é governado por Afy/1,10.

| Carga | N real/analítico do tirante | Resistência de cálculo | Resultado do procedimento |
|---|---:|---:|---|
| 1.000 N | 991,359646 N | 97.786,426033 N | PASS |
| 200.000 N | 198.271,929218 N | 97.786,426033 N | FAIL |

Os resultados reais estão em `validation/coldformed-design/integrated-tension.json`.
O caso não é uma cobertura comercial dimensionada. O teste de navegador usa
a cobertura sintética JPN 10×20 m, escolhe uma diagonal axial com tração na
combinação atual e percorre seção → aplicação explícita → recálculo misto →
resistência → exportação → invalidação por revisão. Os casos WP/WS do exemplo
são sintéticos; sua finalidade ULS é declarada explicitamente no ensaio.
Mudar a seção pode inverter esforços de uma peça numa estrutura hiperestática;
o teste relê a resposta após recalcular, não reutiliza o sinal anterior.

Os controles do núcleo incluem valores construídos à mão com λ=1,
referências Decimal de 50 dígitos, ramos/limites normativos, três ramos de
cortante, seção líquida/Ct, C.5 sem divisão pelo coeficiente resistente,
interação cujo máximo fica entre os máximos isolados, segmentação, unidades,
torsão não suportada, N não constante, modos faltantes e estudos obsoletos.

## Fontes e limitações de edição

Inventário de cinco documentos fornecidos pelo usuário, com SHA256, edição
identificada e número de páginas: `validation/coldformed-design/supplied-standards.json`.
Os PDFs, capturas e textos integrais não são distribuídos no repositório.

O print da NBR 8681:2025 tem 18 páginas PDF, com conteúdo legível até a página
numerada 23, tabelas e expressões examinadas visualmente. Não o tratamos como
um arquivo pesquisável nem como prova de aplicação de todos os requisitos.
A NBR 14762:2010 faz referência datada à NBR 8681:2003 e possui prescrições
próprias de combinações em 6.7. Não houve substituição silenciosa pelos fatores
de 2025. A compatibilidade precisa ser resolvida explicitamente antes de
anunciar automação normativa completa. As correções de 2019 da NBR 6120 e eventuais correções posteriores da
NBR 6123:2023 não estão demonstradas nos arquivos recebidos. A NBR 8800
recebida contém errata separada; suas verificações resistentes não foram
implementadas neste incremento. Não reutilizamos as edições antigas enviadas.

## Validação e veredito

Resultados finais, comandos, versões e falhas intermediárias estão registrados
em `validation/coldformed-design/checks.json` e nos logs adjacentes. A execução
Windows local e a execução CI remota são identificadas separadamente; resultado
de um commit anterior não comprova o novo commit.

| Comando | Resultado local efetivamente observado |
|---|---|
| `python engine/validate.py` | 1.503 testes, zero falhas/erros/ignorados; 1.000 comparações de referência aprovadas; 67,58 s na execução registrada |
| Testes opcionais de seções e integração resistente | 8 aprovados; sectionproperties real, processo `-I` e PyNite real; 94,35 s com outros ensaios simultâneos |
| Testes FSM no ambiente separado | 4 aprovados; 9,32 s |
| `pnpm typecheck` | Código de saída 0 |
| `pnpm lint` | Código de saída 0 |
| `pnpm test` | 365 aprovados, zero falhas/ignorados |
| `pnpm test:e2e` | 73 aprovados, zero falhas/ignorados/flaky; 10,7 min |
| Regeneração CAD + `python tests/verify_dxf.py` | 2 testes CAD aprovados; 130 linhas 3D, coordenadas/mm e auditoria ezdxf aprovadas |
| `pnpm build` | Código de saída 0; rotas locais de seção e resistência incluídas |
| Exemplo integrado executável | Casos de 1 kN e 200 kN conferidos; procedimento resistente PASS/FAIL esperado |

Ambiente principal: Python 3.12.10, PyNiteFEA 3.2.1, NumPy 2.5.4, SciPy 1.18.1,
sectionproperties 3.10.2 e Node 24.13.0, Windows. BLAS/OMP/MKL limitados a uma
thread. `pip check` do principal passou. O Python embarcado separado FSM não
possui pip; isso não foi apresentado como um `pip check` aprovado desse perfil.
Seus quatro testes com as dependências reais passaram. CI Linux/Windows está
preservada na workflow, mas esta tabela é evidência local.

**Veredito de engenharia: NÃO PRONTO para dimensionamento completo M27–M30.**
O incremento entrega procedimentos resistentes executáveis e testados,
conectados ao motor real. Permanecem estabilidade global/segunda ordem mista,
modos resistentes restantes, ligações/bases completas, seleção normativa das
ações/combinações e dois modelos externos completos de cobertura. Não houve
rigidez, apoio, propriedade ou mínimo crítico inventado para obter aprovação.

## Continuação: resposta à auditoria independente do PR #37

Esta seção sucede o commit auditado `aa80040ed47e5379f54b1e79b5aa3fdf25dc3834`
e a revisão `5744473053`. Os registros anteriores são históricos. As evidências
novas estão em [continuation/checks.json](validation/coldformed-design/continuation/checks.json).

### Correções de integridade e de classificação

- O resultado resistente é agora `jpn.coldformed-design-result/2`. Capacidades
  que dependem de autovalores, áreas líquidas ou Ct declarados externamente
  ficam `CONDITIONAL` quando a solicitação está abaixo da capacidade;
  ultrapassá-la continua produzindo `FAIL`. Uma caixa de revisão não prova
  autovalores. A peça inteira e a estrutura permanecem sem aprovação.
- A geometria persistida das ligações acompanha a solicitação resistente.
  Furos/parafusos conhecidos contradizendo `full-section-all-elements-welded`
  são recusados. Ausência de cadastro ou mera existência de uma solda não
  comprova An=A, Ct=1, ausência de recortes ou conexão de todos os elementos.
  Esses casos continuam condicionais: não há cálculo completo da seção
  líquida, cobertura de soldas ou resistência da junta nesta continuação.
- Os três eixos de cada segmento devem formar uma base ortonormal direta e
  coincidir na peça original. Uma rotação uniforme de 90° é aceita; segmentos
  com rotação transversal diferente são bloqueados. Não há transformação
  fictícia de esforços biaxiais entre seções com orientações diferentes.
- Um catálogo único alimenta a disponibilidade dos procedimentos no relatório
  e no release gate. `jpn.resistance-report/3` exporta separadamente
  disponibilidade, registros efetivamente executados, estados por procedimento
  e cálculos auxiliares. Declarações obsoletas, registros duplicados e vínculos
  SHA incompatíveis são rejeitados. O relatório derivado tem hash próprio.
- Os testes encontraram ainda divergência de hash para escalares NumPy antes
  e depois da serialização JSON. A normalização usa `numbers.Real`, excluindo
  booleanos. Três regressões comprovam a correção; não mudou nenhuma equação
  ou tolerância do solver nem o hash de entradas JSON comuns.

### Compressão Ue: cálculo automático limitado e verificável

`member_buckling.py` alimenta o MRD sem valores críticos digitados, admitindo
somente Ue físico prismático, compressão uniforme, comprimento físico único,
apoios de garfo nas extremidades, empenamento livre e ausência explicitamente
declarada de contenções intermediárias. Ly e Lz devem coincidir com o vão
físico neste modelo. Flexão, torção, cortantes, N variável ou condições de
contorno diferentes impedem a automação. Isso não comprova a estabilidade
global da estrutura que contém a barra.

O valor global Ne vem de 9.7.2.1/9.7.2.2 da NBR 14762:2010 para seção
monossimétrica: modos flexionais e flexo-torcionais, com J, Iw e centro de
cisalhamento calculados. A raiz inferior é avaliada em forma racionalizada
para reduzir cancelamento numérico. Onze testes incluem comparação com um
problema generalizado independente de autovalores de três graus de liberdade,
simetria, escala e limite de Euler.

Nl e Ndist vêm de espaços modais separados do cFSM, não de três mínimos
arbitrários da curva livre. A geometria de linha média inclui cinco trechos
planos e quatro arcos. São examinados 64 números inteiros de semionda, com
comprimento L/m, em três malhas sucessivas. O último refinamento precisa
convergir em ambos os modos a 0,001; mínimo na fronteira da busca ou malha
não convergida bloqueia o cálculo. Curvas, dimensões dos espaços, propriedades,
parâmetros, versões, refinamentos e hashes são exportados.

**Limite importante:** não há prova de erro da cauda para m>64. Por isso, mesmo
com refinamento aprovado, o resultado abaixo da capacidade é
`CONDITIONAL-MODEL-LIMITS`, nunca aprovação completa do domínio. Não promovemos
convergência de malha em certificação de busca global. O perfil Ue arredondado
100×50×15×2, ri=3 mm, que não atingiu o critério, continua bloqueado no teste.
O modo global do cFSM não foi utilizado para contornar a falta de convergência:
usou-se a expressão normativa independente acima.

O caso integrado novo usa Ue 200×75×20×1 mm, ri=0, vão de 2 m, E=200 GPa,
fy=250 MPa e fu=400 MPa, todos sintéticos e declarados. Um modelo misto PyNite
real contém uma coluna axial e um balanço de pórtico descarregado, com vínculos
explícitos. N=-P, u=-PL/EA e R=P são conferidos independentemente. As cargas de
1 kN e 200 kN produzem, respectivamente, resultado resistente condicional e
FAIL. O MRD resultante é aproximadamente 22,6825 kN, governado pelo modo
distorcional; o cálculo é repetido em aritmética Decimal independente com
50 dígitos. O worker real levou cerca de 13,1 s no ensaio direcionado e
respeitou os limites existentes: `-I`, 768 MiB e timeout de 20 s.

Reprodução: `python engine/verify_auto_compression.py --member-python
CAMINHO_DO_PYTHON_COMBINADO --output evidencia.json`. Use
`engine/requirements-validation.lock` para o solver principal e um segundo
ambiente com `engine/requirements-sections-fsm.lock` para a seção+cFSM.
Configure `JPN_SECTION_FSM_PYTHON_EXECUTABLE` na interface local. O perfil
combinado não contém PyNite; não substitui o ambiente principal. Os dois dados
MATLAB CUFSM originais de 99 autovalores são novamente comparados nesse perfil,
mantendo a tolerância absoluta preexistente de 1e-4.

Em outro computador, instale o perfil combinado em um ambiente separado. Por
exemplo, no PowerShell, a partir da raiz do repositório já configurado:

```powershell
py -3.12 -m venv .tools/sections-fsm
.tools/sections-fsm/Scripts/python.exe -m pip install -r engine/requirements-sections-fsm.lock
$env:JPN_SECTION_FSM_PYTHON_EXECUTABLE=(Resolve-Path .tools/sections-fsm/Scripts/python.exe).Path
pnpm dev:structural
```

O perfil principal continua instalado conforme a configuração existente do
projeto. No Linux, o executável do novo ambiente é
`.tools/sections-fsm/bin/python`; exporte o mesmo nome de variável. Os ambientes
Python, PDFs normativos locais e executáveis não são publicados no Git.

### Vento e ligações: incrementos efetivamente executáveis

`jpn.wind-speed/1` calcula S1=1 para terreno plano/fracamente acidentado,
S2 pelas tabelas 1–3 e 5.3.3, Vk e q=0,613Vk² conforme 4.2 da edição original
NBR 6123:2023 consultada. Categoria, classe dimensional, S3 e respectivas
fontes continuam declarados pelo responsável; V0 vem do cadastro existente.
São considerados Fr da categoria II, limites inferiores de altura e zg;
transição de rugosidade e alturas fora do domínio são recusadas. A aplicação
na interface atualiza apenas o caso selecionado, preserva zonas e combinações,
invalida a revisão de independência das cargas e obriga novo cálculo. Entradas
ou q obsoletos são recusados. Os testes independentes conferem valores
tabulados, proporcionalidade quadrática e as seis componentes da resultante.

Este é um cálculo parcial de velocidade e pressão, não vento normativo
completo: isopletas, seleção automática de cpe/cpi/zonas, efeitos dinâmicos e
compatibilidade normativa das combinações continuam pendentes. Não foi
comprovado um texto consolidado de correções posteriores ao PDF de 2023;
portanto não se anuncia conformidade com uma edição corrigida vigente.

Para participantes axiais, o relatório calcula a exigência mínima de 10.1(a)
da NBR 14762:2010 separadamente dos esforços do solver: máximo entre |Nsd|
e 50% da resistência axial de cálculo fornecida pelo procedimento da barra.
Não soma envelopes incompatíveis, não altera cargas nem inventa esforço
quando o vetor governante está ausente. Sem resistência válida, bloqueia;
com resistência condicional, mantém a condição. **Não é resistência da junta:**
parafusos, soldas, chapas, esmagamento, rasgamento, bases e ancoragens ainda
não têm seus modos completos implementados neste incremento.

### Evidências, falhas encontradas e limitações restantes

A nova campanha e seus códigos de saída estão em `continuation/checks.json`,
com logs, JUnit e saída dos dois casos em `automatic-compression.json`.
Também se preservam as falhas intermediárias: vínculo SHA NumPy, advertência
de conversão escalar do pyCUFSM sob configuração pytest estrita e dois timeouts
HTTP de 20 s quando a suíte JavaScript iniciou workers numéricos concorrentes.
O último caso motivou execução serial dos arquivos Vitest; timeout, memória,
validações, expectativas matemáticas e tolerâncias de produção foram mantidos.
As advertências conhecidas do pyCUFSM são identificadas explicitamente;
advertências desconhecidas continuam impedindo o cálculo.

Os testes de navegador preservam os fluxos comerciais e conferem o relatório
resistente `/3` com cálculo Python real. O novo cálculo automático de compressão
é comprovado pelo endpoint HTTP local real e pelo subprocesso, não por uma
simulação; sua interação completa via formulário não deve ser confundida com
o fluxo de tração testado pelo Playwright. A geração de S2/q é validada no
domínio e no caminho físico de cargas; o novo formulário específico não tem
um roteiro Playwright dedicado nesta continuação.

Segunda ordem mista continua bloqueada: o `Spring3D` da versão usada não
contribui para Kg, e não foi introduzida rigidez artificial para ativar P-Delta.
Os desenhos e quantitativos profissionais disponíveis não incluem memorial
completo de cargas, apoios e resultados para duas coberturas independentes;
o novo caso analítico é sintético, não é anunciado como validação de obra real.
An/Ct automáticos completos, estados-limites adicionais, ações/combinações
normativas completas e resistência completa das ligações continuam pendentes.

**Veredito:** evolução experimental utilizável e rastreável, com novos cálculos
automáticos e bloqueios explícitos. **NÃO PRONTO para dimensionamento completo,
aprovação estrutural ou fabricação.** Nenhum merge ou deploy foi autorizado.

Campanha final local desta continuação, executada em 03/11/2026:

| Comando/perfil | Resultado observado |
|---|---|
| `python engine/validate.py` | 1.524 testes aprovados; 1.000 comparações aprovadas; zero falhas/erros/ignorados |
| Seções físicas + integração resistente, Python principal | 8 aprovados, 101,10 s |
| FSM anterior isolado | 4 aprovados, 8,71 s |
| Novo perfil seção+cFSM | 11 aprovados, 41,96 s; 22 advertências upstream conhecidas registradas |
| `pnpm typecheck` e `pnpm lint` | Ambos com saída 0, após a configuração final |
| `pnpm test` | 377 aprovados em 45 arquivos; execução serial, 173,34 s |
| `pnpm test:e2e --reporter=line,json` | 73 aprovados; zero falhas/ignorados/flaky, 692,58 s |
| CAD + `python tests/verify_dxf.py` | 2 testes CAD aprovados; 130 linhas 3D, mm, sem erros na auditoria ezdxf |
| `pnpm build` | Saída 0; rotas locais de seção, análise mista e resistência incluídas |
| `pip check`, principal e combinado | Ambos aprovados |

As evidências acima são Windows locais com Python 3.12.10. A configuração de
CI mantém Linux/Windows e adiciona o novo perfil opcional nos dois sistemas;
o resultado remoto do novo commit não foi usado como prova local nem presumido
aprovado. Consulte o status do commit no PR após a publicação.
