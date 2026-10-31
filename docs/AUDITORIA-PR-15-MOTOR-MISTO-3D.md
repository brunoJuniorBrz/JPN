# Auditoria rigorosa do PR #15 — motor misto frame/axial 3D

**Veredito: APROVADO COM RESSALVAS para o núcleo experimental isolado, após as correções desta auditoria.** Não aprova o cálculo de uma obra, integração com a interface/HTTP, dimensionamento, fabricação ou segurança estrutural. Sem merge e sem deploy.

Data: 31/10/2026. Branch `feat/experimental-mixed-frame-axial-3d`; commit inicial `1080dfacd63feb3b233b0bcea9ab0262b968a2e4`, base do PR `967481df116778556519008c800bbcf272c2ecbe`. Snapshot de `engine/` conferido por SHA e mantido na cópia isolada `.tools/mixed3d-audit`. Não foram usados os substitutos de helpers da validação preliminar do autor.

## Ambiente e método

Windows 10, Python **3.12.10**, NumPy **2.5.4**, SciPy **1.18.1**, PyNiteFEA **3.2.1**, pytest **9.2.0**. Dependências reais do projeto, com `pip check` aprovado. Engine instalado editável com `--no-build-isolation --no-deps`, sem trocar versões. BLAS limitado a uma thread (`OPENBLAS_NUM_THREADS=1`, `OMP_NUM_THREADS=1`, `MKL_NUM_THREADS=1`).

Sequência: baseline real → leitura da API instalada → referências independentes e casos adversariais → registro das falhas → correções mínimas → testes direcionados → validação Python completa. Uma falha adicional real da API foi identificada depois da primeira validação completa; a proteção correspondente justificou uma segunda e última execução da suíte afetada. Não foram executados build/UI, deploy ou investigação de GitHub Actions.

## Achados por gravidade

| ID | Gravidade | Defeito demonstrado | Correção / consequência |
| --- | --- | --- | --- |
| A1 | Alta — validade da transformação | PyNite 3.2.1 classifica eixos com `math.isclose` sobre coordenadas absolutas. Elementos quase alinhados, transladados para X≈9000 m, podem gerar base local não ortogonal. Foram reproduzidos casos **frame e axial** que o motor aceitava. Uma reação axial transversal passou de 9,96264e−6 N para zero apenas pela translação da origem, ainda com resíduo global/nodal 2,49e−9, inferior ao corte 1e−8. | **Corrigido por recusa segura:** verificar `R Rᵀ=I` com atol=1e−12, rtol=0, em cada elemento real preparado. Base não ortogonal gera `INVALID_GEOMETRY` antes de montar/resolver. Não se alteram os eixos da biblioteca, coordenadas, apoios ou rigidezes para obter resultado. |
| M1 | Média — validação de resultados | A recuperação só verificava resultantes externas globais e consistência axial EA/L. Um teste com **corrupção controlada após uma solução real** alterou DY de B em 1e−4 m, preservando extensão da mola vertical e reações armazenadas; o código anterior devolvia sucesso, embora esforços dos membros não equilibrassem os nós. Isso demonstra ausência de proteção, não um erro espontâneo atribuído ao PyNite. | **Corrigido:** reunir ações globais dos frames e axiais em cada nó e comparar com carga+reação, incluindo momentos. Tolerância de aceitação 1e−8 preservada. O caso agora retorna `EQUILIBRIUM_FAILURE`. |
| B1 | Baixa — contrato de entrada | `frames.update` ocorria antes da validação de `start/end`. Extremo do frame como lista provocava `TypeError` não estruturado em vez de `AnalysisError`. | **Corrigido:** classificar nós de frame somente após validar IDs/referências. Casos de extremo inicial/final inválidos retornam `INVALID_INPUT`. |

As únicas mudanças de produção foram em `mixed3d.py`: ordem da classificação de nós, guarda da base local e verificação nodal. Não foram alterados os contratos `jpn.frame3d/1` e `jpn.truss3d/1`, o formato `jpn.mixed3d/1`, os solvers anteriores, os limites espectrais, as tolerâncias existentes ou os vínculos declarados. As demais mudanças são referências, testes, benchmark e documentação.

### Histórico das falhas, sem omissão

- Baseline real: **21/21**, zero skips. Os passes provisórios do autor com PyNite ausente não foram usados como evidência.
- Primeira bateria adicional: **5 falhas/8 passes**. Duas falhas eram de uma fixture de contraste cuja área havia ficado abaixo do domínio permitido. Corrigiu-se a combinação E/A da **fixture**, mantendo a mesma rigidez física pretendida e os limites do produto; não se afrouxou validação.
- Bateria com fixtures válidas antes das correções M1/B1: **3 falhas/10 passes**, correspondentes à corrupção não detectada e aos dois extremos inválidos.
- Na ampliação, uma expectativa de `ILL_CONDITIONED` para seção fraca estava incorreta: o sistema permanecia bem condicionado após escala e apoiado pela barra axial. O solver não foi mudado para satisfazer essa expectativa. O caso foi substituído por direções comprovadamente quase dependentes; relatório da expectativa incorreta preservado.
- Após M1/B1: **52 testes** e primeira suíte completa com **1392 testes**, aprovados.
- Descoberta A1: os **dois casos reais de API falharam** no teste de recusa antes da proteção. Após a proteção: **54 testes direcionados** e **1394 testes completos**, aprovados. Nenhum caso foi removido por falhar ou marcado como skip; a seleção de dois casos API foi seguida pela execução de toda a suíte final.

## API PyNiteFEA 3.2.1 conferida

Foram lidas as implementações instaladas de `FEModel3D.add_spring`, `FEModel3D.Ke`, `Analysis._prepare_model`, `Member3D.T/Ke/f` e `Spring3D.ke/Ke/f/axial`.

- `add_spring(..., tension_only=False, comp_only=False)` representa uma barra bilateral: não é cabo unilateral nem pórtico com rigidezes fictícias.
- Para d=(xj−xi)/L e b=[−d,+d], o bloco das seis translações de `Spring3D.Ke` coincide com `(EA/L) bᵀb` quando a base local é válida. As seis linhas/colunas rotacionais são **exatamente zero** no teste real da biblioteca.
- `FEModel3D.Ke` inclui os blocos de springs; um modelo contendo somente a spring foi preparado e sua matriz global comparada diretamente à matriz do elemento e à fórmula independente.
- `Spring3D.axial(combo)` retorna a ação axial local na extremidade inicial. A conversão **N positivo em tração = −spring.axial(combo)** foi verificada nos dois sinais. O motor também confere N contra EAΔL/L.
- Frames usam `add_member`, propriedades isotrópicas declaradas e releases explícitos. Ações locais são transformadas por `Tᵀ` para equilíbrio nodal. Os testes de referência usam ações globais obtidas de estática e convenções de eixos explícitas, sem reutilizar matrizes de rigidez do PyNite.
- A API não é assumida válida apenas por sua versão: a guarda A1 impede usar uma transformação não ortogonal produzida pela própria biblioteca.

### Evidência numérica da origem distante

Frame A=(0,0,0)→B=(2,0,0) m; axial B→C=(2+1e−8,1,0) m; força em B de −1000 N em Y, apoios declarados da fixture. A origem foi transladada em +9000 m em X, sem mudar materiais, forças, comprimentos ou vínculos.

| Componente | Próximo da origem | Origem transladada, antes da guarda |
| --- | ---: | ---: |
| RX no apoio C | +9,96264003908e−6 N | 0 N |
| RY no apoio C | +996,264009963 N | +996,264009963 N |
| Resíduo relativo global/nodal | 5,68e−17 | 2,49e−9 |

O erro pequeno na resultante global não garante correção de cada componente. A origem transladada continua dentro do limite contratual de coordenadas. Depois da correção, essa base é recusada; o modelo próximo da origem permanece calculável. O mesmo problema de classificação foi demonstrado em frame quase vertical. A biblioteca não foi modificada nem substituída.

## Graus de liberdade, estabilidade e ligações

Nós tocados por frame conservam os seis graus, mesmo que haja releases. Rotações de nós exclusivamente axiais não existem no modelo mecânico: somente seus slots inativos na API são eliminados. A nulidade dos blocos rotacionais da spring prova que essa eliminação não acrescenta energia ou apoio translacional.

A referência da junta axial C **sem qualquer apoio translacional em C** tem nove graus livres: seis em B, que toca frame, mais três em C, apenas axial. Translações de C, rotações não nulas de B, reações e axiais conferiram com estática/compatibilidade independentes. Rotações e momentos de reação de C permaneceram nulos. Declarar momento ou apoio rotacional em nó apenas axial é recusado como `INACTIVE_DOF`.

Verificados: ausência de apoios, translação transversal livre de nó axial, rotação de nó com frame inteiramente liberada, torção liberada nos dois extremos, seção fraca com apoio axial, direções quase dependentes, nós coincidentes/órfãos, contatos sem nó, referências inválidas, apoios duplicados e saída não finita. Nenhum mecanismo foi estabilizado por mola ou vínculo artificial.

Uma rótula de flexão explicitamente declarada na base do balanço foi comparada com a solução de movimento rígido do trecho: toda a carga vertical vai à barra axial, ações do frame próximas de zero, uBz=−1000/ka e θBy=−uBz/L. Os resultados passaram. Rotações livres sem rigidez em nós que ainda tocam frames continuam sendo recusadas; não são suprimidas para fabricar estabilidade.

## Referências analíticas independentes

`engine/tests/mixed3d_reference.py` utiliza apenas os dados das fixtures: não chama o solver misto nem importa matrizes ou recuperação de esforços do PyNite para construir a referência.

### Balanço com barra axial em paralelo

L=2 m, E=200 GPa, Iy=Iz=1e−5 m⁴. Para força Fz no extremo B, sem momento aplicado:

```
kf = 3 EI/L³
ka = EA_axial/L_axial
uBz = Fz/(kf+ka)
θBy = −3 uBz/(2L)
N_axial = −ka uBz
F_frame = kf uBz
RAz = −F_frame; MAy = L F_frame
```

Foram conferidos deslocamento, rotação, axial, reação de força, momento de reação e **as 12 ações locais do frame**, com ambos os sinais e ka=2e−7, 2e8 e 1e16 N/m. O contraste coberto é de 23 ordens entre os valores de ka; não foi necessário mudar o solver PyNite ou introduzir apoios adicionais.

### Pórtico espacial não coplanar com três escoras

Cadeia rígida A=(0;0;0), B=(2;0;0), C=(2;1,5;0), D=(2;1,5;1) m, usando ponto e vírgula para separar componentes. Três escoras axiais ligam D a E=(3,2;1;0,3), F=(1;2,7;2) e G=(0,5;0,7;0,6) m, com translações das âncoras explicitamente fixas. As quatro primeiras posições não são coplanares.

A referência por **método das forças / Castigliano / trabalho virtual** integra os produtos de esforços unitários:

```
Fij = ∫[Ni Nj/(EA) + Ti Tj/(GJ) + Mbi·Mbj/(EI)] dx
Caxial = diag(Laxial/(EAaxial))
(Caxial + Qᵀ F Q) N = −Qᵀ F P
u = F(P + Q N)
```

A integração de dois pontos Gauss é exata para os polinômios quadráticos de energia deste caso. Não se monta rigidez de frame na referência. O caso é prismático com Iy=Iz=2e−5 m⁴ e J=4e−5 m⁴, portanto a referência é independente da orientação local de flexão. E/G declarados são os da fixture. Carga em D: (300,−200,−700) N e momentos (50,−30,40) N·m.

Além dos deslocamentos e rotações de todos os nós do pórtico, foram conferidos os axiais de todas as escoras, reações de forças/momentos e as 12 ações de cada frame, por equilíbrio do trecho a jusante. Energia: `Uframe + Uaxiais = P·u/2`.

| Comparação | Maior diferença absoluta medida |
| --- | ---: |
| Translações | 1,46e−17 m |
| Rotações | 1,25e−17 rad |
| Componentes de reações de força/momento na base | 1,19e−11, nas unidades N ou N·m de cada componente |
| Axiais das escoras | 2,22e−10 N |
| Componentes de ações dos frames | 7,72e−11, nas unidades N ou N·m de cada componente |
| Energia | 5,24e−15 J |

Axiais de referência: −2738,01958657; −1806,89678357; −1112,06597330 N. Os vetores completos, reações e hash estão no JSON de evidências; não se comparam apenas resultantes globais.

O teste com dois casos e três combinações verifica também proporcionalidade de translações, rotações, reações, momentos, axiais e todas as ações de frames, incluindo coeficientes negativos. Uma transformação rígida arbitrária de coordenadas, forças e momentos, com inversão das barras axiais e reordenação dos nós/membros, preservou as respostas físicas nos casos com bases locais válidas.

### Junta puramente axial livre ligada a frame

Frame A=(0,0,0)→B=(2,0,0) m; nó C=(3,1,1) m ligado axialmente a B e às âncoras D=(4,2,0), E=(2,2,2). C recebe (300,−200,−700) N e tem as três translações livres.

Estática em C determina os três N por `ΣNi di + PC=0`; a resposta do balanço A→B decorre das fórmulas independentes de axial/flexão. A compatibilidade de cada barra `di·(uend−uC)=Ni Li/(Ei Ai)` determina uC. Resultados:

- Axiais: **−346,410161514; −433,012701892; +433,012701892 N**, exercitando compressão e tração simultâneas.
- uC≈(−2,66117147614e−4; 0; −2,72612338142e−4) m; erro máximo **1,52e−18 m**.
- As rotações de B são físicas e não foram suprimidas; C tem `active_rotations=false`, zero reação rotacional e nenhuma reação translacional inventada.

## Equilíbrio nodal e tolerâncias

Para cada combinação, as ações globais de frames são `Tᵀ f_local`. Axiais positivos em tração contribuem −Nd no início e +Nd no fim para o vetor de ações aplicadas ao elemento. Somam-se seis componentes por nó e comparam-se com cargas ponderadas+reações.

Momentos são convertidos a forças equivalentes dividindo pelo comprimento característico `span` usado no diagnóstico global. O maior resíduo nodal é normalizado pela soma das normas dos vetores internos/externos escalados, conforme o padrão do motor espacial anterior. `equilibrium.relative_residual` passa a registrar o máximo entre resíduos globais e nodais; a forma do resultado não mudou. **Corte existente 1e−8 preservado**. Os testes fazem também reconstrução independente de forças/momentos em cada nó, com atol=1e−6 N ou N·m e rtol=1e−8.

As referências de deslocamento/rotação usam atol=1e−11 nas unidades correspondentes e rtol=1e−8; os casos fechados do balanço usam rtol=1e−7 ou mais restrito. Não se ampliaram tolerâncias para mascarar erro. O diagnóstico espectral continua em matriz diagonalmente equilibrada, com limiar de mecanismo por εmáquina e condição máxima 1e10.

## Comandos executados e regressões

| Comando | Resultado | Aprovados | Falhas finais | Observações |
| --- | --- | ---: | ---: | --- |
| `python -m pip check` | PASSOU | Dependências reais | 0 | Sem requisitos quebrados. |
| `python -m pytest engine/tests/test_mixed3d.py -q` — baseline | PASSOU | 21 | 0 | Nenhum skip, antes das correções. |
| `python -m pytest engine/tests/test_mixed3d_audit.py -q` — vermelho com fixtures válidas | FALHOU | 10 | 3 | M1/B1 reproduzidos, antes das correções. |
| `python -m pytest engine/tests/test_mixed3d_audit.py -q -k near_axis` — vermelho API | FALHOU | 0 | 2 | A1 em frame e axial reais; seleção direcionada seguida da suíte completa. |
| `python -m pytest engine/tests/test_mixed3d.py engine/tests/test_mixed3d_audit.py -q` — final | PASSOU | 54 | 0 | Inclui todas as referências e casos adversariais; 0,92 s. |
| `python engine/validate.py --output-dir ../mixed-final-python` | PASSOU | 1394 + campanha de 1000 casos 2D | 0 | Zero erros/skips; pytest 29,89 s; validação total 45,11 s. |
| `python engine/audit_mixed3d.py` | PASSOU | Referências + benchmark espacial | 0 | BLAS=1; invólucro de auditoria com timeout de 30 s. |

Os 1394 testes já incluem os 54 testes mistos; os **1340 testes anteriores** e a campanha adicional de 1000 casos passaram. Solvers 2D, pórtico 3D, axial 3D, adaptadores e serviços anteriores foram preservados byte a byte. A repetição da validação completa foi motivada pela correção A1 identificada após a primeira rodada de 1392 passes, não por tentativas de ignorar falhas.

## Desempenho e limites

Benchmark explícito: **98 nós, 133 frames, 36 axiais (169 elementos), 49 bases engastadas, 294 graus livres**. Grade espacial de colunas de 3 m e vigas em duas direções com diagonais axiais, propriedades sintéticas e forças/momentos nodais declarados. Nenhuma conexão ou condição de apoio foi inferida de um projeto real.

| Medida final | Valor |
| --- | ---: |
| Tempo com tracemalloc | 2,3004 s |
| Pico Python rastreado | 5.694.521 bytes |
| Pico RSS do processo de auditoria | 96.632.832 bytes |
| Condição escalada | 3897,390344 |
| Resíduo relativo global/nodal | 3,73e−15 |
| Entrada/saída JSON | 53.119 / 74.909 bytes |

Hash da fixture: `960a44019afeca03298c2c748342371f1d4d490756fb0156eaeca3af6c593775`. Valores observados neste Windows com BLAS=1, sem garantia para todos os modelos/hardwares.

Permanecem 150 nós, 320 membros, 50 materiais/seções, 150 apoios, 10 casos/combinações e 500 cargas. O núcleo é uma função local: **não possui executor próprio com timeout/RSS rígidos ou limite HTTP**. O timeout de 30 s citado é apenas o invólucro do experimento; antes de qualquer exposição pública será necessário executor protegido. Não foi benchmarkado todo o teto de entidades ou todas as topologias. Limites operacionais de componentes de deslocamento/rotação e deformação axial permanecem os do protótipo; não são verificações normativas.

## Ressalvas para revisão final

1. A1 é recusado no novo motor misto, não corrigido na biblioteca. Uma geometria física válida pode ser recusada em certas origens quase alinhadas; o motor não translada nem modifica eixos automaticamente. Qualquer política de referenciamento coordenado deve ser uma etapa explícita futura. A guarda não foi propagada aos motores antigos nesta auditoria; testes de regressão aprovados não provam a API correta para todas as geometrias nesses consumidores.
2. Testes locais em Windows. Linux, produção, UI, deploy, adapter JPN→misto e modelo de obra não foram exercitados. Não houve modificação de frontend nem merge.
3. Rotações sem rigidez de nós que tocam frames não são eliminadas automaticamente; essas combinações de releases permanecem recusadas. Sem conexões semirrígidas, momentos em nós puramente axiais, cabos unilaterais, recalques, peso próprio ou vento automático.
4. Sem flambagem, P-Delta, dinâmica, resistência, ABNT ou aprovação de fabricação. Compressão axial de primeira ordem não comprova capacidade resistente.

Relatórios brutos, todas as fases vermelhas, expectativas de fixtures corrigidas, referências numéricas, benchmark, XML e checksums: `docs/validation/2026-10-31-mixed3d-audit/`. Preservados todos os casos que falhavam; nenhuma correção acrescentou rigidez ou vínculos para obter aprovação.

**Conclusão: APROVADO COM RESSALVAS para continuar como motor misto experimental isolado com as correções A1/M1/B1. Não está homologado para uso estrutural de uma obra ou exposição pública. Sem merge, deploy ou alteração da interface.**
