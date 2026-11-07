# JPN M35-P2 — carregamento tributário e peso próprio da terça

## Problema corrigido
A M35-P1 (#58) exigia que o operador soubesse a **carga linear já composta (N/m)**. O código também apresentava uma mesma carga para perfis com massas diferentes. Esta evolução permite declarar pressão **vertical por metro quadrado de projeção horizontal**, sua largura tributária real projetada e acrescentar peso próprio nominal individual de cada seção. A M35-P2 não gera, seleciona nem combina cargas normativas automaticamente.

## Contratos / equações
Entrada aditiva compatível com `jpn.purlin/1` (campos ausentes preservam o comportamento anterior). `load_mode`:
- `line` (padrão): `uniform_load_n_m` declarado; NÃO misturar com dados de superfície.
- `surface`: `uniform_load_n_m=0`, `surface_pressure_n_m2` e `tributary_width_m` obrigatórios, bem como `load_source`. A pressão **não representa pressão normal de vento** e a largura deve ser obtida na **projeção horizontal**, não automaticamente do espaçamento sobre a água inclinada.
- `include_self_weight=true` (opcional): acrescenta peso próprio para cada seção, sem incluir ou gerar peso de telhas/terças ou qualquer outra ação.

Fórmulas usadas no motor Python:

```text
q_declarado = q_linha                                  [N/m], modo linear
q_declarado = p_vertical_planta * largura_tributaria    [N/m], modo superficial
A_seção = geometria aproximada em cantos vivos          [mm²]
q_peso = - A_seção * 10^-6 * densidade * gravidade       [N/m], se marcado
q_total_perfil = q_declarado + q_peso                     [N/m]
```

Na convenção do programa, cargas **negativas apontam para baixo**. Peso próprio sempre adiciona ação para baixo. O equilíbrio global é revalidado no TypeScript contra as reações retornadas, com massa/área do perfil e o `request_id` correspondentes. A visualização mostra `q_declarado`, `q_peso` e `q_total` por candidato, além dos esforços e da flecha.

### Exemplo matemático independente
Uma pressão vertical declarada de **−800 N/m²**, sobre uma faixa horizontal de **1,25 m**, gera **−1000 N/m**, independentemente de dimensões de seção. Se a opção de peso próprio estiver marcada, o total fica mais negativo em cada seção na proporção da área e da densidade.

No vão biapoiado simples de 4 m, E e inércia declaradas: `R_A=R_B=−q_total*L/2`, `|M|max=|q_total|*L²/8`, e flecha pelo polinômio cúbico + parcela quartica de carga uniforme.

## Testes executados
Sandbox Linux com Node 24 / Python 3.12 / PyNiteFEA 3.2.1, usando as dependências reais:
- `pytest engine/tests/test_purlin.py`: **27 testes PASS** (inclui equivalência entre pressão horizontal e carga linear, peso próprio individual, resposta à sucção, sinal, validações negativas, fórmulas independentes).
- `pytest engine/tests/test_local_mixed_worker.py engine/tests/test_purlin.py`: **34 testes PASS**.
- `pnpm typecheck`, `pnpm lint`, `pnpm build`: **PASS**.
- `vitest run src/domain/quick-project-guided.test.ts src/domain/loaded-mixed.test.ts`: **11 PASS**.
- `playwright test tests/e2e/purlin-calculator.spec.ts`: **4 PASS** no navegador Chromium real com executor Python, incluindo viewport 375 px e 1440 px; pressão superficial, recusa por falta de origem, peso próprio por candidato, alteração de entradas, persistência de rascunho e exportação JSON.

## O que NÃO foi implementado
- Distribuição de **carga de vento** por norma, Cpe/Cpi, orientação, aberturas, pressão normal, esforço horizontal e torção.
- Peso próprio de **telhamento, parafusos, chapas e demais elementos** — não presumir pressão sem memorial ou fabricante.
- Seções reais com raios de dobra, espessura efetiva, propriedades de catálogo e flambagem.
- Resistência normativa, torção, estabilidade lateral e distorsional, ligação e capacidade dos apoios.
- Geração de carregamentos a partir de um `Project` persistido: a calculadora continua independente nesta etapa.

Portanto, `computedStructuralApproval` e `fabricationRelease` permanecem sempre `false`. Comparar flechas **não** indica seção segura, mais econômica *entre opções seguras*, nem libera compra/corte.

## Próximo gargalo identificado
1. Integrar a linha física de terça ao projeto com nós e apoios reais: `roofOutline` e o espaço da terça precisam alimentar a mesma fonte de verdade. Não inferir engastes a partir de paredes.
2. Adicionar casos e combinações de ações *validados*: vento com aberturas, geometria e fatores normativos; cargas de telhas e manutenção rastreáveis.
3. Implementar verificações de resistência, estabilidade e ligações aplicáveis com oráculos independentes.
4. Só então otimização dos perfis elegíveis e liberação de orçamento técnico.
5. Conciliar a pilha de PRs #53, #55, #56, #58 e M35-P2; realizar campanha de regressão pós-integração. A entrega não mexe na `main`.

## Avaliação de prioridades do produto
| Lacuna | Consequência para o Tom | Urgência |
| --- | --- | --- |
| Cargas reais/vento/combinações | Não calcula o cenário físico da cobertura | Crítica |
| Conversão do guiado em apoios estruturais físicos | Hoje o tipo de parede/pilar pode ser só anotação | Crítica |
| Resistência, flambagem, ligações | Flecha aceitável não garante perfil resistente | Crítica |
| Projeto → cálculo de terça → quantitativo → orçamento | Operação ainda fragmentada | Alta |
| Otimização entre perfis verificados | Ainda não há lista de candidatos aprovados | Posterior |
| Refinamento visual / mais desenhos | Pouco valor antes de completar os itens acima | Posterior |

A referência `PurlinLine.jl` documenta vários fenômenos ausentes (apoio do telhamento, torção e flambagem). O módulo M35-P2 é independente, derivado da estática elementar e das hipóteses de projeto explicitadas; não foi incorporado código de terceiros.
