# Resistência Ue/MRD: incremento executável após as fontes fornecidas

Branch `feat/m27-m30-structural-engine-complete`, continuação do PR draft #37.
Sem merge, deploy ou alteração das hipóteses dos projetos existentes.

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
anunciar automação normativa completa. As correções de 2019 da NBR 6120 e de
2025 da NBR 6123 não estão demonstradas nos arquivos recebidos. A NBR 8800
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
