# JPN — Estudo independente de rigidez geométrica e segunda ordem mista

**Data da auditoria:** 03/11/2026  
**Classificação:** pesquisa reproduzível, sem alteração do motor e sem autorização para dimensionar/fabricar  
**Base JPN:** PR #37, SHA `00e61f68d1013f2d34dfa74554c84edc27efad72`  
**Branch deste estudo:** `research/second-order-geometric-matrix-audit`, derivada do PR #37, sem modificar a branch original.

## 1. Questão e conclusão

A pergunta não é se o JPN deveria trocar todo seu motor pelo de outro projeto. A questão verificável é: **como incorporar, validar ou substituir exclusivamente a contribuição de rigidez geométrica das barras axiais e de pórtico no modelo misto 3D**, que hoje usa PyNiteFEA 3.2.1, com barras `frame` e `Spring3D`.

**Conclusão:** preservar a análise linear mista atual e o motor de flambagem Ue; fazer uma pesquisa/implementação **isolada** de estabilidade global mista, com matriz geométrica de barra axial, transformação, vinculações, casos de carga, modos de instabilidade, resíduos, esforços concomitantes, testes independentes e domínio físico explícito. NÃO ativar `analyze_PDelta` do PyNite no modelo misto atual como se fosse segunda ordem completa.

A concordância de fórmulas de flexão entre Stabileo e Frame3DD ajuda a validar parte da base; diferenças de torção e de modelo físico impedem substituir matrizes por cópia indiscriminada.

## 2. Fontes inspecionadas, versões e limites

| Fonte | Arquivo/versão consultados | O que foi inspecionado |
| --- | --- | --- |
| JPN | [`mixed3d.py`](https://github.com/brunoJuniorBrz/JPN/blob/00e61f68d1013f2d34dfa74554c84edc27efad72/engine/jpn_structural/mixed3d.py) | Montagem PyNite, barras axiais, eliminações de graus de liberdade, saída e equilíbrio |
| JPN | [`member_buckling.py`](https://github.com/brunoJuniorBrz/JPN/blob/00e61f68d1013f2d34dfa74554c84edc27efad72/engine/jpn_structural/member_buckling.py) | Flambagem global Ue + cFSM e limites do membro isolado |
| JPN | [`wind-speed.ts`](https://github.com/brunoJuniorBrz/JPN/blob/00e61f68d1013f2d34dfa74554c84edc27efad72/src/domain/wind-speed.ts) | Pressão dinâmica parcial, domínio 2023 original |
| Stabileo | [`geometric_stiffness.rs`](https://github.com/lambdaclass/stabileo/blob/58fc63cef585918c5025acc71488f73f5fbf4afc/engine/src/solver/geometric_stiffness.rs) | Flexão, projetor de treliça, acoplamento do centro de cisalhamento, Wagner, empenamento |
| Stabileo | [`torsional_buckling_and_spectral.rs`](https://github.com/lambdaclass/stabileo/blob/58fc63cef585918c5025acc71488f73f5fbf4afc/engine/tests/torsional_buckling_and_spectral.rs) | Testes de torção e acoplamento |
| Stabileo | [`mass-geometric-dynamics.md`](https://github.com/lambdaclass/stabileo/blob/58fc63cef585918c5025acc71488f73f5fbf4afc/docs/solver/mass-geometric-dynamics.md) | Derivações, limitações e histórico de verificações |
| Stabileo | [`pdelta.rs`](https://github.com/lambdaclass/stabileo/blob/58fc63cef585918c5025acc71488f73f5fbf4afc/engine/src/solver/pdelta.rs) | Iteração, montagem do `Kg` e critérios de convergência |
| Stabileo | [`self-checks.md`](https://github.com/lambdaclass/stabileo/blob/58fc63cef585918c5025acc71488f73f5fbf4afc/docs/safety/self-checks.md) | Checagens de equilíbrio, autovalores, diagnósticos e limitações |
| Frame3DD | [`src/frame3dd.c`](https://github.com/hpgavin/frame3dd/blob/73a022adf1ba9d168640254bf22557e21dfb5fc4/src/frame3dd.c) | Função `geometric_K` e matriz geométrica 12x12 |
| Frame3DD | [manual](https://hpgavin.github.io/frame3dd/web/Frame3DD-manual.html) | Ressalvas para aproximação de treliças e instabilidade |
| PyNite | [`FEModel3D.py`](https://github.com/JWock82/Pynite/blob/3.2.1/Pynite/FEModel3D.py) | `Ke` e `Kg`, em particular quais elementos são somados |
| PyNite | [`Spring3D.py`](https://github.com/JWock82/Pynite/blob/3.2.1/Pynite/Spring3D.py) | Molas 3D com `Ke`, sem `Kg` correspondente |
| HyperFrame | [`nbr6123/wind.ts`](https://github.com/candidoalfilho/hyperframe/blob/dfcab43a78b583265b9a2c795dae7e3e2e917aa2/packages/engine/src/nbr/nbr6123/wind.ts) | Modelo de vento por pavimento, interpolação de arrasto e fontes declaradas |
| HyperFrame | [`nbr8681/combinations.ts`](https://github.com/candidoalfilho/hyperframe/blob/dfcab43a78b583265b9a2c795dae7e3e2e917aa2/packages/engine/src/nbr/nbr8681/combinations.ts) | Geração algorítmica ELU/ELS; cabeçalho referencia NBR 8681:2003 |

**Atenção às revisões:** a tag pública `3.2.1` do PyNite foi consultada e os blobs `FEModel3D.py` (SHA `b0433dbd85a0b6b46256e5d435a196028e062cd9`) e `Spring3D.py` (SHA `a66bf50ffa602b730c951fcee3eb1c78996b8071`) coincidem com os do commit inicialmente inspecionado. Isso verifica os dois arquivos de fonte da versão declarada, mas não reproduz ainda a execução do wheel/venv do Codex. Os arquivos Stabileo foram examinados em pontos distintos durante uma branch ativa; o documento usa permalinks fixados. Uma documentação antiga do Stabileo ainda afirma que faltam alguns termos torsionais; o código fixado examinado **já os implementa**. Sempre dar precedência ao comportamento efetivamente ensaiado, não ao texto isolado.

## 3. O que as matrizes representam

### 3.1 Barra de pórtico: flexão geométrica

Para esforço normal `P` constante (tração positiva, compressão negativa), comprimento `L` e interpolação transversal cúbica de Hermite:

\[
U_G=\frac12\int_0^L P[v'(x)^2+w'(x)^2]\,dx.
\]

Na base plana de deslocamentos `(v1, θ1, v2, θ2)`, o bloco é:

\[
K_G^{(v)}=\frac{P}{30L}
\begin{bmatrix}
36 & 3L & -36 & 3L\\
3L & 4L^2 & -3L & -L^2\\
-36 & -3L & 36 & -3L\\
3L & -L^2 & -3L & 4L^2
\end{bmatrix}.
\]

A inspeção mostra essa formulação no Stabileo e os mesmos coeficientes no Frame3DD quando `shear=0`. Não se deve comparar a matriz 3D completa sem reconciliar o ordenamento dos 12 graus de liberdade, o eixo local, o sentido de `θy`, as liberações e a unidade de força.

### 3.2 Barra axial: rigidez geométrica translacional 3D

Para uma barra axial de dois nós, direção unitária `e` e `I3` identidade:

\[
G=I_3-ee^T,\qquad
K_{G,\mathrm{axial}}=\frac{P}{L}
\begin{bmatrix}
G & -G\\
-G & G
\end{bmatrix}.
\]

O bloco possui **6 graus de liberdade translacionais**, sem criar rotações físicas na barra. O trabalho geométrico depende de movimento relativo **transversal**. Translação rígida comum e alongamento puramente axial não geram trabalho desse `Kg`. A compressão `P<0` retira rigidez transversal; a tração a acrescenta.

Isto NÃO significa que uma barra isolada comprimida possua rigidez elástica transversal suficiente para um problema estável: um sistema de treliça pode ser um mecanismo no estado linear. A montagem deve preservar graus de liberdade ativos, vínculos e estabilidade real do conjunto.

### 3.3 Liberações

Stabileo aplica uma transformação `T` das rotações liberadas e condensa `Kg` conforme `Tᵀ Kg T`, incluindo os acoplamentos. Em uma barra plana com rotação liberada nas duas extremidades e interpolação pela corda, o bloco remanescente é `(P/L)[[1,-1],[-1,1]]` para translações transversais.

Não adicionar `Kg` nas rotações já eliminadas, nem declarar um nó axial como engastado fisicamente só porque seu modelo elimina rotações inexistentes.

### 3.4 Torção — divergência que impede cópia direta

No Frame3DD, a entrada torsional da matriz `geometric_K` inclui `P J/(A L)`. No Stabileo atual, o termo de Wagner utiliza `P r0²/L`, com:

\[
r_0^2=\frac{I_y+I_z}{A}+y_0^2+z_0^2
\]

e há acoplamentos em `y0,z0`, além de uma formulação 14x14 quando o empenamento é modelado.

Essas expressões **não são intercambiáveis**. O código sozinho não prova qual modelo representa corretamente cada condição de apoio, seção e modo. A discrepância precisa ser reconciliada por formulação energética, condições de contorno, coordenadas do centro de cisalhamento e referências independentes; em particular, a flambagem lateral com torção pode exigir efeitos de momento e empenamento não contemplados por um `Kg` axial simplificado.

### 3.5 Três problemas diferentes — não misturar

1. **Primeira ordem da estrutura:** `K_E u=F`, com esforços internos e reações elásticos.
2. **Segunda ordem/estabilidade global:** equilíbrio com contribuição geométrica do sistema; em aproximação iterativa `[K_E+K_G(N)]u=F`. A atualização de `N`, o equilíbrio final e as hipóteses da formulação devem estar explícitos. Esse não é automaticamente um método não linear completo.
3. **Flambagem/resistência de um membro Ue:** valores críticos de membro e cFSM sob domínio físico específico; o `member_buckling.py` do JPN restringe a compressão uniforme, sem travamentos intermediários, um vão e apoios `fork-fork-free-warping`. Esses valores **não substituem** o `Kg` de todos os elementos na estabilidade do galpão.

## 4. Por que o JPN não pode apenas ligar o P-Delta do PyNite

No JPN, os pórticos são elementos `Member3D`; as barras exclusivamente axiais são `Spring3D` com `k=EA/L`. O adaptador elimina matematicamente rotações de nós apenas axiais que não existem fisicamente, e valida a matriz elástica e os equilíbrios.

No código público examinado do PyNite, `FEModel3D.Ke` incorpora molas; `FEModel3D.Kg` percorre **`self.members.values()`** e monta `member.Kg(P)`, sem percorrer as molas. A classe `Spring3D` apresenta `Ke` e não um `Kg` correspondente.

Portanto, a matriz geométrica calculada por esse caminho omite a contribuição dos elementos axiais modelados como molas. Isso justifica manter o gate de segunda ordem mista **BLOQUEADO**. Também é necessário auditar se as forças de pré-esforço são lidas com sinal, combinação e estágio corretos; matriz geométrica não é sinônimo de todas as exigências de estabilidade.

**Proibido como atalho:** substituir molas por barras de pórtico com `Iy/Iz/J` artificialmente diminutos; isso altera os graus de liberdade/condicionamento e não é uma equivalência demonstrada. O próprio manual Frame3DD alerta para não combinar sua aproximação de treliça com `geometric stiffness` dessa forma.

## 5. Experimentos locais reproduzíveis nesta entrega

Arquivo: `validation/geometric-stiffness-audit/kg_reference.py`. Executado com **Python 3.13.5**, biblioteca padrão, sem rede, sem importar código do JPN e sem alterar o solver. Seis testes `unittest` passaram; nove combinações internas de `P` e `L` foram verificadas.

**Natureza da validação:** teste independente da **transcrição e equivalência de fórmulas**. Não houve compilação nem execução dos binários Stabileo/Frame3DD neste estudo. Não reivindicar validação cruzada executável entre motores.

| Verificação | Resultado |
| --- | --- |
| Integração **exata** das derivadas de Hermite usando `fractions.Fraction` vs. fórmula Stabileo vs. coeficientes Frame3DD, sem cisalhamento | Identidade exata nas nove combinações, inclusive compressão, tração e `P=0` |
| Simetria, translação rígida, energia e sinais de `Kg` | Passou |
| Condensação com as duas rotações liberadas | Retorna exatamente o bloco transversal `P/L` |
| Projetor 3D da treliça, translação rígida e alongamento na direção `e=(1,2,2)/3` | Passou; energia transversal `P||Δu_⊥||²/L` |
| Diferença torsional dos coeficientes de fonte | Confirmada numericamente em seção **sintética** |
| Modelo de 1 grau de liberdade misto, com compressão gradual | Sensibilidade à rigidez geométrica confirmada; **não é uma cobertura real** |

### 5.1 Exemplo torsional sintético

Dados hipotéticos (SI): `A=0,004 m²`, `Iy=8·10⁻⁶ m⁴`, `Iz=2·10⁻⁶ m⁴`, `J=5·10⁻⁸ m⁴`, `y0=0,04 m`, `z0=0`, `L=4 m`, `P=-120 kN`.

Resultados:
- `r0²=0,0041 m²`; `J/A=0,0000125 m²`;
- coeficiente torsional Stabileo: `-123` (unidades consistentes de rigidez angular);
- coeficiente torsional Frame3DD: `-0,375`;
- relação dos módulos: **328**.

Isso ilustra uma divergência de formulação, **não uma medida do erro de um produto real**, nem uma justificativa para eleger uma expressão sem definir hipóteses físicas.

### 5.2 Modelo sintético de 1 grau de liberdade

Um apoio lateral linear equivalente de um balanço: `K_E=3EI/L³`; uma barra axial comprimida contribui `K_G=-P/L` na direção transversal. Escolhemos `E=200 GPa`, `I=8·10⁻⁶ m⁴`, `L=4 m`, `F_lateral=100 N`, resultando `K_E=75.000 N/m` e `Pcr=300.000 N` para **esse surrogate**, não para uma coluna ou cobertura real.

| `P/Pcr` | deslocamento sem `Kg` (mm) | com `Kg` (mm) | amplificação |
| ---: | ---: | ---: | ---: |
| 0,00 | 1,3333 | 1,3333 | 1,00 |
| 0,20 | 1,3333 | 1,6667 | 1,25 |
| 0,50 | 1,3333 | 2,6667 | 2,00 |
| 0,80 | 1,3333 | 6,6667 | 5,00 |
| 0,95 | 1,3333 | 26,6667 | 20,00 |

A amplificação é `1/(1-P/Pcr)` por construção do surrogate. Próximo da singularidade, a linearização pode deixar de ser adequada; os números não são capacidade resistente nem validação ABNT.

## 6. Decisão de arquitetura para a próxima etapa

**Manter:** PyNite 3.2.1 no caminho de primeira ordem; verificação de equilíbrio do `mixed3d.py`; módulo separado de flambagem Ue; workers/contratos e flags `BLOCKED/CONDITIONAL`; geometria/CAD/orçamento sem alteração.

**Pesquisar e construir isoladamente**, preferencialmente fora do caminho comercial:

1. Um **kernel de referência de `Kg` axial 3D**, com 6 GDL translacionais, sinais e dimensões em SI, testes de energia, rotação rígida, inversão do eixo, translação global e mecanismo.
2. Um **montador misto** que some contribuições elásticas e geométricas das mesmas peças e restrições, inclusive barras axiais, sem criar momentos artificiais; validar ordem e transformação dos 6 GDL por nó e forças preexistentes.
3. Uma análise de estabilidade/segunda ordem **com domínio físico estrito**: ações e combinações rastreadas, estados iniciais, `N` por barra e por combinação, iterações limitadas, convergência de deslocamento **e do resíduo de equilíbrio** de fato retornado, verificação de estabilidade da tangente, cargas compatíveis, tratamento de sinais e momentos concomitantes.
4. **Recuperação consistente** de forças de extremidade, reações e diagramas após a solução. Não basta acertar deslocamentos: a força final deve equilibrar as cargas e resultar da mesma hipótese geométrica.
5. **Comparação de executáveis independentes:** rodar modelos idênticos em PyNite primeira ordem, Stabileo e Frame3DD quando cada um suportar o mesmo elemento e hipóteses. Não tratar divergências de empenamento, liberação, cisalhamento, força constante/variável ou rigid offsets como erro sem reconciliar entradas.
6. **Modelos externos de cobertura:** pelo menos dois memoriais estruturais independentes e completos, com geometria, apoios, ações, combinações, solicitações, flechas e verificações; registrar diferença e hipóteses, nunca preencher lacunas por invenção.
7. Integrar ao JPN **somente depois** de confirmar testes, recursos e diagnósticos; caso não suportado continua bloqueado.

### Gate de aceitação proposto

- Matriz e força com sinal e unidade declarados; `K_G=K_Gᵀ` dentro do erro numérico.
- Trabalhos de corpo rígido e movimento longitudinal nulos nos modos esperados de elemento.
- Condensação com liberações e rotação de eixos demonstradas, sem graus de liberdade fantasmas.
- Matriz completa `K+Kg` e vínculos sem mecanismos espúrios; singularidade/instabilidade recusada sem publicações de `PASS`.
- Equilíbrio nodal e global de forças **e momentos**; energia/resíduo com escalonamento dimensional justificado.
- Convergência e last-state; dados não convergidos nunca passam; cargas combinadas não são superpostas a posteriori em caminho não linear.
- Casos com/sem compressão, tração, imperfeição, vínculos diferentes, mudança de eixos e perfis monossimétricos.
- Comparação executável externa com evidências brutas, tolerâncias baseadas em erro/condicionamento, não escolhidas para passar.
- Nenhuma alegação de aprovação normativa ou fabricação com esse incremento isolado.

## 7. Outros repositórios e normas: o que não importar como verdade pronta

O HyperFrame organiza bem **funções puras** de vento e combinação. No entanto:
- `wind.ts` declara digitalização de coeficientes de arrasto baseada em figura da **NBR 6123:1988** para um caso de fachadas/edifícios;
- `combinations.ts` referencia explicitamente a **NBR 8681:2003** e combinações do contexto de concreto da NBR 6118;
- isso não corresponde à verificação completa de zonas de pressão externa/interna de uma cobertura de uma ou duas águas nas edições-alvo do JPN.

O JPN atual calcula parte de `S2, Vk, q` com domínio restrito baseado na NBR 6123:2023 original e traz `completeWindAssessment=false`. Esse comportamento está **correto como bloqueio**, não como implementação final de vento.

Aproveitar **arquitetura de separação por ações, combinações, procedência e revisões**; derivar os coeficientes, cargas equivalentes e combinação pelas edições **efetivamente aplicáveis**, com fontes verificadas e validação por engenheiro. Normas ABNT continuam independentes do método dos elementos finitos.

## 8. Próximos ensaios independentes concretos — ordem recomendada

1. Compilar/rodar Stabileo/Frame3DD nas versões fixadas e obter **matrizes/saídas reais** do mesmo caso, não apenas reproduzir suas fórmulas.
2. Caso de uma barra axial inclinada sob tração/compressão e suporte lateral elástico, com solução analítica e sinais testados.
3. Pórtico com contraventamento axial, casos com barra tracionada/comprimida e inversão do vento; varrer a carga até a estabilidade-limite.
4. Testar liberação em uma e duas extremidades, mola de apoio, extremos de rigidez e coordenadas longe da origem.
5. Acrescentar flexotorção e empenamento para perfis abertos apenas quando o domínio, os dados de seção e os vínculos forem comprovados; não misturar automaticamente com a estabilidade global.
6. Construir oráculo de cargas de cobertura e combinações separado do solver; usar NBR 6123/6120/8681 e normas de perfis aplicáveis com entradas e casos normativos rastreáveis.
7. Reconciliar o branch de pesquisa com o HEAD futuro do PR #37 **somente após** revisão e validação no ambiente do Codex.

## 9. Como reproduzir e como interpretar

Em Python 3.10+ com biblioteca padrão:

    python validation/geometric-stiffness-audit/kg_reference.py --json
    python -m unittest discover -s validation/geometric-stiffness-audit -p 'kg_reference.py'

A primeira execução roda os testes e imprime resultados sintéticos estruturados; a segunda executa a suíte. O arquivo é independente do PyNite e dos pacotes Rust/C.

**Evidência executada nesta sessão:** Python 3.13.5, 6 testes `unittest` OK, incluindo as nove combinações de `P,L`; a saída JSON registra `normative_approval=false` e `full_3d_solver_validation=false`. NENHUM caso de uso profissional foi liberado.

**Reexecução de controle:** também passou `python -m unittest discover -s validation/geometric-stiffness-audit -p 'kg_reference.py'` em uma cópia de mesma extensão e conteúdo. O arquivo executado tem 6.830 caracteres e SHA-256 local `5366ebba643cb748368bd773263e2f127995f2b919d9f2a0b6e7aa8dbccb2d52`. Foi tentado `git ls-remote https://github.com/hpgavin/frame3dd.git HEAD`, porém este ambiente não conseguiu resolver o host GitHub; portanto não houve compilação do código externo.

**Não realizado:** executar o PyNite, compilar Stabileo ou Frame3DD; executar dois projetos externos completos; validar todas as famílias de seções; conferir oficialmente todos os coeficientes e revisões normativas. Essas pendências permanecem abertas.

## 10. Regra de entrega

Este PR é apenas documentação e um banco de ensaios independente, baseado no PR #37. Sem alterações em `engine/`, `src/domain/`, bloqueios normativos, bancos de dados, interface ou deploy. O profissional responsável continua obrigado a revisar o modelo, os carregamentos, a conformidade normativa e as hipóteses antes de qualquer aquisição/fabricação.

**Conclusão executiva:** a melhor próxima mudança não é substituir o JPN. É desenvolver e testar um **`Kg` misto verificável**, pois a infraestrutura de primeira ordem e de resistência parcial já existe e é mais valiosa quando preservada.
