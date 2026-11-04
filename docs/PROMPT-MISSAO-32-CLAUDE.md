# MISSÃO 32 — JPN: auditoria numérica, estabilidade mista e validação independente

Você está trabalhando no repositório `brunoJuniorBrz/JPN`. Seu objetivo é produzir **progresso real, testado e documentado** no motor de estabilidade e segunda ordem estrutural, sem confundir experimentos numéricos com dimensionamento de galpões conforme ABNT.

## Fontes obrigatórias e ordem de trabalho

1. Consulte o estado remoto **atual** de [PR #41](https://github.com/brunoJuniorBrz/JPN/pull/41), branch `feat/m31-structural-audit` (SHA-base conhecido: `5b3f854908fc8d02ff22c064c900c96b1739b25c`). Leia `docs/MISSAO-31-AUDITORIA-EVOLUCAO-ESTRUTURAL.md` e os arquivos originais antes de editar.
2. Leia o novo **[PR #43](https://github.com/brunoJuniorBrz/JPN/pull/43)**, branch `research/m32-claude-handoff-and-oracles`, **derivado do #41**. Ali estão `docs/MISSAO-32-HANDOFF-CLAUDE.md`, oito oráculos `validation/mission32-handoff/test_m32_oracles.py` e resultados `sample-results.json`. É sua especificação de testes e riscos.
3. Leia o estudo independente **[PR #42](https://github.com/brunoJuniorBrz/JPN/pull/42)** (`docs/ESTUDO-RIGIDEZ-GEOMETRICA-SEGUNDA-ORDEM-MISTA.md` e `validation/geometric-stiffness-audit/kg_reference.py`). Ele parte do #37, **não** do #41: não faça merge cego; use como fonte de equações, fontes externas e testes.
4. Confira commits novos, branches concorrentes, estado da árvore e diferenças. Trabalhe em **branch própria da Missão 32**, criada sobre o HEAD correto do PR #43 (ou incorpore os seus três arquivos manualmente à branch nova derivada do #41, sem sobrescrever trabalho existente). Preserve branches #37, #38, #39, #40, #41, #42 e #43.

## Entrega A — Corrigir lacuna demonstrada no P-Delta

O PR #41, em `engine/jpn_structural/frame_pdelta.py`, calcula um numerador de resíduo para **graus livres** e um denominador de escalonamento usando a norma de **todos os graus**, inclusive os apoiados. O benchmark matemático do PR #43 mostra que uma força de `1e12 N` aplicada diretamente ao grau restringido pode encobrir resíduo de `1 N` no grau livre e produzir razão `1e-12` (menor que o limite `1e-8`). Isso ainda **não é** uma falha integrada reproduzida; é uma vulnerabilidade matemática do critério.

- Comece escrevendo teste adversarial **que invoque o cálculo real**, usando problema reduzido ou caso com carga aplicada ao apoio, sem recorrer a PDelta artificialmente convergido. Mostre RED antes e GREEN depois quando aplicável.
- Recalcule numerador e denominador em **exatamente os graus livres**, mantendo o mesmo escalonamento físico para força/momento. Avalie também tolerância absoluta condicionada ao problema, sem inventar valor arbitrário para passar.
- Confirme que os exemplos existentes de balanço comprimido/tracionado, biapoiado, malhas, eixos, reações e limites continuam corretos; preserve o rótulo de método de tensão inicial em duas etapas.
- Não modifique `max_iter`, prazo, memória, gates nem tolerâncias apenas para tornar os testes verdes.

## Entrega B — Flambagem Ue, modos local/distorcional e referências externas

O #41 identificou autovalores cFSM inconsistentes com a razão energética do próprio modo. O novo `engine/jpn_structural/constrained_modes.py` usa as matrizes/espaços do pyCUFSM e resolve problema inverso em métrica elástica positiva. Examine, reproduza e **questione** seus pressupostos: posto da base, energia, critérios de condicionamento, resíduo projetado, limites de acúmulo, espectro `L/m` de 1 a 64 e escopo da classificação modal.

- Execute os testes do #41 com as dependências fixadas, especialmente `engine/section_tests/test_modal_numerics.py` e `test_member_buckling.py`.
- Crie novas geometrias Ue e malhas, compare curvas e formas modais com um oráculo realmente independente do mesmo código pyCUFSM. Use CUFSM/Octave/MATLAB ou métodos de referência, documentando qualquer impossibilidade.
- Compare o mesmo problema físico (geometria, espessura, material, discretização, condições de contorno, semiondas). Não use um autovalor solto de outra hipótese como “confirmação”.
- Nenhum mínimo contínuo pode ser adotado automaticamente como modo admissível do membro finito. Não certificar cauda `m>64` sem prova.
- Resultados `/2` permanecem legíveis como históricos, mas recálculo com `/3` é obrigatório para uso automático atual.

## Entrega C — Protótipo de estabilidade mista 3D em CLI isolado

Somente após A e B estarem minimamente estabilizadas, implemente uma primeira vertical **experimental** do modelo misto de pórticos 3D e barras puramente axiais em **primeira ordem + atualização por tensão inicial**. O PyNite 3.2.1 fornece rigidez geométrica dos `Member3D` mas não inclui o `Kg` das molas `Spring3D`. O novo módulo deve montar a contribuição das barras axiais com a mesma conectividade, direção, força axial, restrições e graus globais; não converta molas em pórticos com propriedades fictícias.

Para barra axial de direção unitária `e`, comprimento `L` e força `N` (tração positiva), a referência é:

`G = I - e e^T`;

`Kg_axial = (N/L) * [[G, -G], [-G, G]]` para os **seis graus translacionais dos dois nós**.

- Garanta simetria, energia, invariância sob rotação/translação, inversão de nós, sinal tração/compressão e eixo local correto.
- Considere rigorosamente os seis graus por nó no pórtico, **sem criar rigidez rotacional na treliça** ou transformar eliminação matemática de rotações de nó axial em apoio físico.
- Integre `K_e + K_g` por combinação rastreável. Recuse mecanismos, tangente não positiva e problemas mal condicionados. Normalize o resíduo nos graus livres e recupere reações e esforços coerentes com a **mesma formulação resolvida**. Não reivindique convergência não linear completa quando a força axial é congelada após análise inicial.
- Teste igualdade com primeira ordem quando `Kg=0`, pórtico puro, barra axial em três orientações e um **pórtico misto contraventado** sob compressão e vento lateral sintético (não vento ABNT). Teste perto da instabilidade e carga invertida.
- Compare com Frame3DD/Stabileo somente quando os modelos físicos forem equivalentes: conferir Euler–Bernoulli/Timoshenko, torção, empenamento, ligações, cargas, suportes e convenção de sinais. Insira comandos, versões e evidências da execução externa. Se não conseguir executar, registre honestamente a lacuna.
- Mantenha o protótipo sob novo contrato CLI, **sem habilitar UI, endpoint de compra, corte, dimensionamento aprovado, ou API de produção**. `normative_second_order_verified=false`, `approved_for_fabrication=false`, indicação do método e limites sempre explícitos.

## Qualidade, proteção e validação

- Rode os oito oráculos do PR #43 e as regressões do #41. Reproduza primeiro o baseline nos ambientes isolados (`requirements-sections.lock`, `requirements-sections-fsm.lock`, Python 3.12, Node/pnpm do projeto); não mexa nos lockfiles sem justificativa técnica. Conserve PyNite `3.2.1`.
- Execute: core Python e comparações independentes, perfis opcionais, typecheck, lint, Vitest, build, Playwright nos tamanhos mobile/desktop e DXF/CAD. Se a CI do GitHub continuar sem iniciar jobs, reporte isso como **falha de infraestrutura**, não declare CI verde nem tente disfarçar os resultados locais.
- Valide sinais/energia/momentos, forças internas, reações, estabilidade numérica, movimento rígido, resultados não finitos, cancelamento e limites de tempo/memória, com unidades SI e hashes de entradas/versão do algoritmo.
- Não altere geometria, orçamento, layout, exportadores, normas ABNT ou avaliações resistentes de produção sem testes específicos e motivo explícito. Não “complemente” coeficientes de vento ou cláusulas normativas por aproximações.
- Preserve estados **BLOCKED/CONDITIONAL** para qualquer verificação não provada. Nenhuma aprovação para compra, corte, fabricação, ART ou uso estrutural profissional.

## Saída esperada

Publique um **draft PR** separado, com resumo de commits, arquivos alterados, tabela de testes **executados**, comparações numéricas e oráculos externos, casos RED/GREEN, regressões, versão dos solvers e uma lista objetiva de pendências. Documente os critérios de admissibilidade e mantenha o PR não mesclado até revisão independente.

**Prioridade de trabalho:** A primeiro, B em segundo, C terceiro. Se o tempo/recursos não permitirem C com rigor, entregue A+B sólidos e uma proposta executável de C, em vez de publicar uma segunda ordem mista incompleta como se fosse pronta. Depois disso planejaremos separadamente vento normativo completo e combinações NBR 6123/6120/8681 com fontes ABNT verificadas.