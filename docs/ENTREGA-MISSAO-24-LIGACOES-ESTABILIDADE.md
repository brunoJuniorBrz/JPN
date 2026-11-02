# M24 parcial — ações de ligações e diagnóstico de estabilidade

## Base e conclusão do escopo

Base exata: PR #31, `feat/m23-resistant-design`, commit `e97fb74c5eef2e0c70bf3ba88fc0c91de64566fe`. PR #30 permaneceu em `280a4c89b6e41a2a5295142dcd2b5bfc6d7208e0`. HEADs e [CI da base](https://github.com/brunoJuniorBrz/JPN/actions/runs/41469390697) conferidos antes do desenvolvimento: success. Lida a [auditoria do PR #31](https://github.com/brunoJuniorBrz/JPN/pull/31#pullrequestreview-5738983815): transformação local/global e equilíbrio de juntas eram a prioridade; extremos contínuos resistentes e validação geométrica normativa continuam pendentes.

Nova branch `feat/m24-connections-stability`, PR draft contra a M23. Snapshot isolado `.tools/mission24-worktree`, pois o diretório recebido não tem `.git`; arquivos-base conferidos por hashes Git. Deploy Git bloqueado nos dois arquivos Vercel antes de publicar a branch. Sem merge, deploy manual, alteração da main ou dos arquivos reservados à M25.

**Entregue:** recuperação/transformação de ações reais, equilíbrio por junta e combinação, cadastro físico rastreável, diagnósticos, seleção de nós/participantes no 3D e exportação preliminar. **Não entregue:** resistência normativa de ligação, segunda ordem validada, estabilidade normativa ou liberação de fabricação. M23 permanece parcial.

## Fonte matemática: PyNiteFEA 3.2.1 real

Foram inspecionados diretamente, na instalação efetivamente utilizada, `Member3D.T()`, `Member3D.f()`, `Spring3D.F()` e a assinatura/documentação de `FEModel3D.analyze_PDelta`. A versão é conferida pelo adaptador como 3.2.1. A [documentação pública de membros](https://pynite.readthedocs.io/en/latest/member.html) e [FEModel3D](https://pynite.readthedocs.io/en/latest/FEModel3D.html) é complementar; suas páginas se identificavam como 3.2.0, portanto não substituíram a inspeção do código instalado 3.2.1.

- As linhas de `R = sub_member.T()[:3,:3]` são os eixos locais expressos no global. A matriz completa é bloco-diagonal, repetindo R para forças, momentos e ambas as extremidades. Transformação **global = Rᵀ × local**.
- A base provém do PyNite, incluindo seu tratamento de barras horizontais/verticais, sentido início→fim e giro. Não se reconstrói uma base presumindo Z local vertical ou coincidência com XYZ. JPN mantém Z global para cima; a convenção interna do PyNite não é substituída por essa convenção visual.
- Verificados eixo x contra a direção geométrica, ortonormalidade e determinante +1, com 1e−12, coerente com a guarda já existente do solver. Bases não ortogonais continuam recusadas; não são reparadas artificialmente.
- `sub.f()` fornece **ações do nó sobre o membro**. Já inclui reações de engastamento perfeito das cargas distribuídas, condensadas pelas liberações declaradas. Não se usa o vetor de esforços internos amostrados da M23 como ação nodal de extremidade.
- Para a junta, a ação da barra sobre o nó é o **negativo** do vetor global nativo. Forças e momentos sofrem a mesma transformação ortogonal e a mesma troca de sinal.
- N interno positivo significa tração. Em uma axial orientada i→j com direção d, ações nativas são −N·d em i e +N·d em j; as ações sobre os nós têm sinais opostos. `Spring3D.F()` foi comparado a essa referência independente. Não se introduzem momentos ou rigidez rotacional axiais.

O núcleo de análise continua sendo o mesmo. Acrescentou-se um coletor opcional ao adaptador, sem alterar montagem, tolerâncias, apoios, rigidez ou resolução matricial. O teste de compatibilidade compara resultados com e sem coletor, retirando somente o tempo de execução.

## Contratos e execução compatível

| Contrato | Finalidade |
|---|---|
| `jpn.member-end-actions/1` | Base real R por segmento, extremos/tipo e cargas nodais efetivamente compiladas por combinação, vinculados ao hash da análise |
| `jpn.connections/1` | Declarações construtivas por nó/peças originais; componentes conhecidos ou pendentes |
| `jpn.connection-report/1` | Ações globais por extremidade/junta/combinação, equilíbrio, declarações, diagnósticos e hashes |

Os modelos `jpn.mixed3d/1` e `/2` e os respectivos resultados não mudaram de contrato. Sem opção adicional, respostas anteriores permanecem sem metadados novos. A nova opção explícita é o cabeçalho `X-JPN-Joint-Actions: 1`, encaminhado no mesmo fluxo protegido; internamente o worker recebe `--joint-actions`. O frontend oferece “Calcular ações de ligações”; o cálculo misto anterior continua disponível.

O coletor Python permite auditar as ações globais nativas nos testes. No transporte, esses vetores globais redundantes são omitidos: a aplicação transforma os esforços locais já retornados usando R real e confere equilíbrio. Isso preserva o limite anterior de **2 MB**, sem arredondar números ou reduzir precisão. A primeira tentativa de transmitir ambos os vetores excedeu esse limite na cobertura; foi corrigida a representação de telemetria, não o resultado matemático.

Mantidos Python 3.12, PyNiteFEA 3.2.1, subprocesso `-I`, memória 768 MiB, timeout de 20 s, uma execução por instância, entrada 500 kB, autenticação Bearer/operador, origem e validações estritas. Health e contratos antigos permanecem compatíveis. A opção é testada em HTTP **local real**, não em deployment Vercel. Backend remoto anterior que não forneça os metadados produz `JOINT_TRACE_UNAVAILABLE`; não há fallback silencioso nem publicação automática.

## Equilíbrio e cargas

Para cada nó e combinação, separadamente:

`Σ(ação da barra sobre nó) + carga externa nodal compilada + reação nos DOFs realmente vinculados = 0`.

- Não são misturados máximos de combinações diferentes.
- Reações são identificadas como apoio sobre estrutura. A transferência à fundação tem sinal oposto. Resíduos de DOFs livres não são apresentados como reações físicas.
- Pórticos fornecem seis componentes por extremo. Axiais fornecem somente força; momentos e rotações inexistentes são null/não aplicáveis.
- Cargas nodais originais são agregadas com seus fatores. Somente o peso axial explicitamente concentrado metade por nó é acrescentado à parcela nodal.
- UDL e peso de pórticos já afetam os esforços de extremidade: **não são somados novamente como carga nodal**. Seus resultantes de corpo são incluídos apenas na conferência global, com braço até o centro do carregamento uniforme.
- Balanço global de forças e momentos é calculado em relação à origem física registrada, adotando o primeiro nó como referência, evitando dependência numérica de uma translação absoluta do modelo.

A conferência usa norma equivalente `[F; M/L]`, com L igual à maior dimensão global do modelo, mínimo 1e−5 m, coerente com a escala existente. Limite por junta/global: `1e−6 N + 1e−8 × soma das normas equivalentes das ações`. A parcela absoluta trata ruído de arredondamento em juntas quase descarregadas; a relativa acompanha a escala das solicitações. Não se alterou o critério do solver. Não finitos, base inválida, carga compilada incompatível ou desequilíbrio geram erro e bloqueiam o relatório; nunca uma resultante zero fabricada.

O relatório reutiliza a validação/mapeamento da M23: peça original, segmento, t0/t1, extremo original ou corte interno, combinação e hashes. Uma seção interna de barra contínua não recebe liberação nem é automaticamente classificada como emenda física.

## Declarações de ligações

Uma declaração por nó do modelo físico e todos os participantes daquele nó. Tipologias: terça sobre tesoura/viga, membros de treliça, viga/pilar, base/ancoragem e emenda explicitamente declarada. Papéis e IDs vêm do modelo, não de nomes comerciais. A conectividade precisa ter sido previamente declarada/revisada no adaptador existente; coincidência visual isolada não cria ligação construtiva.

Registram-se ID, hipótese de transferência, comportamento por peça, fonte, revisão, responsável, excentricidade e rigidezes conhecidas/pendentes. As liberações efetivamente analisadas são mostradas. A declaração **não altera o solver**: comportamento incompatível, semirrigidez, excentricidade não representada ou participantes incorretos geram pendências. Não se inventam rigidezes, chapas ou ancoragens. Alterar um apoio ou uma liberação exige fazê-lo explicitamente na preparação física existente e reexecutar.

Componentes opcionais: chapa (dimensões/material), conjunto de parafusos (quantidade, diâmetro, classe, arranjo, furos/distâncias), solda (tipo, posição, tamanho, comprimento/material) e contenção identificada. Valores ausentes ficam null. IDs físicos são únicos no cadastro, preparando futura associação à M25 sem duplicação. Não é gerado quantitativo comercial ou detalhamento aprovado.

Estados separados: identificado no modelo; fisicamente declarado; hipótese consistente com a análise; ações calculadas; resistência verificada; fabricação aprovada. Os dois últimos permanecem falsos. Uma chapa cadastrada sem espessura não se transforma em chapa dimensionada. Emendas exigem extremidades originais de pelo menos duas peças; cortes de discretização não bastam.

Limites de cadastro: até 250 declarações, 30 participantes e 100 componentes por ligação; são limites computacionais, não normativos. Geometria alterada bloqueia o vínculo existente e exige revisão integral; não se renovam silenciosamente declarações antigas.

## Diagnósticos e interface

Preservados mecanismos/apoios insuficientes, liberações incompatíveis, componentes desconectados, contatos não resolvidos, matrizes mal condicionadas e falhas numéricas/equilíbrio do motor existente. Mensagens contextualizadas mantêm os códigos de erro. Não se identificam automaticamente os vetores modais ou a causa única de um mecanismo a partir desses códigos.

No sucesso, apresentam-se DOFs livres/restringidos/inativos, condição escalada e resíduos reais. DOF livre não significa, sozinho, mecanismo; a classificação vem da análise matricial validada. **Primeira ordem numericamente resolvida não comprova estabilidade normativa.**

PyNite 3.2.1 possui `analyze_PDelta`, com iteração e controle de convergência. Não foi aplicado automaticamente ao modelo misto: faltam validação independente integral e domínio de aplicabilidade deste adaptador, inclusive comportamento axial/estabilidade e exigências normativas. Segunda ordem e estabilidade normativa permanecem explicitamente pendentes.

A interface permite selecionar nó/ligação por controle acessível e ativar marcadores selecionáveis no visualizador 3D existente. Seleção e peças participantes são sincronizadas; ações são mostradas na combinação corrente, com formulário e exportação técnica. Marcadores indicam seleção, não segurança. Controles comerciais e navegação geral não foram refeitos.

## Validação independente

1. Vinte casos de balanço espacial: direções X, Y, Z, (2,3,4) e (−2,−3,4), giros 0°, 37°, −23° e 90°. Força de ponta F=[120,−230,340] N, torque de ponta 32·d N·m e UDL q=[12,−23,34] N/m. Referências de estática: `Fi=−F−qL`, `Mi=−32d−r×F−(r/2)×qL`, `Fj=F`, `Mj=32d`. A axial transversal explicitamente declarada é perpendicular a F e d, sem estabilização fictícia do plano do ensaio.
2. Para barra em +X, base girada conhecida independentemente: linhas `[1,0,0]`, `[0,cosθ,sinθ]`, `[0,−sinθ,cosθ]`, conferidas contra R real. Transformações de força/momento comparadas às ações globais nativas.
3. Extremidade articulada/engastada com UDL: reações 3/8 e 5/8 de −qL e momento de engaste de módulo |q|L²/8; momento liberado zero. Cargas nodais compiladas permanecem zero, evitando duplicação de UDL.
4. Junta axial não coplanar, três direções independentes e forças conhecidas 1200, −800 e 600 N. Carga externa obtida por equilíbrio estático independente. Inversão por fator −2, sinais e ausência de momentos/rotações axiais. O núcleo axial é estável pelas três direções; o pórtico com apoios declarados do caso misto não cria apoio automático no nó examinado.
5. Modelos sem vínculos, liberação torsional incompatível e nó órfão: erros explícitos. Sem artifícios de rigidez.
6. Cobertura M22/M23 gerada: 132 nós, 207 peças, 243 segmentos, 486 incidências de extremidades por combinação. Reações verticais WP=50000 N, WS=−50000 N, DOUBLE=100000 N, SUM=70000 N; todas as juntas e balanço global conferidos, incluindo peso próprio axial/pórtico em caso separado.
7. Bases/cargas/ações corrompidas, revisão obsoleta, declaração/componentes duplicados, preservação de apoios/liberações, backup e invalidação.

Os testes iniciais Python tiveram 21 recusas porque o gerador de ensaios utilizava escalares NumPy em entrada estrita. Corrigidas as entradas para números Python nativos, sem afrouxar o contrato; 26 casos matemáticos passaram. Houve também a recusa inicial por limite de saída de 2 MB descrita acima. Comandos finais, resultados e tempos estão em [checks.json](validation/mission24/checks.json). Falhas iniciais não são omitidas.

## Normas e pendências de engenharia

Nenhuma equação resistente normativa de ligação foi implementada ou classificada como ATENDE. As referências candidatas permanecem as edições identificadas na base: NBR 8800:2024 Versão Corrigida:2025 e NBR 14762:2010, com critérios de ações/combinações pertinentes ainda pendentes da M22.

A [biblioteca oficial CBCA](https://www.cbca-acobrasil.org.br/site/biblioteca?bsc=ativar&bscPgn=1&bscQtdReg=10&chkCat%255B%255D=7), consultada nesta missão, exige autenticação para os downloads. Seu manual de Ligações em Estruturas Metálicas, de 2020, declara referência à NBR 8800:2008; não foi tratado como fundamento automático da edição 2024/2025. Não se contornou o acesso, não foram usadas reproduções não autorizadas, nem inventadas cláusulas ou coeficientes.

Faltam procedimentos integrais e exemplos independentes para parafusos, soldas, chapas, ruptura/esmagamento/instabilidades pertinentes, bases/ancoragens, contenções e estabilidade global. A lista não é uma verificação completa de modos de falha de qualquer tipologia. M23 continua sem resistência normativa; extremos contínuos resistentes não são encontrados pela M24.

Pendências de publicação: nenhum smoke novo na Vercel; novo backend/frontend precisam ser publicados somente mediante autorização posterior. Pendências técnicas: ligações semirrígidas e excentricidades modeladas, segunda ordem validada, normas integrais, verificações resistentes e revisão do engenheiro. **Não aprovado para fabricação, compra ou corte.**

## Validação local final

Ambiente: Windows, Python 3.12.10, PyNiteFEA 3.2.1, NumPy 2.5.4, SciPy 1.18.1, Node 24.13.0 e pnpm 12.15.0. OPENBLAS_NUM_THREADS, OMP_NUM_THREADS e MKL_NUM_THREADS fixados em 1. Os comandos Python usaram o interpretador configurado em `.tools/python/python.exe`; o runner e o navegador utilizaram `JPN_PYTHON_EXECUTABLE` absoluto para esse mesmo interpretador.

| Comando | Resultado real | Observações |
| --- | --- | --- |
| `python -m pytest engine/tests/test_joint_actions.py -q` | 26 aprovados | Referências independentes e erros físicos; 1,10 s. |
| `python engine/validate.py` | 1473 aprovados, 0 falhas/erros/ignorados | Inclui os 29 novos casos Python, motores anteriores, benchmarks e campanha independente de 1000 modelos; 68,54 s. |
| `pnpm typecheck` | exit 0 | Repetido após a última alteração. |
| `pnpm lint` | exit 0 | Repetido após a última alteração. |
| `pnpm test` (reporter JSON) | 320 aprovados, 0 falhas/ignorados | Regressão completa antes da correção final de representação descrita abaixo. |
| `pnpm vitest run src/domain/connection-report.test.ts` | 8 aprovados, 0 falhas | Código final; integração com Python real, inclusive novo caso axial. |
| `python tests/verify_dxf.py` | exit 0 | ezdxf 1.4.5, 130 linhas 3D, unidades mm. |
| `pnpm test:e2e tests/e2e/connections.spec.ts` | 2 aprovados | 375/1440 px, 55,75 s; análise real, inspeção, declaração, invalidação, reanálise e exportação. |
| `pnpm test:e2e` (reporter JSON) | 68 aprovados, 0 falhas/ignorados/flaky | 366,11 s; regressões comerciais, visualização, persistência e exportações existentes. |
| `pnpm build` | exit 0 | Repetido após a última alteração. |

Na conferência final, os resíduos rotacionais de nós exclusivamente axiais passaram a ser `null`, coerentemente com os graus de liberdade inativos, em vez do zero legado do solver. Nenhuma matriz ou resultado numérico foi alterado. Um oitavo ensaio TypeScript resolve a cobertura com uma coluna axial e base com rotações livres explicitamente declaradas; confirma momentos/rotações ausentes, equilíbrio e ausência de vínculos artificiais. Após essa alteração foram repetidos os oito ensaios do módulo, TypeScript, lint e build. A suíte completa anterior contém sete ensaios desse módulo; não se somam execuções repetidas como novos testes.

Os tempos são observações locais, sem garantia de SLA. Os benchmarks registrados em `checks.json` pertencem à validação existente e não medem especificamente o novo painel. Os testes de navegador confirmam seleção acessível do nó e sincronização dos marcadores 3D; o acerto de um marcador por raycast não foi automatizado. O caminho remoto está preparado, mas não foi comprovado por smoke online nesta missão. Linux depende da CI do novo commit; a aprovação da CI da base não é atribuída à M24.

Não foram alterados os arquivos reservados da M25, suas planilhas, quantitativos ou planos de corte. A publicação será um PR draft contra a M23, com deploy Git desativado nas duas configurações Vercel. Não se executou merge ou deploy.

**Veredito do escopo entregue: APROVADO COM RESSALVAS — M24 parcial, ações de ligações e diagnóstico de estabilidade.** As ressalvas acima impedem qualquer interpretação de aprovação resistente, estabilidade normativa ou liberação de fabricação.
