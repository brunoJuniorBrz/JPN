# Missão 31 — auditoria e evolução estrutural

Data da campanha: 03/11/2026. **Entrega parcial executável, sem aprovação estrutural ou de fabricação.**

## Revisão e preservação do trabalho

- Base remota realmente conferida no PR #37: `00e61f68d1013f2d34dfa74554c84edc27efad72`, branch `feat/m27-m30-structural-engine-complete`.
- Trabalho em clone separado, árvore inicialmente limpa, branch derivada `feat/m31-structural-audit`. A cópia antiga da loja e a branch estrutural original não foram sobrescritas.
- SHA final de código validado: `b32fb29bfc6a6f163e9a708c65282b21d3e8af87`. O HEAD do PR também inclui a documentação e as evidências desta campanha; esse commit documental não altera a implementação validada.
- PR #36: critérios de pronto conservados. PR #38: SHA `95a5e55b2140b47fac10ac2f908b422a7ac3ea11`, auditado em worktree separado, sem integrar sua matemática nem substituir a continuação do #37.
- Sem merge na main ou deploy. A publicação Git da nova branch está desativada nos dois `vercel.json`.

Foram lidos os contratos físicos, análise linear 2D/frame/mista, adaptadores de cargas e solicitações contínuas, integração local/HTTP, módulos resistentes, conexão mínima axial, vento e evidências da continuação. A revisão independente de `aa80040` foi confrontada com a continuação: condicionamento das entradas externas, conferência dos três eixos, contradições de furos e rastreabilidade já haviam sido corrigidos; não foram apresentados como descobertas novas.

## Ambiente reproduzível

Windows, Node 24 e Python 3.12. As versões efetivamente observadas, comandos, saídas, tempos e contagens estão em [checks.json](validation/mission31/checks.json). Instalação do aplicativo com `pnpm@12.15.0 install --frozen-lockfile`, sem mudar o lockfile.

Perfis Python separados:

1. Principal `.venv`: `engine/requirements-sections.lock`, incluindo solver e propriedades físicas; pacote `./engine` instalado sem resolver novamente as dependências.
2. `.tools/sections-fsm`: `engine/requirements-sections-fsm.lock`; NumPy 2.3.3, SciPy 1.15.3, pyCUFSM 0.2.0 e sectionproperties 3.10.2.
3. `.tools/fsm`: `engine/requirements-fsm.lock`, preservando a referência anterior com NumPy 2.2.6.

Não instalar o pacote do solver principal nos perfis opcionais: sua metadata exige as versões do solver. Os workers e o `conftest.py` importam explicitamente o código do repositório nesses perfis. `pip check` foi executado separadamente. BLAS/OMP/MKL usam uma thread. Configure `JPN_PYTHON_EXECUTABLE` e `JPN_SECTION_FSM_PYTHON_EXECUTABLE` a partir dos executáveis do computador atual; não há caminho de outro computador embutido no código novo.

## Achados e correções demonstradas

### P0 — resultados incompletos confundidos com ausência física de esforços

Um vetor de pórtico podia perder `Vy`, `Vz`, `T`, `My` ou `Mz` e continuar no cálculo resistente, pulando a componente ausente. Também era possível misturar segmentos de pórtico e exclusivamente axiais numa peça original. Seis testes novos falharam antes da correção.

Python e TypeScript agora exigem todas as componentes de pórtico, inclusive zeros explícitos. Somente uma peça exclusivamente axial pode omitir todas as cinco componentes transversais. O modelo não pode mudar entre segmentos da mesma peça. Os valores nulos legítimos das barras axiais continuam preservados; não foram preenchidos com esforços fictícios.

### P0 — encerramento incompleto de processo no Windows

O lançador de uma venv/uv pode iniciar outro processo Python. `child.kill()` no lançador não garante encerrar o cálculo e seus pipes. Os executores locais de análise e seção agora usam encerramento da árvore Windows, com argumentos separados, sem shell e sem janela visível. Linux conserva o sinal ao processo direto. A confirmação por `close`, o prazo de limpeza, a exclusão mútua e o bloqueio em caso de limpeza incerta continuam obrigatórios.

Os testes existentes de processos reais confirmam timeout de 20 s e cancelamento, incluindo o novo ambiente Windows. Os testes de ciclo de vida conservam a verificação de que a vaga não é liberada antecipadamente. Não se aumentaram os limites de produção.

### P1 — autovalor positivo do pyCUFSM incompatível com seu próprio modo

A busca de comprimentos de onda revelou valores muito sensíveis à representação do comprimento no problema modal distorcional de uma seção arredondada discretizada. No caso reproduzido, a 870,207965567 mm, `fsm.strip()` retornou cerca de **5,18956 MPa**, enquanto o modo retornado fornece aproximadamente **161,81774 MPa** pela razão de energias. Um pequeno deslocamento do comprimento produziu outro valor muito diferente. Esses números dependem do LAPACK/ambiente e não constituem referência normativa.

O diagnóstico reproduzível está em [modal-numerics.json](validation/mission31/modal-numerics.json), gerado por `engine/audit_modal_numerics.py`. A primeira identidade independente é:

`lambda = (uᵀ K u) / (uᵀ Kg u)`.

A produção continua usando as matrizes e espaços modais **da biblioteca real**. A nova avaliação:

1. Confere finitude e simetria das matrizes.
2. Obtém uma base ortonormal por SVD do espaço completo; se o posto não é resolvido, bloqueia, sem descartar modos físicos.
3. Projeta `K` e `Kg` e equilibra a diagonal da matriz elástica.
4. Resolve o problema simétrico inverso `Kg q = mu K q`, com métrica elástica positiva definida, pelo SciPy; `lambda = 1/max(mu)`.
5. Recusa energia elástica não positiva, condicionamento acima de `1e10`, resíduo projetado acima de `1e-8` ou contradição com a energia reconstruída acima do limite de acumulação de ponto flutuante.
6. No ponto governante, exige que esse limite de acumulação não exceda o alvo de refinamento já declarado, 0,001.

O limite de acumulação usa a dimensão do produto e epsilon de máquina; não é um percentual resistente escolhido para fazer o caso passar. Ele não cobre erro do modelo, classificação física ou erro de montagem da biblioteca. As magnitudes, limites e condicionamentos são exportados separadamente. O refinamento de malha não foi substituído pelo resíduo do autoproblema.

As referências independentes adicionais incluem espectros diagonais conhecidos com direção de energia geométrica nula, mudanças não ortogonais de coordenadas, escalas extremas e subespaço Rayleigh–Ritz com solução exata. Os casos MATLAB externos preexistentes permanecem comparados com o mesmo critério absoluto de `1e-4`; não se alteraram seus valores.

Os dois arquivos MATLAB também foram baixados novamente do repositório primário, no commit fixado da fonte: seus SHA256 coincidem com a proveniência registrada. Os 198 autovalores e respectivos comprimentos das fixtures são idênticos aos dados originais, antes da comparação com Python; veja [cufsm-provenance.json](validation/mission31/cufsm-provenance.json). Isso verifica a origem da referência livre, não homologa todos os subespaços modais de uma seção física arredondada.

### P0 — resultados anteriores precisam ser recalculados

A correção do autoproblema muda o avaliador automático para `jpn.nbr14762-mrd/3` e acrescenta a auditoria numérica. Os resultados `/2` continuam legíveis como histórico, mas não podem ser reutilizados como execução automática atual pelo endpoint ou relatório. O hash das entradas, isoladamente, não identifica a versão do algoritmo. Isso evita considerar atual um resultado anterior à correção simplesmente porque a geometria não mudou.

## Flambagem global e busca de mínimos

A expressão global monossimétrica existente foi conferida contra o problema generalizado independente de energia de três graus de liberdade. Os testes agora abrangem comprimentos efetivos diferentes e escalas geométricas/elásticas extremas, além de simetria, sinal do centro de cisalhamento e limite de Euler. Nenhum coeficiente normativo novo foi inventado.

A análise resistente automática continua restrita a compressão uniforme, seção Ue prismática, extremidades garfo/garfo com empenamento livre, sem contenção intermediária declarada e com comprimentos efetivos iguais ao vão físico. As 64 semiondas inteiras `L/m` permanecem o espectro finito investigado. Não existe demonstração da cauda para `m>64`.

Foi acrescentado um **diagnóstico contínuo separado** em logaritmo do comprimento de onda, com `scipy.optimize.minimize_scalar(method='bounded')`, até 120 avaliações por família e refinamento somente dos vales localizados na grade inicial. Placa simplesmente apoiada com solução energética `k=(b/a+a/b)²`, mínimo exato `k=4` em `a=b`, testa um mínimo entre pontos da grade; há testes de múltiplos vales, escala, limite de avaliações e valores inválidos.

O diagnóstico não substitui o espectro inteiro do membro: um comprimento de onda contínuo não é necessariamente um modo admissível do vão finito. Seus resultados não alimentam silenciosamente o MRD. Nem a grade inicial nem o otimizador local certificam mínimo global. As comparações e a auditoria estão em [mode-search.json](validation/mission31/mode-search.json) e [automatic-compression.json](validation/mission31/automatic-compression.json).

## Segunda ordem: incremento experimental limitado

Novo contrato offline `jpn.frame-pdelta/1`, com exemplo em `engine/examples/frame-pdelta-cantilever.json`. Ele usa o `analyze_PDelta()` do **PyNiteFEA 3.2.1**, sem solver próprio de elementos finitos. O resultado de primeira ordem original é devolvido separadamente.

O domínio inicial é uma **barra-coluna reta, prismática, explicitamente discretizada**, com material/seção/giro comuns, esforço axial uniforme, cargas nodais e sem liberações ou torção. Pórticos gerais, barras axiais `Spring3D`, modelos mistos e contrastes de seção são recusados. Não se acrescentam nós, apoios, rigidez ou imperfeições para estabilizar o modelo. Limites: 100 nós, 128 pórticos, 768 MiB e executor pai de 20 s.

Inspeção da versão instalada confirmou duas etapas: solução elástica inicial e solução com `Ke+Kg(N_linear)`. O parâmetro nativo `max_iter` controla a convergência dos conjuntos unilaterais, não prova iteração de Newton da geometria completa. Não anunciamos convergência não linear.

O pós-processamento nativo reavalia ações com o esforço axial atualizado. Para a experiência de tensão inicial, as ações são recuperadas com as **mesmas matrizes nativas efetivamente resolvidas**. Valores nativos são conservados junto aos valores consistentes para auditoria. Resíduo da equação de tensão inicial, equilíbrio correspondente, resíduo com esforço axial atualizado e resíduo da geometria totalmente deformada são distintos. Os dois últimos não são declarados convergidos. Não se afrouxou o critério de equilíbrio para aceitar a aproximação.

Referências fechadas independentes para balanço:

- Compressão `P>0`: `delta = H/P * (tan(kL)/k - L)`, `k²=P/EI`.
- Tração `T>0`: `delta = H/T * (L - tanh(kL)/k)`.
- Biapoiada com carga transversal central: `delta = H/(2P) * (tan(kL/2)/k - L/2)`.

São testadas três malhas declaradas, compressão/tração, inversão de carga, rotação dos eixos globais, reações, instabilidade acima de Euler, grandes movimentos, mecanismo, geometria degenerada e subprocesso real. O teste de contraste de rigidez comprova recusa fora do domínio; não é alegado como validação de um pórtico heterogêneo. Pórticos deslocáveis/não deslocáveis gerais e segunda ordem mista **continuam pendentes**.

Reprodução com o Python principal:

```text
python engine/check_frame_pdelta.py engine/examples/frame-pdelta-cantilever.json --output resultado.json
```

O lançador impõe o prazo ao worker, inclusive encerramento da árvore Windows. O resultado continua `experimental-frame-only`, com `mesh_convergence_verified=false`, `normative_second_order_verified=false` e fabricação falsa; a convergência demonstrada pelos testes não certifica uma malha arbitrária enviada pelo usuário.

## Vento, ligações e coberturas externas

O cálculo existente de S2/Vk/q e o caminho zonal de forças/momentos foram preservados. S2 foi isolado numa função validada para permitir comparação sem inventar V0/S3 ausentes em uma publicação. Não foram criados coeficientes cpe/cpi, topografia, isopletas ou fatores de combinações normativas sem o texto aplicável.

Duas fontes primárias foram obtidas legitimamente e inspecionadas. Apenas os dados mínimos transcritos e os metadados são publicados em [external-reference-inputs.json](validation/mission31/external-reference-inputs.json); os PDFs e capturas permanecem locais.

| Referência | Comparação efetiva | Limite |
|---|---|---|
| UBS Conselvan, memorial rev.3, folhas 9–10 | Categoria II, classe B, 4,65 m: S2 e cadeia aritmética com a velocidade de 33 m/s | A mesma fonte também declara 45 m/s e adota arbitrariamente outra pressão; não homologada como referência de vento completo |
| Santana/UFMG 2025, pp.24–25, figuras 9–11 | Categoria III e classe A confirmadas visualmente; 7,5 m; comparação de S2 publicado 0,913 | Não reproduz apoios, topografia, combinações e respostas do modelo completo |

O intervalo de comparação é metade da última casa impressa, por arredondamento da fonte; não se ampliou tolerância por conveniência. As figuras foram usadas para ler seleções/campos numéricos, não para estimar autovalores de curvas. **Dois modelos completos independentes de cobertura não foram reproduzidos.** As pendências físicas estão individualizadas no JSON e a condição do gate global permanece falsa.

PR #38: os oito arquivos adicionados foram examinados e os 29 testes de parafuso/solda/CLI foram executados com dependências reais em worktree separado. São verificações isoladas de um parafuso/duas chapas e de um cordão plano, com solicitações declaradas. Não há prova de distribuição de esforços de grupo, excentricidade, caminhos completos de ruptura ou equivalência com a ligação cadastrada. A fonte normativa integral usada no outro computador não está neste ambiente; a revisão desta campanha não equivale à reconferência integral de suas cláusulas. **Integração automática não efetuada.** O resultado permanece no PR próprio para uma auditoria normativa e física de integração, sem dar aprovação à junta.

## Validação, falhas e evidências

O roteiro integral é registrado em [checks.json](validation/mission31/checks.json), com logs e JUnit separados por perfil, resultados numéricos e relatórios Vitest/Playwright. O bloco de fechamento registra as contagens finais, sem somar reexecuções como testes novos.

A CI da base foi inspecionada pela API: [run 41687920455](https://github.com/brunoJuniorBrz/JPN/actions/runs/41687920455), nove jobs com `steps=[]`, `runner_id=0` e nome de runner vazio. A tentativa de obter o log do job de aplicação retornou 404/BlobNotFound. Portanto a base não executou testes remotos nessa rodada; não há evidência de defeito do código nesses jobs. Não foram alterados faturamento, quotas, permissões, runners ou recursos pagos. O estado da CI do novo commit será registrado separadamente; sucesso local não prova Linux.

Falhas iniciais preservadas:

- Seis casos de vetor incompleto/mudança de modelo não eram recusados; corrigidos em Python/TypeScript.
- Dois subprocessos cFSM do baseline excederam 20 s durante suítes numéricas concorrentes. A repetição isolada é registrada; timeout e tolerâncias não foram aumentados.
- O baseline JavaScript sob concorrência teve timeouts e pendências decorrentes de hook; não é anunciado aprovado. O teste de processo também motivou a correção da árvore Windows.
- A primeira tentativa de instalar o pacote principal no perfil FSM encontrou build/metadata incompatíveis. Seguir somente o lockfile opcional corrigiu o ambiente; não houve downgrade do solver.
- Nos testes novos de P-Delta, confundir a rigidez usada com `Kg` reavaliada e confundir equilíbrio de tensão inicial com geometria não linear completa causou falhas. A formulação foi identificada no código nativo, os dois resíduos passaram a ser separados e as ações foram recuperadas consistentemente. Também se corrigiu uma conversão NumPy de coordenadas inteiras para vetor normalizado.
- Uma execução JavaScript intermediária encontrou um módulo em cache enquanto os arquivos ainda mudavam. Ela foi mantida como falha; a validação final usa a árvore congelada.
- Um tipo novo do teste de fonte externa não satisfazia a assinatura genérica do Vitest. O tipo da tabela foi explicitado; nenhuma expectativa numérica mudou.

Advertências upstream conhecidas de conversão escalar do pyCUFSM continuam identificadas. Outras advertências impedem a execução. Não foram adicionados skips para tornar a campanha verde.

## Matriz de procedimentos e condições de liberação

| Procedimento | Estado | Condição/limite |
|---|---|---|
| Recusa de campos resistentes incompletos | IMPLEMENTADO E VALIDADO NO DOMÍNIO | Vetores completos de pórtico ou nulidade transversal integral de axial |
| Encerramento dos workers Windows | IMPLEMENTADO E VALIDADO NO DOMÍNIO | Processo/descendentes encerrados e confirmação de close; falha mantém bloqueio |
| Flambagem global monossimétrica | IMPLEMENTADO E VALIDADO NO DOMÍNIO | Hipóteses existentes de seção, eixos, vínculos e SI; não estabilidade global da cobertura |
| Solução cFSM estabilizada | IMPLEMENTADO EXPERIMENTALMENTE | Espaços da biblioteca, posto/energia/resíduo/condicionamento, três malhas e semiondas 1–64 |
| MRD automático abaixo da capacidade | CONDICIONAL | Sem prova da cauda, classificação física universal ou todos os estados-limites |
| Busca adaptativa de vales | IMPLEMENTADO EXPERIMENTALMENTE | Diagnóstico local limitado, sem alimentar silenciosamente resistência |
| P-Delta de barra-coluna reta | IMPLEMENTADO EXPERIMENTALMENTE | Modelo de tensão inicial nativo, malha explicitamente declarada; CLI local |
| Pórticos gerais e segunda ordem mista | BLOQUEADO | Exige formulação física para axiais e validação independente de quadros deslocáveis/não deslocáveis |
| S2/Vk/q parcial e caminho zonal declarado | CONDICIONAL | Edição/hipóteses previamente implementadas; cpe/cpi e combinações ainda declarados |
| Vento/combinações normativos completos | NÃO IMPLEMENTADO | Fontes integrais/correções e domínios de cobertura ainda precisam ser verificados |
| Ligações completas e integração automática do #38 | BLOQUEADO | Auditoria normativa, grupo/caminho físico, todos os estados-limites e vínculo ao solver |
| Dois benchmarks externos completos | BLOQUEADO | Restituir geometria, vínculos, ações e resultados sem dados inventados |
| Fabricação/compra/corte/ART | BLOQUEADO | Nenhuma alteração desta missão concede liberação |

## Fontes e próximos passos

- [CUFSM, descrição oficial da decomposição modal](https://www.ce.jhu.edu/cufsm/about/).
- [Código primário do pyCUFSM](https://github.com/brookshsmith/pyCUFSM), além do artefato 0.2.0 instalado, cuja licença AFL-3.0 e limites já estão registrados no repositório.
- [SciPy `eigh`](https://docs.scipy.org/doc/scipy/reference/generated/scipy.linalg.eigh.html): problema simétrico generalizado e necessidade de métrica positiva definida.
- [SciPy `minimize_scalar`](https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.minimize_scalar.html): busca local limitada, sem garantia de mínimo global.
- [PyNite P-Delta, descrição oficial](https://pynite.readthedocs.io/en/stable/PDelta.html), confrontada com `Analysis._PDelta`, `FEModel3D.Kg` e `Member3D.f` da versão 3.2.1 efetivamente instalada.
- [Memorial municipal Conselvan](https://www.aripuana.mt.gov.br/public/files/publicacoes/memorial-de-calculo_2c34.pdf).
- [Santana/UFMG, fonte institucional](https://repositorio.ufmg.br/items/51216d50-19e1-4a04-8cea-acc421123cd4).

Próximos passos: validar os espaços modais de Ue contra referências externas de classificação, com geometrias/raios equivalentes; investigar espectro além de 64 semiondas antes de ampliar o domínio; completar referências de pórticos para segunda ordem; obter as normas/correções e dados completos das duas coberturas; então integrar ligações por participantes e combinações concomitantes. Os bloqueios normativos e profissionais permanecem no código.

## Fechamento

Implementação validada: `b32fb29bfc6a6f163e9a708c65282b21d3e8af87`, derivada de `00e61f68d1013f2d34dfa74554c84edc27efad72`. A campanha integral terminou em 03/11/2026, às 19:40:36 UTC, antes de registrar o commit, com a implementação congelada. Os commits seguintes acrescentam somente documentação e evidências. O SHA de entrega e o estado remoto da CI constam no PR; não se presume aprovação remota a partir do sucesso local.

| Verificação local real | Resultado |
|---|---|
| Base inicial em worktree limpo e isolado | 1.524 testes Python e 1.000 comparações independentes; fonte limpa antes/depois |
| Python principal da implementação final | 1.580 testes, zero falhas, erros ou skips; 1.000 comparações independentes |
| Perfis opcionais separados | 8 testes de propriedades/resistência, 4 FSM legado e 12 de flambagem/modal; todos passaram |
| PR #38 isolado, sem integração | 29 testes passaram |
| TypeScript e ESLint | Ambos passaram |
| Vitest | 388 testes em 47 arquivos, sem falhas ou pendências |
| Playwright | 73 cenários reais, sem falhas, skips ou resultados instáveis |
| CAD/DXF | Regeneração passou; ezdxf 1.4.5 confirmou 130 linhas 3D em mm, sem erros de auditoria |
| Build de produção | Passou |
| Integridade dos três ambientes Python | `pip check` passou em cada perfil |
| Preservação | 78 fontes/lockfiles conferidos iguais à base, normalizando somente CRLF do checkout |

Os arquivos [summary.json](validation/mission31/summary.json), [baseline/checks.json](validation/mission31/baseline/checks.json) e [preservation.json](validation/mission31/preservation.json) ligam essas conclusões às evidências. As reexecuções de CAD e do baseline não são somadas como testes novos. A campanha aleatória manteve máximos absolutos de `2,046e-14 m` para deslocamento, `1,654e-7 N` para reação e `1,680e-7 N` para força axial, todos na semente 471.

O exemplo automático real de compressão produziu resistência calculada de `22.682,489777 N`: a solicitação de 1 kN permanece `CONDITIONAL-MODEL-LIMITS` e a de 200 kN resulta `FAIL`, ambas com avaliador `/3`. Isso não representa aprovação completa da peça. No exemplo P-Delta de barra-coluna a 60% de Euler, o deslocamento calculado foi `0,002644496839 m`, contra `0,002644497144 m` da solução fechada, diferença relativa de `1,1563e-7`, dentro das hipóteses restritas descritas acima.

**Entrega parcial:** as correções e os diagnósticos são executáveis; segunda ordem mista, pórticos gerais, vento normativo completo, integração física/normativa de ligações e dois modelos externos completos continuam pendentes. Nenhuma liberação para fabricação, compra, corte, ART, merge na main ou deploy foi concedida por esta campanha.
