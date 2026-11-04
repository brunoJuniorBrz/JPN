# JPN — Pacote de transição para a Missão 32 (Claude)

**Estado:** material de pesquisa e testes matemáticos, sem modificar o solver em produção, sem aprovar engenharia ou fabricação.  
**Referência de partida:** [PR #41](https://github.com/brunoJuniorBrz/JPN/pull/41), branch `feat/m31-structural-audit`, SHA confirmado em 04/11/2026: `5b3f854908fc8d02ff22c064c900c96b1739b25c`.  
**Pesquisa independente:** [PR #42](https://github.com/brunoJuniorBrz/JPN/pull/42), branch `research/second-order-geometric-matrix-audit`, SHA `45db57402a9b6c63ba6ea374825478a0b46a9f18`.  
**Atenção:** revisar os SHAs no momento de executar; o Codex/Claude pode ter publicado commits novos. Não fazer merge implícito nem sobrescrever worktrees concorrentes.

## 1. Diagnóstico confirmado

A Missão 31 corrigiu seis campos resistentes incompletos, revisou a solução modal cFSM, forçou recálculo de resultados automáticos históricos e corrigiu o encerramento dos workers no Windows. Acrescentou `jpn.frame-pdelta/1`, experimento de PyNite 3.2.1 **somente para barra-coluna reta de pórtico**, discretizada, sem liberações, cargas distribuídas ou mistura com `Spring3D`. O experimento usa **duas soluções com rigidez geométrica inicial**; não reivindica convergência não linear completa.

A pesquisa do PR #42 reconstrói a rigidez geométrica de treliça 3D e a matriz de pórtico 3D, e demonstra por que a rigidez geométrica da mola `Spring3D` falta no caminho `FEModel3D.Kg` do PyNite. Não se deve tratar flambagem do membro Ue como substituto da estabilidade global de um galpão.

**Risco P2 com caso matemático demonstrável (não reproduzido no solver integrado):** `engine/jpn_structural/frame_pdelta.py` normaliza o resíduo **apenas dos graus livres** por um denominador com a norma de **todos os graus**, inclusive os restritos. Um carregamento grande diretamente aplicado num apoio pode reduzir a razão relativa mesmo quando o sistema reduzido não equilibra. O teste puro nesta entrega constrói `K=I`, `u=(0,1)`, `P=(10^12,0)`, apoio no grau `0`. O resíduo livre é `1 N`; razão atual `1e-12` (passaria `1e-8`), e razão reduzida `1` (bloqueia). É uma **falha da métrica**, não evidência de que o PyNite já retornou deslocamento incorreto nesse cenário. Preservar escalonamento dimensional força/momento e verificar resíduos absolutos e relativos.

## 2. Arquivos de referência para o Claude ler primeiro

1. `engine/jpn_structural/frame_pdelta.py` — em especial montagem `initial_tangents`, DOFs `free`, residual e reações, por volta das linhas 125–160.
2. `engine/tests/test_frame_pdelta.py` — soluções fechadas de balanço comprimido/tracionado, biapoiado, malhas, eixos e limites.
3. `engine/jpn_structural/mixed3d.py`, `engine/jpn_structural/mixed3d_loads.py` — primeira ordem, graus de liberdade ativos, cargas, reações e rastreabilidade.
4. `engine/jpn_structural/constrained_modes.py`, `engine/jpn_structural/member_buckling.py`, `engine/section_tests/test_modal_numerics.py` — correção modal, limitação da busca e preservação dos resultados históricos.
5. `src/domain/coldformed-design.ts`, `src/domain/resistance-assessment.ts`, `src/infrastructure/analysis/local-section-runner.ts` — gates do avaliador `/3` e do relatório.
6. `docs/MISSAO-31-AUDITORIA-EVOLUCAO-ESTRUTURAL.md`, `docs/validation/mission31/summary.json`, `checks.json` — base de evidências da Missão 31.
7. PR #42: `docs/ESTUDO-RIGIDEZ-GEOMETRICA-SEGUNDA-ORDEM-MISTA.md` e `validation/geometric-stiffness-audit/kg_reference.py` — derivações e benchmarks matemáticos.
8. **Este pacote:** `validation/mission32-handoff/test_m32_oracles.py` e `sample-results.json` — testes independentes sem NumPy nem PyNite.

## 3. Hierarquia de prioridades

### Fase A — Corrigir e provar o resíduo reduzido no P-Delta

- Escrever primeiro teste **integrado** que demonstre a sensibilidade do teste de equilíbrio a forças muito grandes aplicadas diretamente em apoios, sem criar singularidade ou violar a estabilidade linear.
- Extrair, se necessário, uma pequena função pura de norma do sistema reduzido e testar com dados sintéticos isolados; **o teste precisa invocar o código que calcula o residual em produção**, não apenas replicar a fórmula numa fixture.
- Numerador e denominador devem usar exatamente **os mesmos graus livres**, mesmo escalonamento de momentos para forças (por escala física de comprimento), e critério adicional absoluto pertinente aos resíduos pequenos.
- Aplicar a correção ao experimento de barra-coluna sem alterar os resultados fisicamente corretos registrados pela M31.
- Regredir balanço, biapoiado, tensão/compressão, mudança de eixos e reações. Se um solver retorna sucesso mas o resíduo real não é admissível, **recusar**.

### Fase B — Validação cruzada de flambagem cFSM (sem inventar aprovação normativa)

- Repetir os casos do PR #41 com o ambiente **exato** `requirements-sections-fsm.lock`.
- Comparar as duas famílias local/distorcional para **mais de uma geometria Ue** e diferentes discretizações; registrar curvas, vetores de modos, energia, condicionamento, resíduos e sensibilidade de comprimentos de onda.
- Executar o pyCUFSM original e pelo menos um **oráculo externo independente**, como CUFSM/MATLAB/Octave ou derivação energética verificável. Distinguir “mesma biblioteca em outra chamada” de independência física/numerica.
- Manter verificação de autovalor positivo vs. razão de Rayleigh, preservação do espaço modal SVD e limites de condicionamento. **Não esconder erro grande pelo bound de acumulação**: valores governantes acima do alvo `0.001` continuam recusados.
- Os 64 inteiros `L/m` representam domínio de busca finito; o diagnóstico contínuo é apenas pesquisa e **não** um modo físico admissível automaticamente. Registre explicitamente a ausência de certificação da cauda `m>64`.
- Não substituir/clonar equações ABNT por tabelas de outras edições.

### Fase C — Prototipar o `Kg` misto em CLI isolado

A etapa muda a cobertura matemática do sistema, portanto requer **novo contrato e novos gates**, sem substituir `mixed3d.py` linear e sem liberar HTTP, interface, compras, CAD ou relatórios com aprovação.

Construir um adaptador experimental que aplique o **mesmo vetor de estado e os mesmos vínculos** a pórticos e axiais, com esforço normal inicial consistente, unidades SI, sinal tração positiva e compressão negativa, reações e esforços de extremidade. Para barra axial no espaço, a contribuição de rigidez geométrica no conjunto das seis translações é:

\[
K_{G,axial}=\frac{N}{L}\begin{bmatrix} I-ee^T&-(I-ee^T)\\-(I-ee^T)&I-ee^T \end{bmatrix}.
\]

Para pórticos, usar a formulação existente e auditada **no domínio de Euler–Bernoulli definido**, sem trocar arbitrariamente o sinal de `Kg` do PyNite. Montar `K_elástica + K_geométrica` nos DOFs globais, nunca converter as barras axiais em pórticos artificiais com `Iy, Iz, J` quase zero. Rotação em nó puramente axial é **inexistente/eliminada matematicamente**, não um engaste. Checar simetria, energia, mecanismos, valores próprios, condicionamento, transformações e liberação.

**Recomendação de primeiro escopo:** procedimento de tensão inicial de duas etapas (primeira ordem para N, depois tangente fixada) com resultado etiquetado como tal. Só chamar de convergência não linear se implementar e provar o equilíbrio da teoria não linear adotada, com atualização/iterações e esforços finais compatíveis. Não superpor combinações não lineares depois da solução; cada combinação deve ser resolvida. Detectar e recusar modelos sob compressão acima da capacidade estável da tangente.

### Fase D — Benchmark executável e evidência

Comparar **executáveis**, não apenas fórmulas: Stabileo e Frame3DD com revisão/commit fixados e, para os subcasos equivalentes, PyNite. Antes de comparar números, registrar diferenças de: Timoshenko vs Euler–Bernoulli, centro de cisalhamento, empenamento, P-Delta, rótulas/liberações, pré-esforço, carga distribuída/nodal, módulo/rigidez, orientações, unidade e suporte. Divergência com hipóteses não equivalentes não é defeito comprovado.

Mínimos de aceitação para o protótipo:
- Elemento axial em direções ortogonais e inclinadas; inversão da ordem dos nós; tração e compressão; invariância sob rotação rígida e translação.
- Pórtico puro reproduz (dentro do domínio) resultados do experimento M31; caso misto recupera linear quando `Kg=0`.
- Pórtico contraventado misto 3D com carga axial e lateral, incluindo mudança de sinal do carregamento e aproximação da singularidade.
- Testes de equilíbrio **nodal e global**, forças e momentos, matriz simétrica, mecanismo, resíduos e reações, recuperação consistente dos esforços internos.
- Definir erro absoluto e relativo apropriados, especialmente próximo de zero; tolerâncias fundamentadas em discretização, escala e condicionamento.
- Impor limite de tempo 20 s, memória 768 MiB, entrada e saída limitadas, shutdown da árvore Windows, sem escape para worker desprotegido.
- Resultado condicionado e autenticado por input hash, versão do método e hipóteses; `approved_for_fabrication=false`, `normative_second_order_verified=false`.

### Fase E — Handoff ao motor de vento e ABNT

Depois que os ensaios de estabilidade tiverem validação independente, estabelecer uma missão separada para ações de vento e combinações NBR 6123:2023, NBR 6120 e NBR 8681 em edição aplicável; conferir texto integral e corrigendas autorizadas. Não interpretar uma variável S2/Vk/q como vento normativo completo e não misturar vãos comerciais ou visualização 3D com geometria estrutural física validada.

## 4. Critérios objetivos de conclusão da M32

- [ ] Provar por teste integrado a correção do normalizador de resíduos reduzidos (casos com força enorme apenas no apoio + controles normais).
- [ ] Preservar/retomar **1.580 testes Python, 1.000 comparações, 388 JS, 73 Playwright** da M31 como referência, e comparar contagens por suíte sem inventar resultado de CI.
- [ ] Validar P-Delta em barra-coluna com oráculos analíticos e sem mudar os resultados corretos anteriores.
- [ ] Reproduzir ao menos um cenário real de inconsistência pyCUFSM e obter confirmação independente das curvas/modes com casos adicionais.
- [ ] Criar experimento misto **isolado**, somente se as fases anteriores estiverem seguras e as hipóteses estiverem explicitamente declaradas.
- [ ] Testar inclinação, inversão, rótulas suportadas/recusadas, translação, energia, equilíbrio, singularidade, rigidez extrema e carga limite.
- [ ] Confirmar integridade de hashes, compatibilidade de execução, gates de projeto e recuperação do worker.
- [ ] Apresentar relatório com referências externas, matrizes, coeficientes, comparação por caso, evidências brutas e decisões de admissibilidade.
- [ ] PR específico **sem merge/deploy**, sem alterar normas, preços, CAD ou geometrias existentes silenciosamente.

## 5. Como rodar os oito testes novos desta entrega

Requisitos: Python ≥ 3.10, biblioteca padrão.

```bash
python validation/mission32-handoff/test_m32_oracles.py --json
python -m unittest discover -s validation/mission32-handoff -p 'test_*.py' -v
```

O código testa referências **independentes das implementações** (não importa PyNite nem NumPy): projetor transversal `I-eeᵀ`, rigidez axial, energia, equilíbrio dos extremos, invariância e um surrogate 1-GDL. A regressão do denominador utiliza valores sintéticos mas **não executa `frame_pdelta.py`**; a fase A deve acrescentar teste de integração do mesmo problema.

**Execução local deste pacote em 04/11/2026:** Python 3.13.5, 8 testes OK. Os resultados ficam em `sample-results.json`. Nenhum solver real, norma ABNT ou cobertura real foi homologado com esta evidência.

## 6. Política de segurança e isolamento

- Não altere PR #37, #41, #42 ou branches de UI concorrentes; use branch própria derivada do HEAD confirmado do PR #41.
- Não fazer merge automático de conteúdo do PR #42. Sua documentação e benchmarks são referência; portar apenas trechos com justificativa e testes.
- Não substituir o PyNite ou ativar segunda ordem mista em produção sem verificação. Preservar primeira ordem.
- Não declarar `PASS`, `APPROVED`, compra/corte/liberação quando uma verificação é incompleta.
- Se falta documento normativo ou benchmark físico, registrar `BLOCKED`/`CONDITIONAL` e motivo verificável, sem preencher por suposição.
- Publicar alterações como draft PR para revisão com lista de testes e limitações residuais.