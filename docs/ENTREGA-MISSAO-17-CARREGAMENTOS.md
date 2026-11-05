# Missão 17 — peso próprio e cargas uniformes no modelo misto

## Entrega principal

Base: `main` **01caa9f2c5fd6f38b2d98769f597d9b73aaee359**, que já incorporou a Missão 16. Branch própria `feat/explicit-selfweight-distributed-mixed3d`. Desenvolvimento em checkout isolado `.tools/mission17-worktree`; arquivos do diretório original preservados. Nenhum merge/deploy nesta missão.

Implementada a cadeia **estrutura mista → densidade/gravidade explícitas → peso próprio/carga uniforme → processo Python real → deslocamentos, esforços internos e reações no JPN**, reutilizando preparação, executor protegido e visualizador. Contrato antigo `jpn.mixed3d/1` e resultados nodais antigos preservados. A versão nova é `jpn.mixed3d/2`, com resultado `jpn.mixed3d-result/2` e adaptador `jpn.mixed-adapter/2`.

Executar com o ambiente da Missão 16: Python **3.12**, dependências reais de `engine/requirements-validation.lock`, pacote editable deste checkout, Node 24, pnpm 12.15.0. Configurar `JPN_PYTHON_EXECUTABLE` com caminho absoluto e executar `pnpm dev:structural`. Abrir **http://127.0.0.1:3000**, criar/abrir levantamento → **Análise Estrutural Experimental → Abrir exemplo de peso e cargas → Executar análise mista local**. Conferir o painel de cargas, selecionar combinação, peça, segmento e nó; exportar entradas/resultados. O exemplo não altera a obra.

## Formulação e contratos

`mixed3d_loads.py` valida/compila as novas ações, sem implementar matriz de elementos finitos. O núcleo anterior é compartilhado por um caminho interno explícito, mantendo entrada pública v1 estrita. Densidade é massa por volume, em kg/m³, com fonte/revisão obrigatórias; não é peso específico. Cada segmento tem uma única densidade declarada; cobertura completa é exigida quando peso está ativo. g é um vetor global em m/s² não nulo, informado pelo usuário.

Para cada segmento: **m=ρAL**, **q=ρAg**. A vem da seção física, não da seção provisória de exibição. Comprimento vem dos extremos físicos em metros. O material PyNite continua com densidade zero: não existe segunda aplicação de peso próprio pela biblioteca. Pórticos recebem q como força uniforme global por comprimento real. Axiais recebem **m·g/2 em cada extremo**, por hipótese obrigatória `half-to-end-nodes`; nenhuma flexão/torção de treliça é criada. A aproximação não representa a flecha contínua por peso transversal de uma barra axial.

O caso de peso próprio é exclusivo e não pode conter cargas nodais/distribuídas manuais. Não se alteram cargas nodais cadastradas. A UI só cria caso/combinação mediante ação explícita, com fator 1 no caso isolado e zero nos demais; fatores das combinações antigas recebem zero para o caso novo. Não são combinações normativas. Desativar peso mantém caso/combinações para revisão explícita; caso vazio não é tratado como carga zero presumida. O sistema não consegue identificar peso embutido pelo usuário em outro caso manual: o responsável deve revisar eventual dupla contagem entre casos diferentes.

As cargas uniformes especificam ID, elemento, caso, vetor **N/m**, sistema **global/local**, fonte e revisão. Formulário em kN/m com conversão ×1000. Apenas forças constantes em todo o segmento de pórtico; sem cargas parciais, trapezoidais ou momentos distribuídos nesta etapa. Carga distribuída em axial é recusada, mesmo que sua direção pareça longitudinal. No adaptador, uma declaração por peça é aplicada com a mesma intensidade a todos os seus segmentos, sem multiplicar a intensidade pela quantidade de segmentos.

Usamos a API real `FEModel3D.add_member_dist_load`: maiúsculas `FX/FY/FZ` significam global, minúsculas `Fx/Fy/Fz` local. PyNiteFEA **3.2.1** aplica ações de extremidade consistentes e condensa liberações. A auditoria inspecionou seu código instalado e comparou diretamente ações, deslocamentos e convenções de esforços com chamadas nativas independentes do adaptador. Não são usados `self_weight=True`, massas modais ou análise P-Delta.

## Recuperação e equilíbrio

As ações do pórtico incluem **f=k·d+FER**. O equilíbrio nodal usa essas ações completas contra reações+cargas nodais; adicionar a força nodal equivalente do UDL uma segunda vez nessa comparação duplicaria a carga. No equilíbrio global acrescentamos **q_global·L** no centro geométrico de cada segmento e o momento do resultante em relação à mesma origem usada para as reações. O peso axial entra uma única vez pelas cargas concentradas compiladas. Equilíbrio nodal/global continua obrigatório, resíduo relativo ≤1e−8; nenhuma tolerância foi relaxada.

Para q local constante e ações locais a na extremidade inicial, a recuperação nova é:

```text
N(x)  = -a0 - qx*x
Vy(x) = -a1 - qy*x
Vz(x) = -a2 - qz*x
T(x)  = -a3
My(x) = -a4 - a2*x - qz*x²/2
Mz(x) = -a5 + a1*x + qy*x²/2
```

Essas expressões de equilíbrio incluem os termos distribuídos, distintos da recuperação nodal v1. Cinco estações em x/L=0, 1/4, 1/2, 3/4 e 1 incluem deslocamentos locais fornecidos pelo PyNite real, que incorporam a parcela de carga distribuída. Vigas biapoiadas/bi-engastadas podem ter deslocamentos nodais zero e flecha interna não nula; isso foi explicitamente testado. Não são envelopes resistentes nem busca de máximos de todas as combinações. O N de destaque do pórtico corresponde à extremidade inicial; N(x) variável está nas estações. Axiais continuam com N positivo em tração, negativo em compressão; não recebem estações de flexão inexistentes.

A saída v2 exige estações próprias: a UI não usa as fórmulas nodais v1 em resultados carregados. Hash canônico abrange todas as ações/densidades; identidade de projeto/revisão, IDs/tipos e versão de resultado são conferidos. O frontend e o runner também verificam rastreabilidade, massa ρAL, vetores de peso, densidades/fontes e total da massa; resposta adulterada é recusada. Edição de densidade/cargas invalida resultados e aborta solicitações pendentes.

## Referências independentes e exemplo

Derivações independentes Euler–Bernoulli, EIv''''=q, condições de contorno declaradas, sem reutilizar K do PyNite como oráculo:

- Balanço: v(L)=qL⁴/(8EI), θ(L)=qL³/(6EI), reação −qL e momento de apoio, com sinais por eixo explicitados nos testes.
- Biapoiada: v(L/2)=5qL⁴/(384EI), reações −qL/2, V linear e M parabólico.
- Bi-engastada: v(L/2)=qL⁴/(384EI), reações −qL/2, momentos de engaste de módulo |q|L²/12.
- Pórtico com liberação de rotação na ponta apoiada: reações 5|q|L/8 e 3|q|L/8; momento na liberação zero.
- Balanço ligado a barra axial vertical: compatibilidade independente v=v_livre/[1+k_axial·L³/(3EI)], incluindo contraste elevado de rigidez.
- Peso isolado de teste: ρ=1000 kg/m³, g=10 m/s², pórtico A=0,01 m²/L=2 m e axial A=0,001 m²/L=1 m: massa **21 kg**, peso total **210 N**, flecha de ponta composta de qL⁴/(8EI) e PL³/(3EI).

Testes incluem sinais ±q, superposição/inversão/cancelamento, unidades, forças longitudinais, dois planos de flexão, elemento inclinado, giro local de 90° com Iy≠Iz, continuidade de peça segmentada, liberação, instabilidade, densidade incompleta e cargas contraditórias. O teste de rotação inicialmente forneceu escalares NumPy em vez de números JSON nativos; a rejeição foi correta e o fixture foi corrigido para float, sem relaxar validação.

Exemplo de cobertura: 132 nós, 207 peças, 243 segmentos, 36 axiais, hipóteses sintéticas da Missão 16. Densidade **1000 kg/m³ e g=(0,0,−10)** são valores sintéticos explicitamente apresentados; não são default de aço/obra. Uma terça recebe −0,1 kN/m global em Z no caso TESTE. Combinações TOTAL, PESO e INVERSO-TOTAL permitem conferir superposição. Massa **4556,486694873053 kg**, 720 graus livres, condição escalada ≈27255,74. No processo protegido: solver ≈2,203 s, parede ≈4,210 s, saída 1.304.092 bytes, equilíbrio relativo ≈8,16e−15. Valores medidos, não garantia universal de desempenho.

Erros absolutos nas flechas analíticas registrados: balanço 0; biapoiada 1,6941e−21 m; bi-engastada 1,2706e−21 m. Referências e resultados em `validation/mission17/loading-reference.json`; fixture compilado pelo adaptador TS em `engine/examples/mixed-loaded-roof.json`.

## Cobertura, resistência e limites

**Etapa de cobertura parcial:** formulário/contrato registra kN/m², projeção horizontal/superfície inclinada, direção unitária, caso, fonte/revisão e caminho de transmissão. Não foi implementado um particionador tributário confiável nesta missão. Qualquer ação por área cadastrada bloqueia a automação/cálculo com `ROOF_LOAD_PATH_PENDING`, evitando ignorá-la ou inventar associação com terças. Conversão automática de área para elementos e preparação completa de parâmetros de vento ficam pendentes. Vento não é calculado.

**Resistência:** arquitetura/cadastro separado por peça registra família real, fy/fu, comprimentos de flambagem Y/Z, contenção lateral, propriedades adicionais Wy/Wz, fontes/revisão e referência normativa. Não altera a matriz. Diagnósticos identificam pendências e fu<fy; sempre `not_verified`, `approved=false`. Não foi implementada uma verificação resistente, por falta de texto normativo/cláusulas/examples homologados. Pesquisa das cinco normas e limites de acesso em [BASE-NORMATIVA-MISSAO-17.md](BASE-NORMATIVA-MISSAO-17.md).

Limites protegidos anteriores preservados: 150 nós, 320 segmentos, 10 casos/combinações, entrada 500000 bytes, saída 2000000 bytes, 20 s, concorrência 1 e memória 768 MiB verificada no Windows antes de importar dependências. 640 cargas uniformes manuais no contrato; saídas grandes demais falham sem sucesso parcial. Apoios/rotações/liberações fora do domínio anterior continuam recusados; não introduzimos rigidez/vínculos para resolver mecanismos. Linux/Vercel não homologados nesta sessão; endpoint local segue restrito a desenvolvimento/loopback. Não há deformada, PDF avançado, preços/otimização, vento automático, dimensionamento ou autorização para fabricação.

## Validação

Baseline direcionada: 54/54 testes do motor misto herdado. Testes locais reais usam Python 3.12.10, NumPy 2.5.4, SciPy 1.18.1, PyNiteFEA 3.2.1; BLAS/OMP/MKL com uma thread. Resultados matemáticos não são mocks.

| Comando/ensaio | Resultado | Evidência e limite |
| --- | --- | --- |
| `python -m pip check` | Aprovado | Dependências reais consistentes, sem alteração de versões/lockfiles |
| `python engine/validate.py --output-dir docs/validation/mission17/python` | Aprovado | **1425 testes**, 0 falhas/erros/skips, incluindo 22 casos novos de cargas; campanha herdada de **1000 comparações** e benchmarks 2D/3D aprovados |
| `python engine/audit_loading.py` | Aprovado | Soluções analíticas independentes, peso isolado e cobertura no worker real protegido; `loading-reference.json` |
| `pnpm typecheck` | Aprovado | 0 erros, também repetido após ajustes finais do formulário |
| `pnpm lint` | Aprovado com aviso herdado | 0 erros; 1 warning de dependência `envelope` no visualizador anterior |
| `pnpm test` | Aprovado | **172 testes**, 0 falhas; adaptação SI, backup, obsolescência, densidade/contradições, processo real e massa adulterada recusada |
| `pnpm exec vitest run src/lib/exports/cad.test.ts` + `python tests/verify_dxf.py` | Aprovado | CAD regenerado isoladamente; **130 linhas 3D**, mm, 0 erros ezdxf; execução antes de o Playwright limpar artefatos |
| `pnpm test:e2e` | Aprovado | **56 testes**, 0 falhas/skips/flaky; **201,87 s**; fluxo novo real em 375/1440 px, seleção/rastreabilidade, exportação, inversão e invalidação por densidade |
| `pnpm build` | Aprovado | Build otimizado, TypeScript, geração de páginas/rotas concluídos; servidor dev encerrado antes do build |
| Linux, CI remota e Vercel | Não homologados nesta sessão | Não se usam resultados remotos não executados como evidência; sem deploy ou alteração de runners |

Regressões herdadas cobrem criação rápida, Perfis 3D, Acabado, quantitativos/orçamento, persistência/backups, PDF/XLSX/DXF, mobile/desktop e os motores anteriores. Não houve nova implementação comercial. A evidência se limita às suítes executadas, sem alegar revisão manual exaustiva de cada projeto real.

Relatórios brutos em `docs/validation/mission17/`: JUnit/JSON da validação Python, Vitest, Playwright, TypeScript, lint, DXF, build e referências. O PowerShell inclui metadados `NativeCommandError` ao redirecionar o cabeçalho do pnpm escrito em stderr; os exit codes finais dos comandos aprovados foram zero. O arquivo `dxf-artifact-ordering-failure.txt` preserva a falha real inicial de artefato ausente. Não foi necessário repetir a suíte completa do navegador para obter aprovação.

Falhas registradas: um fixture Python inicialmente continha tipos NumPy, corretamente recusados; correção somente no teste. O primeiro DXF pós-Vitest falhou por arquivo ausente durante limpeza concorrente do Playwright; o teste CAD foi reexecutado isoladamente e o ezdxf aprovou 130 linhas 3D/mm sem erros antes da suíte completa. Nenhuma falha foi transformada em sucesso fictício.

**Veredito: núcleo principal APROVADO COM RESSALVAS para análise experimental local no Windows.** Peso próprio e cargas uniformes estão integrados e verificáveis; a missão ampla permanece parcial nas etapas de conversão de ações por área e verificação resistente normativa, explicitamente bloqueadas/pendentes. Sem dimensionamento aprovado ou autorização para fabricação. Revisar o PR draft antes de qualquer integração/deploy.
